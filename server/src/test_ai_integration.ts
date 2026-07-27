import { getBiometricScores } from "./services/aiClient";
import { decideVerification } from "./services/decisionEngine";

async function runTest() {
  console.log("=== Testing Node -> Python AI Service REST Integration ===");

  try {
    // Test 1: Simulation Mode (Image Buffers)
    console.log("\n--- Test 1: Simulation Mode (Image Upload) ---");
    const simResult = await getBiometricScores({
      captureMode: "SIMULATION",
      fingerprintBuffer: Buffer.from("mock_captured_fingerprint_image_data"),
      irisBuffer: Buffer.from("mock_captured_iris_image_data"),
      referenceFingerprint: Buffer.from("mock_reference_fingerprint_template"),
      referenceIris: Buffer.from("mock_reference_iris_template"),
    });

    console.log("AI Service Response (Simulation):", simResult);
    if (
      typeof simResult.fingerprintScore === "number" &&
      typeof simResult.irisScore === "number" &&
      typeof simResult.finalScore === "number"
    ) {
      console.log("✔ Simulation Mode AI response contract valid!");
    } else {
      throw new Error("Invalid response format for Simulation Mode");
    }

    // Test 2: Scanner Mode (Hardware Tokens)
    console.log("\n--- Test 2: Scanner Mode (Device Tokens) ---");
    const scanResult = await getBiometricScores({
      captureMode: "SCANNER",
      fingerprintData: "scanner-fingerprint-994812",
      irisData: "scanner-iris-994812",
      referenceFingerprint: Buffer.from("fingerprint-template-FAN-100001"),
      referenceIris: Buffer.from("iris-template-FAN-100001"),
    });

    console.log("AI Service Response (Scanner):", scanResult);
    if (
      typeof scanResult.fingerprintScore === "number" &&
      typeof scanResult.irisScore === "number" &&
      typeof scanResult.finalScore === "number"
    ) {
      console.log("✔ Scanner Mode AI response contract valid!");
    } else {
      throw new Error("Invalid response format for Scanner Mode");
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
