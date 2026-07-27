import { Router } from "express";
import { verify, myActivity, verificationUpload } from "../controllers/verificationController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.post("/", authenticate, authorize("OFFICER"), verificationUpload, verify);
router.get("/my-activity", authenticate, authorize("OFFICER"), myActivity);

export default router;