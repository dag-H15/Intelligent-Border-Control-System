import { Request, Response, NextFunction } from "express";
import { findTravelerByFan } from "../services/travelerService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

export async function lookupTraveler(req: Request, res: Response, next: NextFunction) {
  try {
    const fan = String(req.params.fan || "").trim();
    if (!fan) {
      return res.status(400).json({ message: "fan is required" });
    }

    const traveler = await findTravelerByFan(fan);
    if (!traveler) {
      await createAuditLog(req.user!.userId, `Traveler lookup failed for FAN ${fan}`, getClientIp(req), AuditLevel.WARNING);
      return res.status(404).json({ message: "Traveler not found" });
    }

    await createAuditLog(req.user!.userId, `Traveler lookup for FAN ${fan}`, getClientIp(req), AuditLevel.INFO);

    return res.status(200).json({
      id: traveler.id,
      fan: traveler.fan,
      fullName: traveler.fullName,
      dateOfBirth: traveler.dateOfBirth.toISOString().slice(0, 10),
      gender: traveler.gender,
      nationality: traveler.nationality,
      photo: traveler.photo,
      enrollmentStatus: traveler.enrollmentStatus,
      alertStatus: traveler.alertStatus,
      alertReason: traveler.alertReason,
    });
  } catch (err) {
    next(err);
  }
}
