import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import enrollmentRoutes from "./routes/enrollementRoutes";
import verificationRoutes from "./routes/verificationRoutes";
import overrideRoutes from "./routes/overrideRoutes";
import auditRoutes from "./routes/auditRoutes";
import reportRoutes from "./routes/reportRoutes";

const app = express();

// --- Core middleware ---
app.use(cors());
app.use(express.json());

// --- Health check ---
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// --- Route mounting ---
app.use("/api/auth", authRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/override", overrideRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/reports", reportRoutes);

// --- 404 handler ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

// --- Centralized error handler ---
// Any controller that calls next(err) ends up here. Errors thrown from
// services can carry a statusCode (see authService.ts); default to 500.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || "Internal server error",
  });
});

export default app;