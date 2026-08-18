import { Router } from "express";
import { verify, myActivity, stats, qualityCheck, verificationUpload } from "../controllers/verificationController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.post("/", authenticate, authorize("OFFICER"), verificationUpload, verify);
router.get("/my-activity", authenticate, authorize("OFFICER"), myActivity);
router.get("/stats", authenticate, stats);
router.post("/quality", authenticate, authorize("OFFICER"), verificationUpload, qualityCheck);

export default router;