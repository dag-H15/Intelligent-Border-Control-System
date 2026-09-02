/**
 * fingerprintDriver.ts
 * --------------------
 * Adapter for USB fingerprint scanners exposed through a local vendor
 * agent (SecuGen FDx SDK Pro "WebAPI", DigitalPersona U.are.U Web SDK,
 * Futronic, etc. all follow this same "local HTTPS service on localhost"
 * pattern).
 *
 * >>> Adjust ENDPOINTS and the response field mapping in `capture()` to
 * >>> match your specific vendor's SDK documentation. The structure below
 * >>> (connect / status / capture / disconnect, JSON in/out, base64 image)
 * >>> is representative of how these agents work, but exact endpoint
 * >>> names and JSON field names are vendor- and version-specific.
 */

import { BiometricDeviceDriver, CaptureResult, DeviceError, DeviceInfo, DeviceStatus } from "./types";
import { LocalAgentClient } from "./localAgentClient";

export interface FingerprintDriverConfig {
  /** Base URL of the vendor's local agent, e.g. https://localhost:8443 */
  agentBaseUrl?: string;
  /** Per-capture license/session key some SDKs require (e.g. SecuGen "Licstr") */
  licenseKey?: string;
  captureTimeoutMs?: number;
  allowSelfSignedCert?: boolean;
}

// Vendor-specific endpoint paths — replace with the ones your SDK documents.
const ENDPOINTS = {
  deviceInfo: "/api/device/info",
  status: "/api/device/status",
  capture: "/api/fingerprint/capture",
  release: "/api/device/release",
};

export class LocalAgentFingerprintDriver implements BiometricDeviceDriver {
  readonly biometricType = "fingerprint" as const;
  private client: LocalAgentClient;
  private licenseKey?: string;
  private captureTimeoutMs: number;
  private connectedDevice: DeviceInfo | null = null;

  constructor(config: FingerprintDriverConfig = {}) {
    const agentBaseUrl = config.agentBaseUrl ?? process.env.FINGERPRINT_AGENT_URL ?? "https://localhost:8443";
    this.client = new LocalAgentClient({
      baseUrl: agentBaseUrl,
      allowSelfSignedCert: config.allowSelfSignedCert ?? process.env.FINGERPRINT_AGENT_ALLOW_SELF_SIGNED === "true",
      defaultTimeoutMs: 5000,
    });
    this.licenseKey = config.licenseKey ?? process.env.FINGERPRINT_SDK_LICENSE;
    this.captureTimeoutMs = config.captureTimeoutMs ?? 10000;
  }

  async connect(): Promise<DeviceInfo> {
    const data = await this.client.postJson<{
      deviceId?: string;
      vendor?: string;
      model?: string;
      serial?: string;
      firmware?: string;
    }>(ENDPOINTS.deviceInfo, { licenseKey: this.licenseKey });

    if (!data.deviceId) {
      throw new DeviceError("Fingerprint agent responded but reported no attached device.", "NOT_CONNECTED");
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

  async capture(timeoutMs = this.captureTimeoutMs): Promise<CaptureResult> {
    if (!this.connectedDevice) {
      await this.connect();
    }

    let data: {
      imageBase64?: string;
      format?: string;
      quality?: number;
      errorCode?: string;
    };

    try {
      data = await this.client.postJson(
        ENDPOINTS.capture,
        {
          licenseKey: this.licenseKey,
          timeoutMs,
          imageFormat: "bmp",
        },
        timeoutMs + 2000 // give the agent's own timeout a chance to fire first
      );
    } catch (err) {
      if (err instanceof DeviceError) throw err;
      throw new DeviceError("Fingerprint capture failed due to an unexpected agent error.", "AGENT_ERROR", err);
    }

    if (data.errorCode === "NO_FINGER_DETECTED") {
      throw new DeviceError("No finger detected on the scanner within the capture window.", "NO_FINGER_OR_EYE_DETECTED");
    }
    if (!data.imageBase64) {
      throw new DeviceError("Fingerprint agent returned no image data.", "AGENT_ERROR");
    }

    return {
      imageBase64: data.imageBase64,
      format: (data.format as CaptureResult["format"]) ?? "bmp",
      deviceQualityHint: data.quality,
      capturedAt: new Date().toISOString(),
      biometricType: "fingerprint",
    };
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.postJson(ENDPOINTS.release, {});
    } finally {
      this.connectedDevice = null;
    }
  }
}
