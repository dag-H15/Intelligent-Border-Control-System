/**
 * seed.ts
 *
 * Populates the database with development/test data.
 *
 * WATCHLIST STATUS NOTICE
 * -----------------------
 * The alertStatus and alertReason fields on Traveler records are used
 * ONLY to simulate an external watchlist/security system response for
 * development and demo purposes.
 *
 * In a real deployment, these values would be supplied by an authorised
 * external watchlist or security service during the FAN/Fayda lookup.
 * The Border Control System itself does NOT manage or edit watchlist status.
 */
import "dotenv/config";
import { AlertStatus, EnrollmentStatus, Gender, PrismaClient, Role } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const SEED_USERS = [
  { name: "System Admin",    email: "admin@bordercontrol.test",      password: "Admin@12345",      role: Role.ADMIN      },
  { name: "Test Supervisor", email: "supervisor@bordercontrol.test",  password: "Supervisor@12345", role: Role.SUPERVISOR },
  { name: "Test Officer 1",  email: "officer1@bordercontrol.test",   password: "Officer@12345",    role: Role.OFFICER    },
  { name: "Test Officer 2",  email: "officer2@bordercontrol.test",   password: "Officer@12345",    role: Role.OFFICER    },
];

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------
const SEED_CHECKPOINTS = [
  { name: "Bole International Airport",  location: "Addis Ababa" },
  { name: "Moyale Border Post",          location: "Moyale"      },
  { name: "Togochale Border Post",       location: "Togochale"   },
  { name: "Galafi Border Post",          location: "Galafi"      },
  { name: "Dewele Border Post",          location: "Dewele"      },
];

// ---------------------------------------------------------------------------
// Travelers
// Includes three watchlist-status demo records (NONE / WARNING / CRITICAL).
//
// DEVELOPMENT NOTE:
//   alertStatus = NONE     → normal traveller; biometric check decides outcome.
//   alertStatus = WARNING  → requires supervisor review regardless of biometric score.
//   alertStatus = CRITICAL → requires supervisor review; treated as highest-priority case.
//
// These statuses SIMULATE what would be returned by an external watchlist
// system in production.  They are not editable through the officer or
// supervisor UI.
// ---------------------------------------------------------------------------
const SEED_TRAVELERS = [
  // --- Normal travellers (alertStatus = NONE) ---
  {
    fan: "FAN-100001",
    fullName: "Amina Yusuf",
    dateOfBirth: "1993-04-12",
    gender: Gender.FEMALE,
    nationality: "Kenyan",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },
  {
    fan: "FAN-100002",
    fullName: "Daniel Mensah",
    dateOfBirth: "1988-09-21",
    gender: Gender.MALE,
    nationality: "Ghanaian",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },
  {
    fan: "FAN-100003",
    fullName: "Lina Haddad",
    dateOfBirth: "1996-01-08",
    gender: Gender.FEMALE,
    nationality: "Moroccan",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },
  {
    fan: "FAN-100004",
    fullName: "Peter Okeke",
    dateOfBirth: "1990-11-30",
    gender: Gender.MALE,
    nationality: "Nigerian",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },
  {
    fan: "FAN-100005",
    fullName: "Sara Njoroge",
    dateOfBirth: "1998-06-15",
    gender: Gender.FEMALE,
    nationality: "Kenyan",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },

  // --- WARNING traveller (DEVELOPMENT / DEMO — simulates external watchlist) ---
  {
    fan: "FAN-200001",
    fullName: "Marcus Osei",
    dateOfBirth: "1985-03-22",
    gender: Gender.MALE,
    nationality: "Ghanaian",
    photo: null,
    alertStatus: AlertStatus.WARNING,
    alertReason:
      "Requires additional inspection. [DEVELOPMENT: simulated external watchlist response]",
  },

  // --- CRITICAL traveller (DEVELOPMENT / DEMO — simulates external watchlist) ---
  {
    fan: "FAN-300001",
    fullName: "Hana Tesfaye",
    dateOfBirth: "1992-11-05",
    gender: Gender.FEMALE,
    nationality: "Ethiopian",
    photo: null,
    alertStatus: AlertStatus.CRITICAL,
    alertReason:
      "Subject requires immediate supervisor review upon entry. [DEVELOPMENT: simulated external watchlist response]",
  },

  // --- Additional test travelers with specific alert statuses ---
  {
    fan: "FAN-400001",
    fullName: "Meron Tadesse",
    dateOfBirth: "1995-07-18",
    gender: Gender.FEMALE,
    nationality: "Ethiopian",
    photo: null,
    alertStatus: AlertStatus.WARNING,
    alertReason:
      "Requires additional inspection and documentation review. [DEVELOPMENT: simulated external watchlist response]",
  },
  {
    fan: "FAN-500001",
    fullName: "Dawit Alemayehu",
    dateOfBirth: "1987-03-25",
    gender: Gender.MALE,
    nationality: "Ethiopian",
    photo: null,
    alertStatus: AlertStatus.CRITICAL,
    alertReason:
      "Restricted entry - requires supervisor authorization and enhanced security review. [DEVELOPMENT: simulated external watchlist response]",
  },
  {
    fan: "FAN-600001",
    fullName: "Alemayehu Bekele",
    dateOfBirth: "1991-12-10",
    gender: Gender.MALE,
    nationality: "Ethiopian",
    photo: null,
    alertStatus: AlertStatus.NONE,
    alertReason: null,
  },
];

// ---------------------------------------------------------------------------
async function main() {
  // --- Users ---
  const officerIds: number[] = [];

  for (const u of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`Skip user ${u.email} — already exists`);
      if (u.role === Role.OFFICER) officerIds.push(existing.id);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, passwordHash, role: u.role },
    });
    console.log(`Created ${u.role}: ${u.email}`);
    if (u.role === Role.OFFICER) officerIds.push(created.id);
  }

  if (officerIds.length === 0) {
    throw new Error("No officer accounts found — cannot seed biometrics.");
  }

  // --- Checkpoints ---
  for (const cp of SEED_CHECKPOINTS) {
    const existing = await prisma.checkpoint.findUnique({ where: { name: cp.name } });
    if (existing) {
      console.log(`Skip checkpoint "${cp.name}" — already exists`);
      continue;
    }
    await prisma.checkpoint.create({ data: cp });
    console.log(`Created checkpoint: ${cp.name}`);
  }

  // --- Travelers + biometrics ---
  for (let i = 0; i < SEED_TRAVELERS.length; i++) {
    const td = SEED_TRAVELERS[i];

    let traveler = await prisma.traveler.findUnique({ where: { fan: td.fan } });

    if (!traveler) {
      traveler = await prisma.traveler.create({
        data: {
          fan: td.fan,
          fullName: td.fullName,
          dateOfBirth: new Date(td.dateOfBirth),
          gender: td.gender,
          nationality: td.nationality,
          photo: td.photo,
          enrollmentStatus: EnrollmentStatus.COMPLETED,
          alertStatus: td.alertStatus,
          alertReason: td.alertReason,
        },
      });
      console.log(`Created traveler: ${traveler.fan} / ${traveler.fullName} [alert=${td.alertStatus}]`);
    } else {
      // Update alert status on existing record (so re-seeding is idempotent)
      traveler = await prisma.traveler.update({
        where: { id: traveler.id },
        data: {
          enrollmentStatus: EnrollmentStatus.COMPLETED,
          alertStatus: td.alertStatus,
          alertReason: td.alertReason,
        },
      });
      console.log(`Updated traveler: ${traveler.fan} [alert=${td.alertStatus}]`);
    }

    const existingBio = await prisma.biometric.findUnique({ where: { travelerId: traveler.id } });
    if (existingBio) {
      console.log(`Skip biometric for ${traveler.fan} — already exists`);
      continue;
    }
    await prisma.biometric.create({
      data: {
        travelerId: traveler.id,
        // Deterministic stub templates — replaced by real ORB/Gabor templates on actual capture
        fingerprintTemplate: Buffer.from(`fingerprint-template-${traveler.fan}`),
        irisTemplate:        Buffer.from(`iris-template-${traveler.fan}`),
        capturedBy: officerIds[i % officerIds.length],
      },
    });
    console.log(`Created biometric stubs for ${traveler.fan}`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
