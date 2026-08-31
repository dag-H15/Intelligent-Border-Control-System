"""
Services Quality — Shared Orchestration for Biometric Quality Assurance
"""

from fingerprint.quality import check_quality as check_fp_quality
from iris.quality import check_iris_quality


def check_biometric_quality(payload: str, biometric_type: str) -> dict:
    b_type = (biometric_type or "fingerprint").lower()
    if b_type == "iris":
        return check_iris_quality(payload)
    return check_fp_quality(payload)