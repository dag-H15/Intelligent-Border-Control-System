"""
quality.py
----------
Multi-signal biometric quality assessment and validity gating for iris captures.

Evaluates modality-specific structural signatures (pupil/iris boundary segmentation,
geometric plausibility, annular texture, pupil-iris contrast, usable area, occlusion)
before generic image metrics, preventing non-biometric images (charts, documents,
screenshots, random noise) from receiving high quality scores.
"""

from __future__ import annotations

import cv2
import numpy as np
from iris.config import (
    MIN_QUALITY_THRESHOLD,
    QUALITY_ACCEPTABLE_THRESHOLD,
    QUALITY_GOOD_THRESHOLD,
    IRIS_MIN_VALIDITY_SCORE,
    MIN_LAPLACIAN_VAR,
    MIN_CONTRAST_STD,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    MAX_REFLECTION_RATIO,
    MIN_USABLE_MASK_RATIO,
)
from iris.preprocessing import preprocess_iris_image, validate_iris_image
from iris.segmentation import segment_iris, _detect_pupil


def check_quality(img_bgr: np.ndarray) -> dict:
    """
    Perform biometric-specific multi-signal quality assessment on a raw BGR iris image.
    """
    valid, err = validate_iris_image(img_bgr)
    if not valid:
        return {
            "score": 0.0,
            "acceptable": False,
            "biometricValid": False,
            "biometricType": "iris",
            "qualityStatus": "INVALID_BIOMETRIC",
            "issues": [err],
            "details": {
                "sharpness": 0.0,
                "contrast": 0.0,
                "brightness": 0.0,
                "usableArea": 0.0,
                "segmentationConfidence": 0.0,
                "laplacianVariance": 0.0,
            },
            "signals": {},
        }

    try:
        gray, enhanced, refl_mask = preprocess_iris_image(img_bgr)
        h, w = gray.shape[:2]

        # 1. Supporting generic image metrics
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sharpness_score = min(100.0, (lap_var / 120.0) * 100.0)

        contrast = float(np.std(gray))
        contrast_score = min(100.0, (contrast / 45.0) * 100.0)

        mean_brightness = float(np.mean(gray))
        brightness_dev = abs(mean_brightness - 127.5)
        brightness_score = max(0.0, 100.0 - (brightness_dev / 1.275))

        # 2. Specular reflection percentage
        refl_pixels = int(np.sum(refl_mask == 255))
        refl_ratio = refl_pixels / float(gray.size)
        refl_score = max(0.0, 100.0 - (refl_ratio / MAX_REFLECTION_RATIO) * 100.0)

        # 3. Iris and pupil segmentation
        seg_res = segment_iris(gray, enhanced, refl_mask)

        # Handle segmentation failure: distinguish degraded blurry eye from non-biometric image
        if not seg_res.is_valid:
            pupil_cand = _detect_pupil(gray, enhanced, refl_mask)
            has_dark_pupil_core = False

            if pupil_cand is not None:
                px, py, pr = pupil_cand
                if 0 <= px < w and 0 <= py < h and pr >= 10:
                    p_mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(p_mask, (px, py), max(1, int(pr * 0.7)), 255, -1)
                    p_mean = float(cv2.mean(gray, mask=p_mask)[0])
                    # In a real eye, pupil core is dark (<= 120) and darker than background
                    if p_mean <= 120.0 and p_mean < (mean_brightness - 10.0):
                        has_dark_pupil_core = True

            if has_dark_pupil_core:
                # Real eye, but degraded capture (blurry, poorly illuminated, occluded)
                degraded_score = float(round(min(sharpness_score * 0.25 + contrast_score * 0.25, 36.0), 2))
                return {
                    "score": degraded_score,
                    "acceptable": False,
                    "biometricValid": True,
                    "biometricType": "iris",
                    "qualityStatus": "POOR",
                    "issues": ["Iris image is blurry or has unlocatable outer boundary", "Segmentation confidence too low"],
                    "details": {
                        "sharpness": float(round(sharpness_score, 2)),
                        "contrast": float(round(contrast_score, 2)),
                        "brightness": float(round(brightness_score, 2)),
                        "segmentationConfidence": 10.0,
                        "usableArea": 0.0,
                        "usableAreaRatio": 0.0,
                        "laplacianVariance": float(round(lap_var, 2)),
                        "reflectionRatio": float(round(refl_ratio, 4)),
                        "heuristic": 10.0,
                    },
                    "signals": {
                        "pupilDetectionConfidence": 20.0,
                        "irisBoundaryConfidence": 0.0,
                        "pupilIrisGeometry": 10.0,
                        "usableIrisRatio": 0.0,
                        "annularTexture": 0.0,
                        "occlusionRatio": 1.0,
                        "reflectionRatio": float(round(refl_ratio, 4)),
                        "sharpness": float(round(sharpness_score, 2)),
                        "contrast": float(round(contrast_score, 2)),
                    },
                }

            # Completely non-biometric image (chart, doc, screenshot, noise, blank)
            low_score = float(round(min(sharpness_score * 0.10 + contrast_score * 0.10, 20.0), 2))
            return {
                "score": low_score,
                "acceptable": False,
                "biometricValid": False,
                "biometricType": "iris",
                "qualityStatus": "INVALID_BIOMETRIC",
                "issues": ["No reliable pupil and iris boundaries detected (invalid biometric sample)"],
                "details": {
                    "sharpness": float(round(sharpness_score, 2)),
                    "contrast": float(round(contrast_score, 2)),
                    "brightness": float(round(brightness_score, 2)),
                    "segmentationConfidence": 0.0,
                    "usableArea": 0.0,
                    "usableAreaRatio": 0.0,
                    "laplacianVariance": float(round(lap_var, 2)),
                    "reflectionRatio": float(round(refl_ratio, 4)),
                    "heuristic": 0.0,
                },
                "signals": {
                    "pupilDetectionConfidence": 0.0,
                    "irisBoundaryConfidence": 0.0,
                    "pupilIrisGeometry": 0.0,
                    "usableIrisRatio": 0.0,
                    "annularTexture": 0.0,
                    "occlusionRatio": 1.0,
                    "reflectionRatio": float(round(refl_ratio, 4)),
                    "sharpness": float(round(sharpness_score, 2)),
                    "contrast": float(round(contrast_score, 2)),
                },
            }

        # Extract biometric signals from valid segmentation
        seg_confidence = seg_res.confidence
        usable_area_ratio = seg_res.usable_area_ratio
        area_score = min(100.0, (usable_area_ratio / 0.70) * 100.0)

        pupil_contrast = seg_res.details.get("pupilContrast", 0.0)
        iris_contrast = seg_res.details.get("irisContrast", 0.0)
        annulus_mean = seg_res.details.get("annulusMean", 0.0)
        annulus_std = seg_res.details.get("annulusStd", 0.0)
        pupil_mean = seg_res.details.get("pupilMean", 150.0)
        pupil_iris_diff = seg_res.details.get("pupilIrisDiff", 0.0)

        texture_score = min(100.0, (annulus_std / 25.0) * 100.0)
        diff_score = min(100.0, (max(0.0, pupil_iris_diff) / 25.0) * 100.0)

        # =====================================================================
        # Biometric Validity Gate (Multi-Signal Consensus)
        # =====================================================================
        validity_score = (
            0.35 * seg_confidence
            + 0.25 * area_score
            + 0.20 * texture_score
            + 0.20 * diff_score
        )

        # Real iris images must have a dark pupil core and a meaningful pupil-to-iris contrast.
        # Random noise and charts may create circular contours and gradients, but they do not
        # produce the photometric signature of an actual eye.
        # Relaxed thresholds to accept natural iris variation while still rejecting non-biometric images:
        #   - pupil_mean: <= 150 allows for varied pupil darkness
        #   - annulus_std: >= 4.0 (from 6.0) accepts textured iris areas
        #   - pupil_iris_diff: >= 8.0 (from 12.0) allows modest pupil-iris contrast
        #   - annulus_mean - pupil_mean: >= 8.0 (from 12.0) weaker separation still distinguishes eye from noise
        actual_dark_pupil = (
            pupil_mean <= 150.0
            and annulus_std >= 4.0
            and pupil_iris_diff >= 8.0
            and (annulus_mean - pupil_mean) >= 8.0
        )

        # Require at least 2 of 3 photometric evidence (relaxed from requiring all conditions + extra contrast)
        has_texture = annulus_std >= 4.0
        has_contrast = (pupil_contrast >= 3.0 or iris_contrast >= 3.0)
        has_pupil_iris_boundary = pupil_iris_diff >= 8.0
        photometric_evidence = sum([has_texture, has_contrast, has_pupil_iris_boundary]) >= 2

        is_biometric_valid = (
            validity_score >= IRIS_MIN_VALIDITY_SCORE
            and usable_area_ratio >= 0.15
            and seg_confidence >= 35.0
            and actual_dark_pupil
            and photometric_evidence
        )

        if not is_biometric_valid:
            low_score = float(round(min(validity_score * 0.35, 24.0), 2))
            return {
                "score": low_score,
                "acceptable": False,
                "biometricValid": False,
                "biometricType": "iris",
                "qualityStatus": "INVALID_BIOMETRIC",
                "issues": ["Image lacks distinct iris texture and biometric structure (invalid biometric sample)"],
                "details": {
                    "sharpness": float(round(sharpness_score, 2)),
                    "contrast": float(round(contrast_score, 2)),
                    "brightness": float(round(brightness_score, 2)),
                    "segmentationConfidence": float(round(seg_confidence, 2)),
                    "usableArea": float(round(area_score, 2)),
                    "usableAreaRatio": float(round(usable_area_ratio, 3)),
                    "laplacianVariance": float(round(lap_var, 2)),
                    "reflectionRatio": float(round(refl_ratio, 4)),
                    "heuristic": float(round(validity_score, 2)),
                },
                "signals": {
                    "pupilDetectionConfidence": float(round(pupil_contrast * 5.0, 2)),
                    "irisBoundaryConfidence": float(round(iris_contrast * 5.0, 2)),
                    "pupilIrisGeometry": float(round(seg_confidence, 2)),
                    "usableIrisRatio": float(round(usable_area_ratio, 3)),
                    "annularTexture": float(round(annulus_std, 2)),
                    "occlusionRatio": float(round(1.0 - usable_area_ratio, 3)),
                    "reflectionRatio": float(round(refl_ratio, 4)),
                    "sharpness": float(round(sharpness_score, 2)),
                    "contrast": float(round(contrast_score, 2)),
                },
            }

        # =====================================================================
        # Multi-Signal Quality Scoring for Valid Iris Images
        # =====================================================================
        composite_score = (
            0.30 * seg_confidence
            + 0.25 * area_score
            + 0.20 * texture_score
            + 0.15 * sharpness_score
            + 0.10 * refl_score
        )

        # Penalize degraded biometrics (blur, low contrast, underexposure, heavy occlusion)
        # RELAXED: Only severely penalize very blurry images (lap_var < 15.0), not marginally soft images
        # Real iris captures often have moderate blur but are still usable for matching
        if lap_var < 15.0:
            composite_score = min(composite_score, 45.0)  # Reduced from 38.0
        if contrast < 18.0 or annulus_std < 10.0:
            composite_score = min(composite_score, 38.0)
        if mean_brightness < MIN_BRIGHTNESS or mean_brightness > MAX_BRIGHTNESS:
            composite_score = min(composite_score, 38.0)
        if usable_area_ratio < MIN_USABLE_MASK_RATIO:
            composite_score = min(composite_score, 38.0)

        overall_score = float(round(np.clip(composite_score, 0.0, 100.0), 2))

        if overall_score >= QUALITY_GOOD_THRESHOLD:
            status = "GOOD"
        elif overall_score >= QUALITY_ACCEPTABLE_THRESHOLD:
            status = "ACCEPTABLE"
        else:
            status = "POOR"

        issues: list[str] = []
        if lap_var < MIN_LAPLACIAN_VAR or sharpness_score < 35.0:
            issues.append("Iris image is blurry")
        if contrast < MIN_CONTRAST_STD or contrast_score < 35.0:
            issues.append("Low image contrast in iris texture")
        if mean_brightness < MIN_BRIGHTNESS:
            issues.append("Image is underexposed (too dark)")
        elif mean_brightness > MAX_BRIGHTNESS:
            issues.append("Image is overexposed (too bright)")
        if usable_area_ratio < MIN_USABLE_MASK_RATIO:
            issues.append("Heavy eyelid or eyelash occlusion")
        if refl_ratio > MAX_REFLECTION_RATIO:
            issues.append("Excessive specular reflections in iris region")

        is_acceptable = (
            (overall_score >= MIN_QUALITY_THRESHOLD)
            and is_biometric_valid
            and (lap_var >= 18.0)
            and (usable_area_ratio >= 0.20)
        )

        return {
            "score": overall_score,
            "acceptable": bool(is_acceptable),
            "biometricValid": True,
            "biometricType": "iris",
            "qualityStatus": status,
            "issues": issues,
            "details": {
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
                "brightness": float(round(brightness_score, 2)),
                "segmentationConfidence": float(round(seg_confidence, 2)),
                "usableArea": float(round(area_score, 2)),
                "usableAreaRatio": float(round(usable_area_ratio, 3)),
                "laplacianVariance": float(round(lap_var, 2)),
                "reflectionRatio": float(round(refl_ratio, 4)),
                "heuristic": float(round(seg_confidence, 2)),
            },
            "signals": {
                "pupilDetectionConfidence": float(round(pupil_contrast * 5.0, 2)),
                "irisBoundaryConfidence": float(round(iris_contrast * 5.0, 2)),
                "pupilIrisGeometry": float(round(seg_confidence, 2)),
                "usableIrisRatio": float(round(usable_area_ratio, 3)),
                "annularTexture": float(round(annulus_std, 2)),
                "occlusionRatio": float(round(1.0 - usable_area_ratio, 3)),
                "reflectionRatio": float(round(refl_ratio, 4)),
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
            },
        }

    except Exception as e:
        return {
            "score": 0.0,
            "acceptable": False,
            "biometricValid": False,
            "biometricType": "iris",
            "qualityStatus": "POOR",
            "issues": [f"Error during quality evaluation: {str(e)}"],
            "details": {
                "sharpness": 0.0,
                "contrast": 0.0,
                "brightness": 0.0,
                "usableArea": 0.0,
                "segmentationConfidence": 0.0,
                "laplacianVariance": 0.0,
            },
            "signals": {},
        }
