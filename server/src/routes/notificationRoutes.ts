import { Router } from "express";
import { getNotifications, readNotification, readAllNotifications } from "../controllers/notificationController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.get("/", authenticate, authorize("SUPERVISOR"), getNotifications);
router.patch("/:id/read", authenticate, authorize("SUPERVISOR"), readNotification);
router.patch("/read-all", authenticate, authorize("SUPERVISOR"), readAllNotifications);

export default router;