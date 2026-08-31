"""
quality.py
----------
Fingerprint biometric quality assessment.
"""

import cv2
import numpy as np
from fingerprint.config import (
    MIN_QUALITY_THRESHOLD,
    QUALITY_GOOD_THRESHOLD,
    QUALITY_ACCEPTABLE_THRESHOLD
)
from fingerprint.preprocessing import preprocess_fingerprint_image

def check_quality(img_bgr: np.ndarray) -> dict:
    """
    Perform a biometric quality assessment on the fingerprint image.

    Parameters:
    ----------
    img_bgr : np.ndarray
        Raw input fingerprint image in BGR format.

    Returns:
    -------
    dict
        Standardized quality check result containing overall score, acceptable status,
        quality status string, details, and identified issues.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    
    # 1. Sharpness/Blur (Laplacian variance)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness_score = min(100.0, (lap_var / 150.0) * 100.0)
    
    # 2. Contrast (Standard deviation of pixel intensities)
    contrast = float(np.std(gray))
    contrast_score = min(100.0, (contrast / 40.0) * 100.0)
    
    # 3. Brightness (Mean pixel value)
    mean_brightness = float(np.mean(gray))
    brightness_dev = abs(mean_brightness - 127.5)
    brightness_score = max(0.0, 100.0 - (brightness_dev / 1.275))
    
    # 4. Contact Area and Clarity (using preprocessing mask)
    normalized, mask = preprocess_fingerprint_image(img_bgr)
    fg_area_ratio = np.sum(mask == 255) / mask.size
    area_score = min(100.0, (fg_area_ratio / 0.40) * 100.0)
    
    # 5. Texture/Ridge Clarity (ORB feature density on active ridges)
    orb = cv2.ORB_create(nfeatures=256)
    kps = orb.detect(normalized, mask)
    kp_count = len(kps)
    clarity_score = min(100.0, (kp_count / 30.0) * 100.0)
    
    # Overall score calculation (weighted combination)
    overall_score = round(0.2 * sharpness_score + 0.2 * contrast_score + 0.2 * brightness_score + 0.2 * area_score + 0.2 * clarity_score, 2)
    
    # Biometric quality penalization: if any critical metric is extremely poor,
    # the overall quality cannot be high.
    if sharpness_score < 30.0:
        overall_score = min(overall_score, sharpness_score + 10.0)
    if area_score < 30.0:
        overall_score = min(overall_score, area_score + 10.0)
        
    overall_score = round(max(0.0, min(100.0, overall_score)), 2)
    
    # Quality status classification and strict acceptability check
    if overall_score >= QUALITY_GOOD_THRESHOLD:
        status = "GOOD"
    elif overall_score >= QUALITY_ACCEPTABLE_THRESHOLD:
        status = "ACCEPTABLE"
    else:
        status = "POOR"
        
    # Identification of specific quality issues
    issues = []
    if sharpness_score < 40.0:
        issues.append("Fingerprint image is blurry")
    if contrast_score < 40.0:
        issues.append("Low contrast in ridge details")
    if brightness_score < 40.0:
        if mean_brightness > 200.0:
            issues.append("Image is overexposed (too bright)")
        else:
            issues.append("Image is underexposed (too dark)")
    if area_score < 30.0:
        issues.append("Fingerprint contact area is too small")
    if clarity_score < 35.0:
        issues.append("Insufficient ridge detail detected")
        
    # acceptable requires overall score and no critical blockages (extreme blur or no active area)
    is_acceptable = (overall_score >= MIN_QUALITY_THRESHOLD) and (sharpness_score >= 20.0) and (area_score >= 20.0)

        
    return {
        "score": float(overall_score),
        "acceptable": bool(is_acceptable),
        "biometricType": "fingerprint",
        "qualityStatus": status,
        "issues": issues,
        "details": {
            "sharpness": float(round(sharpness_score, 2)),
            "contrast": float(round(contrast_score, 2)),
            "heuristic": float(round(clarity_score, 2)),
            "laplacianVariance": float(round(lap_var, 2)),
            "brightness": float(round(brightness_score, 2)),
            "area": float(round(area_score, 2))
        }
    }

