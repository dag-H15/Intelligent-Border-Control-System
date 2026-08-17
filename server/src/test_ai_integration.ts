import { compareBiometricTemplate, extractBiometricTemplate } from "./services/aiClient";
import { decideVerification } from "./services/decisionEngine";

async function runTest() {
  console.log("=== Testing Node -> Python AI Service REST Integration ===");

  const sampleImage =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  try {
    console.log("\n--- Test 1: Template extraction ---");
    const extracted = await extractBiometricTemplate({
      biometricType: "fingerprint",
      imageData: sampleImage,
    });

    if (!extracted.template) {
      throw new Error("Template extraction returned an empty payload");
    }
    console.log("AI Service response (template extraction):", {
      biometricType: extracted.biometricType,
      templateLength: extracted.template.length,
    });

    console.log("\n--- Test 2: Template comparison ---");
    const compareResult = await compareBiometricTemplate({
      biometricType: "fingerprint",
      imageData: sampleImage,
      storedTemplate: Buffer.from(extracted.template, "base64"),
    });

    console.log("AI Service response (comparison):", compareResult);
    if (typeof compareResult.score !== "number" || typeof compareResult.match !== "boolean") {
      throw new Error("Invalid response format for template comparison");
    }

    // Test 3: Decision Engine Verification
    console.log("\n--- Test 3: Decision Engine Verification ---");
    const verifiedDecision = decideVerification(96, 95);
    const reviewDecision = decideVerification(88, 95);
    const rejectedDecision = decideVerification(75, 95);

    console.log("Score 96 (Threshold 95) ->", verifiedDecision, "(Expected: VERIFIED)");
    console.log("Score 88 (Threshold 95) ->", reviewDecision, "(Expected: PENDING_SUPERVISOR_REVIEW)");
    console.log("Score 75 (Threshold 95) ->", rejectedDecision, "(Expected: REJECTED)");

    if (
      verifiedDecision === "VERIFIED" &&
      reviewDecision === "PENDING_SUPERVISOR_REVIEW" &&
      rejectedDecision === "REJECTED"
    ) {
      console.log("✔ Decision Engine rules verified!");
    } else {
      throw new Error("Decision Engine verification failed");
    }

    console.log("\n✅ ALL AI INTEGRATION TESTS PASSED SUCCESSFULLY!");
  } catch (err: any) {
    console.error("\n❌ Test failed:", err?.message || err);
    process.exit(1);
  }
}

runTest();
