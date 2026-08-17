import { Router } from "express";
import {
  verificationSummary,
  overrideSummary,
  officerActivity,
  manualReviewSummary,
  list,
  officers,
} from "../controllers/reportController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Officer dropdown — must be defined BEFORE the bare GET "/" so Express
// does not accidentally match "officers" against a dynamic ":id" segment.
router.get("/officers", authenticate, authorize("SUPERVISOR"), officers);

// Report generation
router.post("/verification-summary",  authenticate, authorize("SUPERVISOR"), verificationSummary);
router.post("/override-summary",      authenticate, authorize("SUPERVISOR"), overrideSummary);
router.post("/officer-activity",      authenticate, authorize("SUPERVISOR"), officerActivity);
router.post("/manual-review-summary", authenticate, authorize("SUPERVISOR"), manualReviewSummary);

// Previous reports list
router.get("/", authenticate, authorize("SUPERVISOR", "ADMIN"), list);

export default router;
