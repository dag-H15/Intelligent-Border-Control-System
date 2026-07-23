import { Router } from "express";
import { register, login } from "../controllers/authController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Only an ADMIN can create new system users.
// NOTE: for the very first ADMIN account, seed the database directly
// (e.g. via a Prisma seed script or Prisma Studio) since no admin exists
// yet to call this endpoint.
router.post("/register", authenticate, authorize("ADMIN"), register);

router.post("/login", login);

export default router;