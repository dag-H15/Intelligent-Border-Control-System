import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";

export async function getCheckpoints(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await prisma.checkpoint.count();
    if (count === 0) {
      await prisma.checkpoint.createMany({
        data: [
          { name: "Bole International Airport", location: "Addis Ababa" },
          { name: "Moyale Border Post", location: "Moyale" },
          { name: "Togochale Border Post", location: "Togochale" }
        ],
        skipDuplicates: true
      });
    }

    const checkpoints = await prisma.checkpoint.findMany({
      orderBy: { name: "asc" }
    });
    return res.status(200).json({ checkpoints });
  } catch (err) {
    next(err);
  }
}