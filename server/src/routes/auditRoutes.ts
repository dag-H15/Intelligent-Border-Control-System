import { Router } from "express";
import { listAuditLogs } from "../controllers/auditController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.get("/", authenticate, authorize("ADMIN"), listAuditLogs);

export default router;