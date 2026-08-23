import { Request, Response, NextFunction } from "express";
import { getSystemSettings, updateSystemSettings, SystemSettingsData } from "../services/settingsService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

const SETTING_LABELS: Record<keyof SystemSettingsData, string> = {
  approvalThreshold: "Automatic Approval Threshold",
  reviewRangeMin: "Review Range Minimum",
  reviewRangeMax: "Review Range Maximum",
  sessionTimeout: "Session Timeout (min)",
  maxLoginAttempts: "Max Login Attempts",
};

export async function getSettingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getSystemSettings();
    return res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
}

export async function updateSettingsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const previous = await getSystemSettings();
    const updated = await updateSystemSettings(req.body);

    if (req.user) {
      // Record every setting that actually changed as previous → new
      const changes = (Object.keys(updated) as (keyof SystemSettingsData)[])
        .filter((key) => req.body[key] !== undefined && previous[key] !== updated[key])
        .map((key) => ({
          field: SETTING_LABELS[key] ?? key,
          previous: previous[key],
          new: updated[key],
        }));

      const thresholdChanged = changes.some(
        (c) =>
          c.field === SETTING_LABELS.approvalThreshold ||
          c.field === SETTING_LABELS.reviewRangeMin ||
          c.field === SETTING_LABELS.reviewRangeMax
      );

      await logAuditEvent({
        userId: req.user.userId,
        action: thresholdChanged ? "Biometric threshold updated" : "System settings updated",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.SUCCESS,
        resourceType: "SystemSetting",
        description:
          changes.length > 0
            ? `Configuration changed: ${changes.map((c) => `${c.field} (${c.previous} → ${c.new})`).join(", ")}`
            : "Settings saved without value changes",
        metadata: { changes },
      });
    }

    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
