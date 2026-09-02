/**
 * localAgentClient.ts
 * -------------------
 * Small fetch wrapper shared by device adapters: adds timeouts, treats
 * non-2xx and network failures uniformly as DeviceError, and centralizes
 * the "agent unreachable" case (service not installed / USB unplugged /
 * wrong port) so each driver doesn't reimplement it.
 */

import { DeviceError } from "./types";

export interface LocalAgentConfig {
  /** e.g. https://localhost:8443 for a SecuGen-style local agent */
  baseUrl: string;
  /** Some vendor agents self-sign their local HTTPS cert; only disable verification for localhost-only agents you trust. */
  allowSelfSignedCert?: boolean;
  defaultTimeoutMs?: number;
}

export class LocalAgentClient {
  constructor(private readonly config: LocalAgentConfig) {}

  async postJson<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timeout = timeoutMs ?? this.config.defaultTimeoutMs ?? 8000;
    const timer = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      // NOTE: if your vendor agent uses a self-signed local HTTPS cert and
      // `allowSelfSignedCert` is set, Node's global fetch (undici) needs a
      // custom Agent with `rejectUnauthorized: false` passed via a
      // `dispatcher` option — set that up once at process start (e.g.
      // `setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }))`
      // from the `undici` package) rather than per-request here, and only
      // ever for this localhost-only client.
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new DeviceError(`Local device agent timed out after ${timeout}ms (${url})`, "TIMEOUT", err);
      }
      throw new DeviceError(
        `Could not reach local device agent at ${url}. Is the vendor service running and the device plugged in?`,
        "AGENT_UNREACHABLE",
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DeviceError(`Device agent returned HTTP ${response.status}: ${text}`, "AGENT_ERROR");
    }

    return (await response.json()) as T;
  }

  private buildUrl(path: string): string {
    const base = this.config.baseUrl.endsWith("/") ? this.config.baseUrl.slice(0, -1) : this.config.baseUrl;
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
}
