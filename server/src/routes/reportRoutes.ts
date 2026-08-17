import { Router } from "express";
import {
  verificationSummary,
  overrideSummary,
  officerActivity,
  manualReviewSummary,
  list,
} from "../controllers/reportController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.post("/verification-summary", authenticate, authorize("SUPERVISOR"), verificationSummary);
router.post("/override-summary", authenticate, authorize("SUPERVISOR"), overrideSummary);
router.post("/officer-activity", authenticate, authorize("SUPERVISOR"), officerActivity);
router.post("/manual-review-summary", authenticate, authorize("SUPERVISOR"), manualReviewSummary);
router.get("/", authenticate, authorize("SUPERVISOR", "ADMIN"), list);

export default router;