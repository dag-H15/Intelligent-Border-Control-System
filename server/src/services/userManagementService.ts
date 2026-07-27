import bcrypt from "bcrypt";
import prisma from "../config/prisma";
import { Role } from "../../generated/prisma";

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
}

export interface ListUserRecord {
  id: number;
  name: string;
  email: string;
  role: Role;
  failedAttempts: number;
  lockedUntil: string | null;
  isLocked: boolean;
  createdDate: string;
}

export interface SafeUserRecord extends ListUserRecord {}

function formatUser(user: {
  id: number;
  name: string;
  email: string;
  role: Role;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
}): SafeUserRecord {
  const isLocked = Boolean(user.lockedUntil && user.lockedUntil > new Date());
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    isLocked,
    createdDate: user.createdAt.toISOString().slice(0, 10),
  };
}

async function ensureNotLastAdmin(userId: number) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || target.role !== "ADMIN") return;

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount <= 1) {
    const error = new Error("Cannot remove the last admin account");
    (error as any).statusCode = 409;
    throw error;
  }
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return users.map(formatUser);
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    const error = new Error("A user with this email already exists");
    (error as any).statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
  });

  return formatUser(user);
}

export async function updateUser(userId: number, input: UpdateUserInput) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  if (input.email && input.email !== current.email) {
    const duplicate = await prisma.user.findFirst({ where: { email: input.email, NOT: { id: userId } } });
    if (duplicate) {
      const error = new Error("A user with this email already exists");
      (error as any).statusCode = 409;
      throw error;
    }
  }

  if (input.role && current.role === "ADMIN" && input.role !== "ADMIN") {
    await ensureNotLastAdmin(userId);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.role ? { role: input.role } : {}),
    },
  });

  return formatUser(user);
}

export async function resetUserPassword(userId: number, password: string) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedAttempts: 0, lockedUntil: null },
  });

  return formatUser(user);
}

export async function unlockUser(userId: number) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    const error = new Error("User not found");
    (error as any).statusCode = 404;
    throw error;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  return formatUser(user);
}

export async function deleteUser(userId: number) {
  await ensureNotLastAdmin(userId);

  const user = await prisma.user.delete({ where: { id: userId } });
  return formatUser(user);
}
