/**
 * types.ts
 * --------
 * Shared contracts for USB/local biometric device integration.
 *
 * These drivers run on the Node.js server process that is physically
 * co-located with the hardware (e.g. the kiosk / checkpoint machine),
 * NOT in the browser. Most commercial fingerprint/iris SDKs (SecuGen
 * FDx SDK Pro, DigitalPersona U.are.U SDK, IrisID iCAM SDK, etc.) do not
 * ship a native Node.js binding. Instead they install a local background
 * service ("agent") on the machine that exposes a REST/WebSocket API on
 * localhost (commonly https://localhost:<port>). That's the integration
 * pattern these drivers target: Node talks HTTP to the local vendor agent,
 * which talks to the USB device via the vendor's native driver stack.
 *
 * IMPORTANT: exact endpoint paths / field names differ per vendor and SDK
 * version. Treat the adapters in this folder as a correct *shape* that you
 * fill in with your specific SDK's documented endpoints — the config
 * objects exist precisely so you can do that without touching driver logic.
 */

export type BiometricType = "fingerprint" | "iris";

export type DeviceStatus = "IDLE" | "READY" | "CAPTURING" | "ERROR" | "DISCONNECTED";

export interface DeviceInfo {
  deviceId: string;
  vendor: string;
  model: string;
  serial?: string;
  firmwareVersion?: string;
}

export interface CaptureResult {
  /** Raw capture, base64-encoded, no data: prefix */
  imageBase64: string;
  format: "png" | "bmp" | "jpeg" | "raw";
  /** Device/SDK-reported quality (0-100) if the SDK exposes one, before our own quality pipeline runs */
  deviceQualityHint?: number;
  capturedAt: string;
  biometricType: BiometricType;
}

export class DeviceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_CONNECTED"
      | "TIMEOUT"
      | "NO_FINGER_OR_EYE_DETECTED"
      | "AGENT_UNREACHABLE"
      | "AGENT_ERROR"
      | "UNSUPPORTED",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DeviceError";
  }
}

export interface BiometricDeviceDriver {
  readonly biometricType: BiometricType;

  /** Confirms the local agent is reachable and a device is attached. Safe to call repeatedly. */
  connect(): Promise<DeviceInfo>;

  /** Polls current device state without triggering a capture. */
  getStatus(): Promise<DeviceStatus>;

  /**
   * Triggers a capture and blocks until the device returns an image, the
   * timeout elapses, or the vendor agent reports an error (e.g. no finger
   * placed / no eye detected).
   */
  capture(timeoutMs?: number): Promise<CaptureResult>;

  /** Releases the device handle on the agent side, if applicable. */
  disconnect(): Promise<void>;
}
