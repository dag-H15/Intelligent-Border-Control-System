import prisma from "../config/prisma";
import { identifyBiometricTemplate } from "./aiClient";
import { getSystemSettings } from "./settingsService";

export async function findTravelerByFan(fan: string) {
  return prisma.traveler.findUnique({
    where: { fan },
    select: {
      id: true,
      fan: true,
      fullName: true,
      dateOfBirth: true,
      gender: true,
      nationality: true,
      photo: true,
      enrollmentStatus: true,
      alertStatus: true,
      alertReason: true,
    },
  });
}

export async function identifyTravelerByFingerprint(fingerprintSource: Buffer | string) {
  const biometrics = await prisma.biometric.findMany({
    select: {
      travelerId: true,
      fingerprintTemplate: true,
    },
  });

  if (!biometrics || biometrics.length === 0) {
    return null;
  }

  const settings = await getSystemSettings().catch(() => null);
  const threshold = settings?.approvalThreshold ?? 85;

  const candidates = biometrics.map((b) => ({
    travelerId: b.travelerId,
    template: b.fingerprintTemplate,
  }));

  const isBuffer = Buffer.isBuffer(fingerprintSource);
  const matchResult = await identifyBiometricTemplate({
    biometricType: "fingerprint",
    imageBuffer: isBuffer ? (fingerprintSource as Buffer) : undefined,
    imageData: !isBuffer ? (fingerprintSource as string) : undefined,
    candidates,
    threshold,
  });

  if (!matchResult.matchFound || !matchResult.matchedTravelerId) {
    return null;
  }

  const traveler = await prisma.traveler.findUnique({
    where: { id: matchResult.matchedTravelerId },
    select: {
      id: true,
      fan: true,
      fullName: true,
      dateOfBirth: true,
      gender: true,
      nationality: true,
      photo: true,
      enrollmentStatus: true,
      alertStatus: true,
      alertReason: true,
    },
  });

  if (!traveler) return null;

  return {
    traveler,
    score: matchResult.score,
  };
}

