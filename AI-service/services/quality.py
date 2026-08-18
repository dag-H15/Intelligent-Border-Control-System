import cv2
import numpy as np
from utils.image_processing import decode_base64_image

def check_biometric_quality(payload: str, biometric_type: str) -> dict:
    try:
        biometric_type = biometric_type.lower()
        img = decode_base64_image(payload)
        if img is None:
            return {
                "score": 0.0,
                "acceptable": False,
                "error": "Failed to decode base64 image or invalid format."
            }
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness_score = min(100.0, (lap_var / 150.0) * 100.0)
        contrast = float(np.std(gray))
        contrast_score = min(100.0, (contrast / 40.0) * 100.0)
        if biometric_type == "iris":
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
        else:
            orb = cv2.ORB_create(nfeatures=256)
            kps = orb.detect(gray, None)
            kp_count = len(kps)
            heuristic_score = min(100.0, (kp_count / 30.0) * 100.0)
            overall_score = round(0.3 * sharpness_score + 0.3 * contrast_score + 0.4 * heuristic_score, 2)
        is_acceptable = overall_score >= 50.0
        return {
            "score": overall_score,
            "acceptable": is_acceptable,
            "biometricType": biometric_type,
            "details": {
                "sharpness": round(sharpness_score, 2),
                "contrast": round(contrast_score, 2),
                "heuristic": round(heuristic_score, 2),
                "laplacianVariance": round(lap_var, 2)
            }
        }
    except Exception as e:
        return {
            "score": 0.0,
            "acceptable": False,
            "error": f"Error during quality evaluation: {str(e)}"
        }