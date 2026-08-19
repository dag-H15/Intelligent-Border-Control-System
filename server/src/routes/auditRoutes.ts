import { Router } from "express";
import { listAuditLogs, getAuditLogDetail } from "../controllers/auditController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

router.get("/:id", authenticate, authorize("ADMIN"), getAuditLogDetail);
router.get("/", authenticate, authorize("ADMIN"), listAuditLogs);

export default router;