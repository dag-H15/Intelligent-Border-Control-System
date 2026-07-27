import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import prisma from "../config/prisma";
import { Role } from "../../generated/prisma";
import { getSystemSettings } from "./settingsService";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"];

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables");
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface LoginInput {
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput) {
  const { name, email, password, role } = input;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const error = new Error("A user with this email already exists");
    (error as any).statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
    },
  });

  const { passwordHash: _omit, ...safeUser } = user;
  return safeUser;
}

export async function loginUser(input: LoginInput) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const error = new Error("Invalid email or password");
    (error as any).statusCode = 401;
    (error as any).auditUserId = null;
    throw error;
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const error = new Error("Account temporarily locked due to multiple failed login attempts.");
    (error as any).statusCode = 423;
    (error as any).auditUserId = user.id;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    const settings = await getSystemSettings();
    const maxAttempts = settings.maxLoginAttempts || 5;
    const newFailedCount = user.failedAttempts + 1;
    let lockedUntil: Date | null = null;

    if (newFailedCount >= maxAttempts) {
      lockedUntil = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes lockout
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: newFailedCount,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      const error = new Error("Account temporarily locked due to multiple failed login attempts.");
      (error as any).statusCode = 423;
      (error as any).auditUserId = user.id;
      (error as any).isAccountLockedNow = true;
      throw error;
    }

    const error = new Error("Invalid email or password");
    (error as any).statusCode = 401;
    (error as any).auditUserId = user.id;
    throw error;
  }

  // Clear failed login counter and lockout upon successful login
  if (user.failedAttempts > 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
