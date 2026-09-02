import { Router } from "express";
import {
  getDeviceStatus,
  captureFingerprint,
  captureIris,
  captureIrisBothEyes,
} from "../controllers/deviceController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Officers at a checkpoint poll/trigger the physically attached hardware.
router.get("/status", authenticate, authorize("OFFICER"), getDeviceStatus);
router.post("/fingerprint/capture", authenticate, authorize("OFFICER"), captureFingerprint);
router.post("/iris/capture", authenticate, authorize("OFFICER"), captureIris);
router.post("/iris/capture-both", authenticate, authorize("OFFICER"), captureIrisBothEyes);

export default router;
