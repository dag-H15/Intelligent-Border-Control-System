from models.predictor import predictor
from fingerprint.engine import enroll_fingerprint, verify_fingerprint
from iris.engine import enroll_iris, verify_iris


def extract_template(payload: str, biometric_type: str) -> dict:
    btype = biometric_type.lower()
    if btype == "fingerprint":
        return enroll_fingerprint(payload)
    if btype == "iris":
        return enroll_iris(payload)
        
    template = predictor.extract_template(payload, biometric_type)
    return {
        "template": template,
        "biometricType": biometric_type,
        "encoding": "base64",
    }


def compare_templates(
    captured_data: str,
    stored_template: str,
    biometric_type: str,
    threshold: float = 85.0,
) -> dict:
    btype = biometric_type.lower()
    if btype == "fingerprint":
        return verify_fingerprint(captured_data, stored_template, threshold)
    if btype == "iris":
        return verify_iris(captured_data, stored_template, threshold)
        
    score = predictor.compare_template(captured_data, stored_template, biometric_type)
    return {
        "score": score,
        "match": score >= threshold,
        "biometricType": biometric_type,
    }



def evaluate_verification(
    traveler_id: int | None,
    capture_mode: str,
    fingerprint_captured: str,
    iris_captured: str,
    ref_fingerprint: str,
    ref_iris: str,
    threshold: float = 95.0,
) -> dict:
    """Compatibility wrapper that keeps the old combined verification response available."""
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
