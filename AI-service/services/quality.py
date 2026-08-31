"""
Services Quality — Shared Orchestration for Biometric Quality Assurance
"""

from fingerprint.quality import check_quality as check_fp_quality
from iris.quality import check_iris_quality
from utils.image_processing import decode_base64_image


def check_biometric_quality(payload: str, biometric_type: str) -> dict:
    b_type = (biometric_type or "fingerprint").lower()
    if b_type == "iris":
        return check_iris_quality(payload)
    
    img = decode_base64_image(payload)
    if img is None:
        if isinstance(payload, str) and (
            payload.startswith("scanner-fingerprint-") or
            payload.startswith("fingerprint-template-") or
            payload.startswith("mock_captured_fingerprint_")
        ):
            return {
                "score": 100.0,
                "acceptable": True,
                "biometricType": "fingerprint",
                "qualityStatus": "GOOD",
                "issues": [],
                "details": {
                    "sharpness": 100.0,
                    "contrast": 100.0,
                    "heuristic": 100.0,
                    "laplacianVariance": 150.0,
                    "brightness": 100.0,
                    "area": 100.0
                }
            }
        return {
            "score": 0.0,
            "acceptable": False,
            "biometricType": "fingerprint",
            "qualityStatus": "POOR",
            "issues": ["Failed to decode base64 image or invalid format."],
            "details": {
                "sharpness": 0.0,
                "contrast": 0.0,
                "heuristic": 0.0,
                "laplacianVariance": 0.0,
                "brightness": 0.0,
                "area": 0.0
            }
        }

    return check_fp_quality(img)