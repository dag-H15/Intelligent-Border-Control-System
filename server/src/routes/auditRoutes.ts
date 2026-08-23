import { Router } from "express";
import {
  listAuditLogs,
  getAuditLogDetail,
  getAuditLogStats,
  exportAuditLogsCsv,
} from "../controllers/auditController";
import { authenticate, authorize } from "../middleware/authMiddleware";

const router = Router();

// Static routes must be registered before the dynamic "/:id" route.
router.get("/stats", authenticate, authorize("ADMIN"), getAuditLogStats);
router.get("/export", authenticate, authorize("ADMIN"), exportAuditLogsCsv);
router.get("/:id", authenticate, authorize("ADMIN"), getAuditLogDetail);
router.get("/", authenticate, authorize("ADMIN"), listAuditLogs);

// Audit logs are immutable: intentionally NO create/update/delete routes.
export default router;
