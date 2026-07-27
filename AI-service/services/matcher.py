from models.predictor import predictor

def evaluate_verification(
    traveler_id: int | None,
    capture_mode: str,
    fingerprint_captured: str,
    iris_captured: str,
    ref_fingerprint: str,
    ref_iris: str,
    threshold: float = 95.0
) -> dict:
    """
    Evaluates captured fingerprint and iris against stored reference templates.
    Returns calculated scores and system decision.
    """
    fp_score = predictor.predict_match_score(
        fingerprint_captured, ref_fingerprint, biometric_type="fingerprint", capture_mode=capture_mode
    )

    iris_score = predictor.predict_match_score(
        iris_captured, ref_iris, biometric_type="iris", capture_mode=capture_mode
    )

    final_score = round((fp_score + iris_score) / 2, 2)

    # Decision logic based on configurable threshold
    if final_score >= threshold:
        decision = "VERIFIED"
    elif final_score >= 85.0:
        decision = "PENDING_SUPERVISOR_REVIEW"
    else:
        decision = "REJECTED"

    return {
        "fingerprintScore": fp_score,
        "irisScore": iris_score,
        "finalScore": final_score,
        "decision": decision
    }
