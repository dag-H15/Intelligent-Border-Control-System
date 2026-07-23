import "dotenv/config";
import { Gender, PrismaClient, Role } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

type SeedUser = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type SeedTraveler = {
  fan: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  nationality: string;
  photo: string | null;
};

// One test account per role so you can log in and exercise every endpoint.
// CHANGE THESE PASSWORDS before using this anywhere near production.
const SEED_USERS: SeedUser[] = [
  { name: "System Admin", email: "admin@bordercontrol.test", password: "Admin@12345", role: Role.ADMIN },
  { name: "Test Supervisor", email: "supervisor@bordercontrol.test", password: "Supervisor@12345", role: Role.SUPERVISOR },
  { name: "Test Officer 1", email: "officer1@bordercontrol.test", password: "Officer@12345", role: Role.OFFICER },
  { name: "Test Officer 2", email: "officer2@bordercontrol.test", password: "Officer@12345", role: Role.OFFICER },
];

const SEED_TRAVELERS: SeedTraveler[] = [
  {
    fan: "FAN-100001",
    fullName: "Amina Yusuf",
    dateOfBirth: "1993-04-12",
    gender: Gender.FEMALE,
    nationality: "Kenyan",
    photo: null,
  },
  {
    fan: "FAN-100002",
    fullName: "Daniel Mensah",
    dateOfBirth: "1988-09-21",
    gender: Gender.MALE,
    nationality: "Ghanaian",
    photo: null,
  },
  {
    fan: "FAN-100003",
    fullName: "Lina Haddad",
    dateOfBirth: "1996-01-08",
    gender: Gender.FEMALE,
    nationality: "Moroccan",
    photo: null,
  },
  {
    fan: "FAN-100004",
    fullName: "Peter Okeke",
    dateOfBirth: "1990-11-30",
    gender: Gender.MALE,
    nationality: "Nigerian",
    photo: null,
  },
  {
    fan: "FAN-100005",
    fullName: "Sara Njoroge",
    dateOfBirth: "1998-06-15",
    gender: Gender.FEMALE,
    nationality: "Kenyan",
    photo: null,
  },
];

async function main() {
  const createdUsers: Record<Role, number[]> = {
    [Role.ADMIN]: [],
    [Role.SUPERVISOR]: [],
    [Role.OFFICER]: [],
  };

  for (const u of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`Skipping ${u.email} - already exists`);
      createdUsers[u.role].push(existing.id);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);

    const createdUser = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
      },
    });

    createdUsers[u.role].push(createdUser.id);

    console.log(`Created ${u.role}: ${u.email} / ${u.password}`);
  }

  const officerIds = createdUsers[Role.OFFICER];
  if (officerIds.length === 0) {
    throw new Error("At least one officer account is required to seed biometric records.");
  }

  for (let index = 0; index < SEED_TRAVELERS.length; index += 1) {
    const travelerData = SEED_TRAVELERS[index];
    const existingTraveler = await prisma.traveler.findUnique({ where: { fan: travelerData.fan } });

    let traveler = existingTraveler;
    if (!traveler) {
      traveler = await prisma.traveler.create({
        data: {
          fan: travelerData.fan,
          fullName: travelerData.fullName,
          dateOfBirth: new Date(travelerData.dateOfBirth),
          gender: travelerData.gender,
          nationality: travelerData.nationality,
          photo: travelerData.photo,
        },
      });

      console.log(`Created traveler: ${traveler.fan} / ${traveler.fullName}`);
    } else {
      console.log(`Skipping traveler ${travelerData.fan} - already exists`);
    }

    const existingBiometric = await prisma.biometric.findUnique({ where: { travelerId: traveler.id } });
    if (existingBiometric) {
      console.log(`Skipping biometric for ${traveler.fan} - already exists`);
      continue;
    }

    const capturedBy = officerIds[index % officerIds.length];
    await prisma.biometric.create({
      data: {
        travelerId: traveler.id,
        fingerprintTemplate: Buffer.from(`fingerprint-template-${traveler.fan}`),
        irisTemplate: Buffer.from(`iris-template-${traveler.fan}`),
        capturedBy,
      },
    });

    console.log(`Created biometric templates for ${traveler.fan}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });