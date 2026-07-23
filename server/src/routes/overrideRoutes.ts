import { Router } from "express";
import { pending, decide } from "../controllers/overrideController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.get("/pending", authenticate, authorize("SUPERVISOR"), pending);
router.post("/:verificationId", authenticate, authorize("SUPERVISOR"), decide);

export default router;