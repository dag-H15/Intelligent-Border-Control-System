import { Request, Response, NextFunction } from "express";
import { getSystemSettings, updateSystemSettings } from "../services/settingsService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

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
    const updated = await updateSystemSettings(req.body);

    if (req.user) {
      await createAuditLog(
        req.user.userId,
        `Updated system settings: ${JSON.stringify(req.body)}`,
        getClientIp(req),
        AuditLevel.INFO
      );
    }

    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
