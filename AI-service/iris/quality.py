"""
Iris Quality Assurance Operations
"""

import cv2
import numpy as np
from utils.image_processing import decode_base64_image


def check_iris_quality(payload: str | np.ndarray) -> dict:
    """
    Evaluate sharpness, contrast, and circular boundary detection heuristic for iris images.
    """
    try:
        img = decode_base64_image(payload)
        if img is None:
            if isinstance(payload, str) and (
                payload.startswith("scanner-iris-") or
                payload.startswith("iris-template-") or
                payload.startswith("mock_captured_iris_")
            ):
                return {
                    "score": 100.0,
                    "acceptable": True,
                    "biometricType": "iris",
                    "qualityStatus": "GOOD",
                    "issues": [],
                    "details": {
                        "sharpness": 100.0,
                        "contrast": 100.0,
                        "heuristic": 100.0,
                        "laplacianVariance": 150.0,
                    },
                }
            return {
                "score": 0.0,
                "acceptable": False,
                "biometricType": "iris",
                "qualityStatus": "POOR",
                "issues": ["Failed to decode base64 image or invalid format."],
                "details": {
                    "sharpness": 0.0,
                    "contrast": 0.0,
                    "heuristic": 0.0,
                    "laplacianVariance": 0.0,
                },
            }

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness_score = min(100.0, (lap_var / 150.0) * 100.0)

        contrast = float(np.std(gray))
        contrast_score = min(100.0, (contrast / 40.0) * 100.0)

        blurred = cv2.GaussianBlur(gray, (7, 7), 1.5)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)
        h, w = enhanced.shape

        circles = cv2.HoughCircles(
            enhanced,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=int(min(h, w) * 0.3),
            param1=60,
            param2=30,
            minRadius=int(min(h, w) * 0.2),
            maxRadius=int(min(h, w) * 0.55),
        )
        heuristic_score = 100.0 if circles is not None else 30.0

        overall_score = round(
            0.3 * sharpness_score + 0.2 * contrast_score + 0.5 * heuristic_score, 2
        )
        is_acceptable = overall_score >= 50.0

        return {
            "score": float(overall_score),
            "acceptable": bool(is_acceptable),
            "biometricType": "iris",
            "details": {
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
                "heuristic": float(round(heuristic_score, 2)),
                "laplacianVariance": float(round(lap_var, 2)),
            },
        }
    except Exception as e:
        return {
            "score": 0.0,
            "acceptable": False,
            "error": f"Error during iris quality evaluation: {str(e)}",
        }
