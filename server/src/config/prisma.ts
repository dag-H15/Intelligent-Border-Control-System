import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// 1. Initialize the PostgreSQL adapter with your connection string
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// 2. Instantiate PrismaClient using the driver adapter
const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prisma;