import { Router } from "express";
import { getSettingsHandler, updateSettingsHandler } from "../controllers/settingsController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);
router.get("/", getSettingsHandler);
router.put("/", authorize("ADMIN"), updateSettingsHandler);

export default router;
