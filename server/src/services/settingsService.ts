import prisma from "../config/prisma";

export interface SystemSettingsData {
  approvalThreshold: number;
  reviewRangeMin: number;
  reviewRangeMax: number;
  sessionTimeout: number;
  maxLoginAttempts: number;
}

const DEFAULT_SETTINGS: SystemSettingsData = {
  approvalThreshold: 95,
  reviewRangeMin: 85,
  reviewRangeMax: 94,
  sessionTimeout: 30,
  maxLoginAttempts: 5,
};

export async function getSystemSettings(): Promise<SystemSettingsData> {
  const records = await prisma.systemSetting.findMany();
  const map = new Map<string, string>();
  for (const r of records) {
    map.set(r.key, r.value);
  }

  return {
    approvalThreshold: map.has("approvalThreshold")
      ? Number(map.get("approvalThreshold"))
      : DEFAULT_SETTINGS.approvalThreshold,
    reviewRangeMin: map.has("reviewRangeMin")
      ? Number(map.get("reviewRangeMin"))
      : DEFAULT_SETTINGS.reviewRangeMin,
    reviewRangeMax: map.has("reviewRangeMax")
      ? Number(map.get("reviewRangeMax"))
      : DEFAULT_SETTINGS.reviewRangeMax,
    sessionTimeout: map.has("sessionTimeout")
      ? Number(map.get("sessionTimeout"))
      : DEFAULT_SETTINGS.sessionTimeout,
    maxLoginAttempts: map.has("maxLoginAttempts")
      ? Number(map.get("maxLoginAttempts"))
      : DEFAULT_SETTINGS.maxLoginAttempts,
  };
}

export async function updateSystemSettings(
  updates: Partial<SystemSettingsData>
): Promise<SystemSettingsData> {
  const keys = Object.keys(updates) as (keyof SystemSettingsData)[];

  for (const key of keys) {
    const val = updates[key];
    if (val !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(val) },
        create: { key, value: String(val) },
      });
    }
  }

  return getSystemSettings();
}
