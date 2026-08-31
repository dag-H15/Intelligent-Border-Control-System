"""
Services Matcher — Shared Orchestration for Fingerprint and Iris Biometrics
"""

from fingerprint.engine import enroll_fingerprint, verify_fingerprint
from iris.engine import IrisEngine

iris_engine = IrisEngine()


def extract_template(payload: str, biometric_type: str) -> dict:
    b_type = (biometric_type or "fingerprint").lower()
    if b_type == "iris":
        template = iris_engine.extract_template(payload)
        return {
            "template": template,
            "biometricType": "iris",
            "encoding": "base64",
        }
    return enroll_fingerprint(payload)


def compare_templates(
    captured_data: str,
    stored_template: str,
    biometric_type: str,
    threshold: float = 85.0,
) -> dict:
    b_type = (biometric_type or "fingerprint").lower()
    if b_type == "iris":
        score = iris_engine.compare_template(captured_data, stored_template)
        return {
            "score": score,
            "match": score >= threshold,
            "biometricType": "iris",
        }
    return verify_fingerprint(captured_data, stored_template, threshold)


def evaluate_verification(
    traveler_id: int | None,
    capture_mode: str,
    fingerprint_captured: str,
    iris_captured: str,
    ref_fingerprint: str,
    ref_iris: str,
    threshold: float = 95.0,
) -> dict:
    fp_result = compare_templates(fingerprint_captured, ref_fingerprint, "fingerprint", threshold)
    iris_result = compare_templates(iris_captured, ref_iris, "iris", threshold)
    final_score = round((fp_result["score"] + iris_result["score"]) / 2, 2)

    if final_score >= threshold:
        decision = "VERIFIED"
    elif final_score >= 85.0:
        decision = "PENDING_SUPERVISOR_REVIEW"
    else:
        decision = "REJECTED"

    return {
        "fingerprintScore": fp_result["score"],
        "irisScore": iris_result["score"],
        "finalScore": final_score,
        "decision": decision,
    }
