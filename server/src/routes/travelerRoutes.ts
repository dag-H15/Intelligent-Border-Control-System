import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { lookupTraveler, identifyTravelerByFingerprintController, fingerprintIdentifyUpload } from "../controllers/travelerController";

const router = Router();

router.post("/identify", authenticate, authorize("OFFICER"), fingerprintIdentifyUpload, identifyTravelerByFingerprintController);
router.get("/:fan", authenticate, authorize("OFFICER"), lookupTraveler);

export default router;

