import { Request, Response, NextFunction } from "express";
import * as service from "../services/notificationService";

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const list = await service.getNotificationsByUser(req.user!.userId);
    return res.status(200).json({ notifications: list });
  } catch (err) {
    next(err);
  }
}

export async function readNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }
    const updated = await service.markAsRead(id, req.user!.userId);
    return res.status(200).json({ notification: updated });
  } catch (err) {
    next(err);
  }
}

export async function readAllNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    await service.markAllAsRead(req.user!.userId);
    return res.status(200).json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
}
