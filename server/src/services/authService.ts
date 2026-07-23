
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import prisma from "../config/prisma";
import { Role } from "../../generated/prisma";
 
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"];
 
if (!JWT_SECRET) {
  // Fail fast at startup rather than silently signing tokens with "undefined"
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
 
/**
 * Creates a new system user (Officer, Supervisor, or Admin).
 * Password is hashed with bcrypt before it ever touches the database.
 */
export async function registerUser(input: RegisterInput) {
  const { name, email, password, role } = input;
 
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Thrown errors are caught in the controller and mapped to HTTP responses
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
 
  // Never return the password hash to the caller
  const { passwordHash: _omit, ...safeUser } = user;
  return safeUser;
}
 
/**
 * Verifies email/password credentials and issues a JWT on success.
 */
export async function loginUser(input: LoginInput) {
  const { email, password } = input;
 
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const error = new Error("Invalid email or password");
    (error as any).statusCode = 401;
    (error as any).auditUserId = null;
    throw error;
  }
 
  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    const error = new Error("Invalid email or password");
    (error as any).statusCode = 401;
    (error as any).auditUserId = user.id;
    throw error;
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
      role: user.role,
    },
  };
}
 
