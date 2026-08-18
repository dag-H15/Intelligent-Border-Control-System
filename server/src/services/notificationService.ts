import prisma from "../config/prisma";

export async function createNotification(userId: number, title: string, message: string, type: string = "INFO") {
  return prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type,
      isRead: false
    }
  });
}

export async function notifyAllSupervisors(title: string, message: string, type: string = "WARNING") {
  const supervisors = await prisma.user.findMany({
    where: { role: "SUPERVISOR" },
    select: { id: true }
  });

  const promises = supervisors.map((s) => createNotification(s.id, title, message, type));
  return Promise.all(promises);
}

export async function getNotificationsByUser(userId: number) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
}

export async function markAsRead(notificationId: number, userId: number) {
  return prisma.notification.update({
    where: { id: notificationId, userId },
    data: { isRead: true }
  });
}

export async function markAllAsRead(userId: number) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true }
  });
}