export type CaptureMode = "SIMULATION" | "SCANNER";
export type BiometricType = "fingerprint" | "iris";

export interface AiTemplateExtractionInput {
  biometricType: BiometricType;
  imageBuffer?: Buffer;
  imageData?: string;
}

export interface AiTemplateComparisonInput {
  biometricType: BiometricType;
  imageBuffer?: Buffer;
  imageData?: string;
  storedTemplate: Buffer | Uint8Array | string;
  threshold?: number;
}

function bytesToBase64(bytes?: Buffer | Uint8Array | string | null): string {
  if (!bytes) return "";
  if (typeof bytes === "string") return bytes;
  return Buffer.isBuffer(bytes) ? bytes.toString("base64") : Buffer.from(bytes).toString("base64");
}

function normalizeBase64Data(input?: string): string {
  if (!input) return "";
  return input.includes(",") ? input.split(",")[1] : input;
}

function resolveAiBaseUrl(): string {
  const configured = process.env.AI_SERVICE_BASE_URL || process.env.AI_SERVICE_URL || "http://localhost:5001";
  return configured.replace(/\/(verify|enroll)\/?$/i, "");
}

function buildAiUrl(pathname: string): string {
  const baseUrl = resolveAiBaseUrl();
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function toImagePayload(buffer?: Buffer, data?: string): string {
  if (buffer) {
    return buffer.toString("base64");
  }

  return normalizeBase64Data(data ?? "");
}

export async function extractBiometricTemplate(input: AiTemplateExtractionInput): Promise<{
  template: string;
  biometricType: BiometricType;
}> {
  const response = await fetch(buildAiUrl("enroll"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      biometricType: input.biometricType,
      image: toImagePayload(input.imageBuffer, input.imageData),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Service returned error HTTP ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as { template: string; biometricType?: BiometricType };
  return {
    template: String(result.template ?? ""),
    biometricType: (result.biometricType ?? input.biometricType) as BiometricType,
  };
}

export async function compareBiometricTemplate(input: AiTemplateComparisonInput): Promise<{
  score: number;
  match: boolean;
  biometricType: BiometricType;
}> {
  const response = await fetch(buildAiUrl("verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      biometricType: input.biometricType,
      image: toImagePayload(input.imageBuffer, input.imageData),
      storedTemplate: bytesToBase64(input.storedTemplate),
      threshold: input.threshold ?? 85,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Service returned error HTTP ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as { score: number; match: boolean; biometricType?: BiometricType };
  return {
    score: Number(result.score),
    match: Boolean(result.match),
    biometricType: (result.biometricType ?? input.biometricType) as BiometricType,
  };
}

export interface AiQualityInput {
  biometricType: BiometricType;
  imageBuffer?: Buffer;
  imageData?: string;
}

export async function checkBiometricQuality(input: AiQualityInput): Promise<{
  score: number;
  acceptable: boolean;
  biometricType: BiometricType;
  biometricValid?: boolean;
  qualityStatus?: string;
  issues?: string[];
  signals?: Record<string, any>;
  details?: {
    sharpness: number;
    contrast: number;
    heuristic: number;
    laplacianVariance: number;
    [key: string]: any;
  };
}> {
  const response = await fetch(buildAiUrl("quality"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      biometricType: input.biometricType,
      image: toImagePayload(input.imageBuffer, input.imageData),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Service returned error HTTP ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as {
    score: number;
    acceptable: boolean;
    biometricType?: BiometricType;
    biometricValid?: boolean;
    qualityStatus?: string;
    issues?: string[];
    signals?: Record<string, any>;
    details?: any;
  };
  return {
    score: Number(result.score),
    acceptable: Boolean(result.acceptable),
    biometricType: (result.biometricType ?? input.biometricType) as BiometricType,
    biometricValid: result.biometricValid,
    qualityStatus: result.qualityStatus,
    issues: result.issues,
    signals: result.signals,
    details: result.details,
  };
}

export async function getBiometricScores(input: {
  captureMode: CaptureMode;
  fingerprintBuffer?: Buffer;
  irisBuffer?: Buffer;
  fingerprintData?: string;
  irisData?: string;
  referenceFingerprint?: Buffer | Uint8Array | null;
  referenceIris?: Buffer | Uint8Array | null;
}): Promise<{
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
  decision?: string;
}> {
  if (!input.referenceFingerprint || !input.referenceIris) {
    return {
      fingerprintScore: 0,
      irisScore: 0,
      finalScore: 0,
    };
  }

  const fingerprintResult = await compareBiometricTemplate({
    biometricType: "fingerprint",
    imageBuffer: input.fingerprintBuffer,
    imageData: input.fingerprintData,
    storedTemplate: input.referenceFingerprint,
    threshold: 85,
  });

  const irisResult = await compareBiometricTemplate({
    biometricType: "iris",
    imageBuffer: input.irisBuffer,
    imageData: input.irisData,
    storedTemplate: input.referenceIris,
    threshold: 85,
  });

  return {
    fingerprintScore: fingerprintResult.score,
    irisScore: irisResult.score,
    finalScore: Math.round(((fingerprintResult.score + irisResult.score) / 2) * 100) / 100,
  };
}
