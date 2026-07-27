import prisma from "../config/prisma";

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
    },
  });
}
