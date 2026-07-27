export type CaptureMode = "SIMULATION" | "SCANNER";

export interface AiScoreInput {
  captureMode: CaptureMode;
  fingerprintBuffer?: Buffer;
  irisBuffer?: Buffer;
  fingerprintData?: string;
  irisData?: string;
  referenceFingerprint?: Buffer | Uint8Array | null;
  referenceIris?: Buffer | Uint8Array | null;
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001/verify";

function bytesToBase64(bytes?: Buffer | Uint8Array | null): string {
  if (!bytes) return "";
  return Buffer.isBuffer(bytes) ? bytes.toString("base64") : Buffer.from(bytes).toString("base64");
}

export async function getBiometricScores(input: AiScoreInput): Promise<{
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
  decision?: string;
}> {
  const fpSource = input.fingerprintBuffer
    ? input.fingerprintBuffer.toString("base64")
    : input.fingerprintData ?? "";

  const irisSource = input.irisBuffer
    ? input.irisBuffer.toString("base64")
    : input.irisData ?? "";

  const refFp = bytesToBase64(input.referenceFingerprint);
  const refIris = bytesToBase64(input.referenceIris);

  try {
    const response = await fetch(AI_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captureMode: input.captureMode,
        fingerprint: fpSource,
        iris: irisSource,
        referenceFingerprint: refFp,
        referenceIris: refIris,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Service returned error HTTP ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as {
      fingerprintScore: number;
      irisScore: number;
      finalScore: number;
      decision?: string;
    };

    return {
      fingerprintScore: Number(result.fingerprintScore),
      irisScore: Number(result.irisScore),
      finalScore: Number(result.finalScore),
      decision: result.decision,
    };
  } catch (err: any) {
    console.error("AI Service Request Failed:", err?.message || err);
    throw new Error(`Biometric matching failed: Could not communicate with Python AI Service at ${AI_SERVICE_URL}`);
  }
}
