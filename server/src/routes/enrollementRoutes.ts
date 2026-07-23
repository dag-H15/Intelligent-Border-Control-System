import { Router } from "express";
import { createTravelerHandler, captureBiometricHandler } from "../controllers/enrollmentController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Only Border Officers perform enrollment
router.post("/traveler", authenticate, authorize("OFFICER"), createTravelerHandler);
router.post("/biometric", authenticate, authorize("OFFICER"), captureBiometricHandler);

export default router;