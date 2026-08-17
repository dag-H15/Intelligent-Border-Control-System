import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { create, decide, manualReviewUpload, pending, history } from "../controllers/manualReviewController";

const router = Router();

router.post("/", authenticate, authorize("OFFICER"), manualReviewUpload, create);
router.get("/pending", authenticate, authorize("SUPERVISOR"), pending);
router.get("/history", authenticate, authorize("SUPERVISOR"), history);
router.patch("/:requestId", authenticate, authorize("SUPERVISOR"), decide);

export default router;