import { Router } from "express";
import {
  verificationSummary,
  overrideSummary,
  officerActivity,
  manualReviewSummary,
  list,
  officers,
  detailedRecords,
  statistics,
  chartData,
  verificationDetail,
  saveReport,
  getReportById,
} from "../controllers/reportController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Officer dropdown — must be defined BEFORE the bare GET "/" so Express
// does not accidentally match "officers" against a dynamic ":id" segment.
router.get("/officers", authenticate, authorize("SUPERVISOR", "ADMIN"), officers);

// Verification detail - must be before generic routes
router.get("/verification-detail/:id", authenticate, authorize("SUPERVISOR", "ADMIN"), verificationDetail);

// Get specific generated report by ID
router.get("/:id", authenticate, authorize("SUPERVISOR", "ADMIN"), getReportById);

// New comprehensive report endpoints
router.post("/detailed-records", authenticate, authorize("SUPERVISOR", "ADMIN"), detailedRecords);
router.post("/statistics", authenticate, authorize("SUPERVISOR", "ADMIN"), statistics);
router.post("/chart-data", authenticate, authorize("SUPERVISOR", "ADMIN"), chartData);

// Save generated report with metadata
router.post("/save", authenticate, authorize("SUPERVISOR", "ADMIN"), saveReport);

// Report generation
router.post("/verification-summary",  authenticate, authorize("SUPERVISOR", "ADMIN"), verificationSummary);
router.post("/override-summary",      authenticate, authorize("SUPERVISOR", "ADMIN"), overrideSummary);
router.post("/officer-activity",      authenticate, authorize("SUPERVISOR", "ADMIN"), officerActivity);
router.post("/manual-review-summary", authenticate, authorize("SUPERVISOR", "ADMIN"), manualReviewSummary);

// Previous reports list
router.get("/", authenticate, authorize("SUPERVISOR", "ADMIN"), list);

export default router;
