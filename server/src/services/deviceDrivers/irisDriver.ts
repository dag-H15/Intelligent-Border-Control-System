/**
 * irisDriver.ts
 * -------------
 * Adapter for dedicated iris cameras (IrisID iCAM series, IriShield, etc.)
 * exposed through a local vendor agent. Same integration pattern as the
 * fingerprint driver: Node -> HTTPS -> local agent -> native SDK -> USB device.
 *
 * >>> Adjust ENDPOINTS and the response field mapping to match your SDK.
 * Iris agents commonly report *two* eyes per capture attempt (left/right);
 * this adapter exposes a single-eye capture() to match the existing
 * BiometricDeviceDriver contract, plus a captureBothEyes() convenience
 * method for kiosks that want to enroll/verify both eyes in one prompt.
 */

import { BiometricDeviceDriver, CaptureResult, DeviceError, DeviceInfo, DeviceStatus } from "./types";
import { LocalAgentClient } from "./localAgentClient";

export type EyeSide = "LEFT" | "RIGHT";

export interface IrisDriverConfig {
  agentBaseUrl?: string;
  captureTimeoutMs?: number;
  allowSelfSignedCert?: boolean;
}

const ENDPOINTS = {
  deviceInfo: "/api/device/info",
  status: "/api/device/status",
  capture: "/api/iris/capture",
  release: "/api/device/release",
};

export class LocalAgentIrisDriver implements BiometricDeviceDriver {
  readonly biometricType = "iris" as const;
  private client: LocalAgentClient;
  private captureTimeoutMs: number;
  private connectedDevice: DeviceInfo | null = null;

  constructor(config: IrisDriverConfig = {}) {
    const agentBaseUrl = config.agentBaseUrl ?? process.env.IRIS_AGENT_URL ?? "https://localhost:8444";
    this.client = new LocalAgentClient({
      baseUrl: agentBaseUrl,
      allowSelfSignedCert: config.allowSelfSignedCert ?? process.env.IRIS_AGENT_ALLOW_SELF_SIGNED === "true",
      defaultTimeoutMs: 5000,
    });
    this.captureTimeoutMs = config.captureTimeoutMs ?? 12000; // iris capture windows are typically longer than fingerprint
  }

  async connect(): Promise<DeviceInfo> {
    const data = await this.client.postJson<{
      deviceId?: string;
      vendor?: string;
      model?: string;
      serial?: string;
      firmware?: string;
    }>(ENDPOINTS.deviceInfo, {});

    if (!data.deviceId) {
      throw new DeviceError("Iris agent responded but reported no attached camera.", "NOT_CONNECTED");
    }

    this.connectedDevice = {
      deviceId: data.deviceId,
      vendor: data.vendor ?? "unknown",
      model: data.model ?? "unknown",
      serial: data.serial,
      firmwareVersion: data.firmware,
    };
    return this.connectedDevice;
  }

  async getStatus(): Promise<DeviceStatus> {
    try {
      const data = await this.client.postJson<{ status?: string }>(ENDPOINTS.status, {});
      switch ((data.status ?? "").toUpperCase()) {
        case "READY":
          return "READY";
        case "CAPTURING":
          return "CAPTURING";
        case "DISCONNECTED":
          return "DISCONNECTED";
        default:
          return "IDLE";
      }
    } catch (err) {
      if (err instanceof DeviceError && err.code === "AGENT_UNREACHABLE") return "DISCONNECTED";
      return "ERROR";
    }
  }

  /** Captures a single eye. Defaults to whichever eye the device auto-detects first. */
  async capture(timeoutMs = this.captureTimeoutMs, eye?: EyeSide): Promise<CaptureResult> {
    if (!this.connectedDevice) {
      await this.connect();
    }

    let data: {
      imageBase64?: string;
      format?: string;
      quality?: number;
      eye?: string;
      errorCode?: string;
    };

    try {
      data = await this.client.postJson(
        ENDPOINTS.capture,
        { timeoutMs, eye: eye ?? "AUTO", imageFormat: "png" },
        timeoutMs + 2000
      );
    } catch (err) {
      if (err instanceof DeviceError) throw err;
      throw new DeviceError("Iris capture failed due to an unexpected agent error.", "AGENT_ERROR", err);
    }

    if (data.errorCode === "NO_EYE_DETECTED") {
      throw new DeviceError("No eye detected within the capture window.", "NO_FINGER_OR_EYE_DETECTED");
    }
    if (!data.imageBase64) {
      throw new DeviceError("Iris agent returned no image data.", "AGENT_ERROR");
    }

    return {
      imageBase64: data.imageBase64,
      format: (data.format as CaptureResult["format"]) ?? "png",
      deviceQualityHint: data.quality,
      capturedAt: new Date().toISOString(),
      biometricType: "iris",
    };
  }

  /** Convenience: capture left then right eye sequentially, for enrollment flows that want both. */
  async captureBothEyes(timeoutMs = this.captureTimeoutMs): Promise<{ left: CaptureResult; right: CaptureResult }> {
    const left = await this.capture(timeoutMs, "LEFT");
    const right = await this.capture(timeoutMs, "RIGHT");
    return { left, right };
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.postJson(ENDPOINTS.release, {});
    } finally {
      this.connectedDevice = null;
    }
  }
}
