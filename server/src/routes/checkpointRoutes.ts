import { Router } from "express";
import {
  getCheckpoints,
  getAllCheckpoints,
  createCheckpoint,
  updateCheckpoint,
  deactivateCheckpoint,
} from "../controllers/checkpointController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Active checkpoints — used by officers and supervisors during verification
router.get("/", authenticate, getCheckpoints);

// Admin-only endpoints
router.get("/all",  authenticate, authorize("ADMIN"), getAllCheckpoints);
router.post("/",    authenticate, authorize("ADMIN"), createCheckpoint);
router.patch("/:id", authenticate, authorize("ADMIN"), updateCheckpoint);
router.delete("/:id", authenticate, authorize("ADMIN"), deactivateCheckpoint);

export default router;
