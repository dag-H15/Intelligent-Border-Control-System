import { Router } from "express";
import { getCheckpoints } from "../controllers/checkpointController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.get("/", authenticate, getCheckpoints);

export default router;