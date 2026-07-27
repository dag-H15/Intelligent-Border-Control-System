import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { lookupTraveler } from "../controllers/travelerController";

const router = Router();

router.get("/:fan", authenticate, authorize("OFFICER"), lookupTraveler);

export default router;
