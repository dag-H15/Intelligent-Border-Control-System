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
    return { traveler: null, score: 0, reason: 'No enrolled biometrics found in database.' };
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

  // AI returned a specific rejection reason (e.g. not a fingerprint image)
  const aiReason: string = (matchResult as any).reason ?? '';

  if (!matchResult.matchFound || !matchResult.matchedTravelerId) {
    return { traveler: null, score: matchResult.score ?? 0, reason: aiReason };
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

  if (!traveler) return { traveler: null, score: 0, reason: 'Matched traveler ID not found in database.' };

  return {
    traveler,
    score: matchResult.score,
    reason: '',
  };
}


