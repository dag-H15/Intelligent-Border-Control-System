import prisma from "../config/prisma";
import { Gender } from "../../generated/prisma";
import { extractBiometricTemplate } from "./aiClient";

interface CreateTravelerInput {
  fan: string;
  fullName: string;
  dateOfBirth: string | Date;
  gender: Gender;
  nationality: string;
  photo?: string;
}

interface CaptureBiometricInput {
  fan: string;
  fingerprintImage: Buffer | string;
  irisImage: Buffer | string;
  capturedBy: number; // officer's user id, from req.user
}

/**
 * Step 1 of enrollment: register the traveler's demographic info.
 * enrollmentStatus starts as DRAFT until biometric templates are captured.
 */
export async function createTraveler(input: CreateTravelerInput) {
  const { fan, fullName, dateOfBirth, gender, nationality, photo } = input;

  const existing = await prisma.traveler.findUnique({ where: { fan } });
  if (existing) {
    if (existing.enrollmentStatus === "DRAFT") {
      return { traveler: existing, resumedDraft: true };
    }

    const error = new Error("A traveler with this FAN is already registered");
    (error as any).statusCode = 409;
    throw error;
  }

  const traveler = await prisma.traveler.create({
    data: {
      fan,
      fullName,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      nationality,
      photo,
      enrollmentStatus: "DRAFT",
    },
  });

  return { traveler, resumedDraft: false };
}

/**
 * Step 2 of enrollment: store the biometric templates produced by the
 * AI service (fingerprint + iris) and mark the traveler ENROLLED.
 *
 * Uses upsert on the 1:1 Biometric relation so this also supports
 * re-enrollment (capturing fresh templates for an already-enrolled
 * traveler), which is why Biometric has an `updatedAt` column.
 */
export async function captureBiometric(input: CaptureBiometricInput) {
  const { fan, fingerprintImage, irisImage, capturedBy } = input;

  const traveler = await prisma.traveler.findUnique({ where: { fan } });
  if (!traveler) {
    const error = new Error("No traveler found for this FAN. Register demographics first.");
    (error as any).statusCode = 404;
    throw error;
  }

  const fingerprintPayload = typeof fingerprintImage === "string" ? fingerprintImage : fingerprintImage.toString("base64");
  const irisPayload = typeof irisImage === "string" ? irisImage : irisImage.toString("base64");

  const fingerprintTemplate = await extractBiometricTemplate({
    biometricType: "fingerprint",
    imageData: fingerprintPayload,
  });
  const irisTemplate = await extractBiometricTemplate({
    biometricType: "iris",
    imageData: irisPayload,
  });

  const fingerprintBuffer = Buffer.from(fingerprintTemplate.template, "base64");
  const irisBuffer = Buffer.from(irisTemplate.template, "base64");

  // Prevent biometric template reuse across different travelers.
  // We check each template independently so a match on either one blocks
  // the enrollment before any biometric record is created or updated.
  const fingerprintMatch = await prisma.biometric.findFirst({
    where: {
      fingerprintTemplate: fingerprintBuffer,
      travelerId: { not: traveler.id },
    },
    select: { id: true },
  });

  const irisMatch = await prisma.biometric.findFirst({
    where: {
      irisTemplate: irisBuffer,
      travelerId: { not: traveler.id },
    },
    select: { id: true },
  });

  if (fingerprintMatch || irisMatch) {
    const error = new Error("Fingerprint or iris template already belongs to another traveler.");
    (error as any).statusCode = 409;
    throw error;
  }

  const biometric = await prisma.biometric.upsert({
    where: { travelerId: traveler.id },
    update: {
      fingerprintTemplate: fingerprintBuffer,
      irisTemplate: irisBuffer,
      capturedBy,
    },
    create: {
      travelerId: traveler.id,
      fingerprintTemplate: fingerprintBuffer,
      irisTemplate: irisBuffer,
      capturedBy,
    },
  });

  const updatedTraveler = await prisma.traveler.update({
    where: { id: traveler.id },
    data: {
      enrollmentStatus: "COMPLETED",
      enrollmentDate: new Date(),
    },
  });

  return { biometric, traveler: updatedTraveler };
}