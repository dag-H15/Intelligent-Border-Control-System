/**
 * index.ts
 * --------
 * Process-wide singletons for the attached devices. A capture kiosk has one
 * fingerprint scanner and one iris camera physically plugged into it, so we
 * keep one driver instance per type rather than reconnecting on every request.
 */

import { LocalAgentFingerprintDriver } from "./fingerprintDriver";
import { LocalAgentIrisDriver } from "./irisDriver";

export * from "./types";
export { LocalAgentFingerprintDriver } from "./fingerprintDriver";
export { LocalAgentIrisDriver } from "./irisDriver";

let fingerprintDriver: LocalAgentFingerprintDriver | null = null;
let irisDriver: LocalAgentIrisDriver | null = null;

export function getFingerprintDriver(): LocalAgentFingerprintDriver {
  if (!fingerprintDriver) fingerprintDriver = new LocalAgentFingerprintDriver();
  return fingerprintDriver;
}

export function getIrisDriver(): LocalAgentIrisDriver {
  if (!irisDriver) irisDriver = new LocalAgentIrisDriver();
  return irisDriver;
}

/** Call once at server startup (see server.ts) to fail fast if hardware isn't reachable, rather than on the first officer's capture attempt. */
export async function verifyDevicesAtStartup(): Promise<void> {
  const results = await Promise.allSettled([getFingerprintDriver().connect(), getIrisDriver().connect()]);
  results.forEach((result, i) => {
    const label = i === 0 ? "fingerprint scanner" : "iris camera";
    if (result.status === "rejected") {
      // eslint-disable-next-line no-console
      console.warn(`[devices] ${label} not reachable at startup: ${(result.reason as Error).message}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[devices] ${label} connected: ${JSON.stringify(result.value)}`);
    }
  });
}
