import { Router } from "express";
import { pending, decide, myActivity } from "../controllers/overrideController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.get("/pending", authenticate, authorize("SUPERVISOR"), pending);
router.get("/my-activity", authenticate, authorize("SUPERVISOR"), myActivity);
router.post("/:verificationId", authenticate, authorize("SUPERVISOR"), decide);

export default router;