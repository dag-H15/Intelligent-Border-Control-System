import "dotenv/config";
import prisma from "../config/prisma";
import { detectImageFormat } from "./fileValidation";

const AI_URL = (process.env.AI_SERVICE_BASE_URL || process.env.AI_SERVICE_URL || "http://localhost:5001")
  .replace(/\/(verify|enroll)\/?$/i, "") + "/enroll";

function isRawImage(buffer: Buffer): boolean {
  const format = detectImageFormat(buffer);
  return format !== null;
}

async function extractTemplate(biometricType: "fingerprint" | "iris", imageBuffer: Buffer): Promise<Buffer> {
  const format = detectImageFormat(imageBuffer) || "png";
  const base64Data = Buffer.from(imageBuffer).toString("base64");
  const payload = `data:image/${format};base64,${base64Data}`;
  
  console.log(` -> Sending payload to AI service, length: ${payload.length}, prefix: ${payload.substring(0, 50)}...`);

  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      biometricType,
      image: payload,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI service enrollment failed with status ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as { template: string };
  if (!result.template) {
    throw new Error(`AI service returned empty template for ${biometricType}`);
  }

  return Buffer.from(result.template, "base64");
}

async function fixBiometrics() {
  console.log(`AI Enrollment Endpoint: ${AI_URL}`);
  console.log("Fetching biometrics from database...");
  
  const biometrics = await prisma.biometric.findMany();
  console.log(`Found ${biometrics.length} biometric records.`);

  let updatedCount = 0;

  for (const record of biometrics) {
    const isFpRaw = isRawImage(record.fingerprintTemplate);
    const isIrisRaw = isRawImage(record.irisTemplate);

    if (isFpRaw || isIrisRaw) {
      console.log(`\nTraveler ID ${record.travelerId}: Raw image detected.`);
      let fpBuffer = record.fingerprintTemplate;
      let irisBuffer = record.irisTemplate;

      if (isFpRaw) {
        console.log(` -> Extracting template for fingerprint (raw size: ${record.fingerprintTemplate.length} bytes)...`);
        try {
          fpBuffer = await extractTemplate("fingerprint", record.fingerprintTemplate);
          console.log(`    Successfully extracted fingerprint template (${fpBuffer.length} bytes).`);
        } catch (err: any) {
          console.error(`    [ERROR] Failed to extract fingerprint template: ${err?.message}`);
        }
      }

      if (isIrisRaw) {
        console.log(` -> Extracting template for iris (raw size: ${record.irisTemplate.length} bytes)...`);
        try {
          irisBuffer = await extractTemplate("iris", record.irisTemplate);
          console.log(`    Successfully extracted iris template (${irisBuffer.length} bytes).`);
        } catch (err: any) {
          console.error(`    [ERROR] Failed to extract iris template: ${err?.message}`);
        }
      }

      // Update database if templates were extracted
      if (fpBuffer !== record.fingerprintTemplate || irisBuffer !== record.irisTemplate) {
        await prisma.biometric.update({
          where: { id: record.id },
          data: {
            fingerprintTemplate: fpBuffer,
            irisTemplate: irisBuffer,
          },
        });
        console.log(` -> Updated database record for Traveler ID ${record.travelerId}.`);
        updatedCount++;
      }
    }
  }

  console.log(`\nMigration completed. Updated ${updatedCount} records.`);
}

fixBiometrics()
  .catch((err) => {
    console.error("Migration script failed:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
