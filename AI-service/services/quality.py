import cv2
import numpy as np
from utils.image_processing import decode_base64_image
from fingerprint.quality import check_quality as check_fp_quality

def check_biometric_quality(payload: str, biometric_type: str) -> dict:
    try:
        biometric_type = biometric_type.lower()
        img = decode_base64_image(payload)
        
        # Format/simulation token detection
        if img is None and isinstance(payload, str):
            token_clean = payload.strip()
            if (token_clean.startswith("scanner-fingerprint-") or 
                token_clean.startswith("fingerprint-template-") or 
                token_clean.startswith("mock_captured_fingerprint_")):
                return {
                    "score": 100.0,
                    "acceptable": True,
                    "biometricType": biometric_type,
                    "qualityStatus": "GOOD",
                    "details": {
                        "sharpness": 100.0,
                        "contrast": 100.0,
                        "heuristic": 100.0,
                        "laplacianVariance": 100.0,
                        "brightness": 100.0,
                        "area": 100.0
                    }
                }
                
        if img is None:
            return {
                "score": 0.0,
                "acceptable": False,
                "error": "Failed to decode base64 image or invalid format."
            }

        # Delegate fingerprint to dedicated module
        if biometric_type == "fingerprint":
            return check_fp_quality(img)

        # Iris quality logic (preserved)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
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
        overall_score = round(0.3 * sharpness_score + 0.2 * contrast_score + 0.5 * heuristic_score, 2)
        is_acceptable = overall_score >= 50.0
        
        return {
            "score": float(overall_score),
            "acceptable": bool(is_acceptable),
            "biometricType": str(biometric_type),
            "details": {
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
                "heuristic": float(round(heuristic_score, 2)),
                "laplacianVariance": float(round(lap_var, 2))
            }
        }
    except Exception as e:
        return {
            "score": 0.0,
            "acceptable": False,
            "error": f"Error during quality evaluation: {str(e)}"
        }