import { Request, Response } from "express";
import { getFingerprintDriver, getIrisDriver, DeviceError } from "../services/deviceDrivers";

function handleDeviceError(res: Response, err: unknown) {
  if (err instanceof DeviceError) {
    const statusByCode: Record<string, number> = {
      NOT_CONNECTED: 503,
      AGENT_UNREACHABLE: 503,
      TIMEOUT: 504,
      NO_FINGER_OR_EYE_DETECTED: 408,
      AGENT_ERROR: 502,
      UNSUPPORTED: 400,
    };
    return res.status(statusByCode[err.code] ?? 500).json({
      message: err.message,
      code: err.code,
    });
  }
  // eslint-disable-next-line no-console
  console.error("[deviceController] unexpected error", err);
  return res.status(500).json({ message: "Unexpected device error." });
}

export async function getDeviceStatus(req: Request, res: Response) {
  try {
    const [fingerprintStatus, irisStatus] = await Promise.all([
      getFingerprintDriver().getStatus(),
      getIrisDriver().getStatus(),
    ]);
    res.json({ fingerprint: fingerprintStatus, iris: irisStatus });
  } catch (err) {
    handleDeviceError(res, err);
  }
}

export async function captureFingerprint(req: Request, res: Response) {
  try {
    const timeoutMs = req.body?.timeoutMs ? Number(req.body.timeoutMs) : undefined;
    const result = await getFingerprintDriver().capture(timeoutMs);
    res.json(result);
  } catch (err) {
    handleDeviceError(res, err);
  }
}

export async function captureIris(req: Request, res: Response) {
  try {
    const timeoutMs = req.body?.timeoutMs ? Number(req.body.timeoutMs) : undefined;
    const eye = req.body?.eye === "LEFT" || req.body?.eye === "RIGHT" ? req.body.eye : undefined;
    const result = await getIrisDriver().capture(timeoutMs, eye);
    res.json(result);
  } catch (err) {
    handleDeviceError(res, err);
  }
}

export async function captureIrisBothEyes(req: Request, res: Response) {
  try {
    const timeoutMs = req.body?.timeoutMs ? Number(req.body.timeoutMs) : undefined;
    const result = await getIrisDriver().captureBothEyes(timeoutMs);
    res.json(result);
  } catch (err) {
    handleDeviceError(res, err);
  }
}
