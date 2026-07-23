import prisma from "../config/prisma";
import { Gender } from "../../generated/prisma";

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
  fingerprintTemplate: string; // base64-encoded template bytes
  irisTemplate: string; // base64-encoded template bytes
  capturedBy: number; // officer's user id, from req.user
}

/**
 * Step 1 of enrollment: register the traveler's demographic info.
 * enrollmentStatus starts as PENDING — the traveler is not considered
 * fully enrolled until biometric templates are captured (see below).
 */
export async function createTraveler(input: CreateTravelerInput) {
  const { fan, fullName, dateOfBirth, gender, nationality, photo } = input;

  const existing = await prisma.traveler.findUnique({ where: { fan } });
  if (existing) {
    const error = new Error("A traveler with this FAN is already registered");
    (error as any).statusCode = 409;
    throw error;
  }

  return prisma.traveler.create({
    data: {
      fan,
      fullName,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      nationality,
      photo,
      enrollmentStatus: "PENDING",
    },
  });
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
  const { fan, fingerprintTemplate, irisTemplate, capturedBy } = input;

  const traveler = await prisma.traveler.findUnique({ where: { fan } });
  if (!traveler) {
    const error = new Error("No traveler found for this FAN. Register demographics first.");
    (error as any).statusCode = 404;
    throw error;
  }

  const fingerprintBuffer = Buffer.from(fingerprintTemplate, "base64");
  const irisBuffer = Buffer.from(irisTemplate, "base64");

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
      enrollmentStatus: "ENROLLED",
      enrollmentDate: new Date(),
    },
  });

  return { biometric, traveler: updatedTraveler };
}