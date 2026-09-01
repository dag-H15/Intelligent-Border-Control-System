"""
engine.py
---------
Orchestrator for the iris biometric enrollment and verification pipeline.
"""

from __future__ import annotations

import base64
import json
import cv2
import numpy as np
from datasets.embeddings import compute_dataset_matching_score
from utils.image_processing import decode_base64_image
from iris.config import (
    MIN_QUALITY_THRESHOLD,
    DEFAULT_MATCH_THRESHOLD,
    MIN_IMAGE_DIMENSION,
)
from iris.preprocessing import preprocess_iris_image
from iris.quality import check_quality
from iris.segmentation import segment_iris
from iris.normalization import normalize_iris
from iris.feature_extractor import extract_features, unpack_iris_template
from iris.matcher import compare_templates


def enroll_iris(payload: str) -> dict:
    """
    Extract an iris biometric template from the input payload.
    Supports real base64 images and mock simulation tokens.
    """
    if not payload:
        raise ValueError("Empty image payload")

    img = decode_base64_image(payload)

    if img is None:
        # Check if the payload is a text simulation token
        if isinstance(payload, str) and 0 < len(payload) < 256:
            token_clean = payload.strip()
            token_prefixes = ("iris-template-", "scanner-iris-", "mock_captured_iris_")
            if any(token_clean.startswith(p) for p in token_prefixes):
                template_b64 = base64.b64encode(token_clean.encode("utf-8")).decode("ascii")
                return {
                    "template": template_b64,
                    "biometricType": "iris",
                    "encoding": "base64",
                }
        raise ValueError("Invalid image format or corrupted data")

    # Image constraints check
    h, w = img.shape[:2]
    if h < MIN_IMAGE_DIMENSION or w < MIN_IMAGE_DIMENSION:
        raise ValueError(
            f"Image dimensions too small: {w}x{h} (minimum is {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION})"
        )

    # Quality check during enrollment
    quality_res = check_quality(img)
    if not quality_res["acceptable"]:
        issues_str = f": {', '.join(quality_res['issues'])}" if quality_res.get("issues") else ""
        raise ValueError(
            f"Iris image quality too low for enrollment ({quality_res['qualityStatus']}, score: {quality_res['score']}%){issues_str}"
        )

    # Preprocessing, Segmentation, Normalization & Feature Extraction
    gray, enhanced, refl_mask = preprocess_iris_image(img)
    seg_res = segment_iris(gray, enhanced, refl_mask)

    if not seg_res.is_valid:
        raise ValueError(
            f"Iris segmentation failed: {seg_res.details.get('error', 'Unreliable iris boundaries')}"
        )

    strip, val_mask = normalize_iris(
        gray,
        seg_res.occlusion_mask,
        seg_res.pupil_center[0],
        seg_res.pupil_center[1],
        seg_res.pupil_radius,
        seg_res.iris_center[0],
        seg_res.iris_center[1],
        seg_res.iris_radius,
    )

    template_bytes = extract_features(
        strip,
        val_mask,
        {
            "pupilCenter": seg_res.pupil_center,
            "pupilRadius": seg_res.pupil_radius,
            "irisCenter": seg_res.iris_center,
            "irisRadius": seg_res.iris_radius,
            "qualityScore": quality_res["score"],
        },
    )

    template_b64 = base64.b64encode(template_bytes).decode("ascii")

    return {
        "template": template_b64,
        "biometricType": "iris",
        "encoding": "base64",
        "qualityScore": quality_res["score"],
    }


def _build_iris_debug_info(
    img: np.ndarray | None,
    quality_res: dict | None,
    seg_res: object | None,
    template_type: str,
    template_dimensions: str,
    matching_algorithm: str,
    raw_match_value: float,
    normalized_similarity: float,
    final_displayed_percentage: float,
    final_verification_result: str,
    quality_failure_reason: str = "",
    match_details: dict | None = None,
) -> dict:
    """
    Build development-safe iris verification diagnostics without exposing raw templates.
    
    Includes comprehensive pipeline diagnostics:
    - Image dimensions and validation
    - Iris detection confidence and crop area
    - Quality assessment scores and failure reasons
    - Template types and dimensions
    - Matching algorithm and raw scores
    - Normalized similarity and final verification decision
    """
    height, width = img.shape[:2] if img is not None else (0, 0)
    detection_confidence = 0.0
    detected_crop_size = {"width": 0, "height": 0}
    iris_detected = False
    pupil_center = [0, 0]
    iris_center = [0, 0]
    pupil_radius = 0.0
    iris_radius = 0.0
    
    if seg_res is not None:
        detection_confidence = float(getattr(seg_res, "confidence", 0.0) or 0.0)
        iris_detected = bool(getattr(seg_res, "is_valid", False))
        iris_radius = float(getattr(seg_res, "iris_radius", 0) or 0.0)
        pupil_radius = float(getattr(seg_res, "pupil_radius", 0) or 0.0)
        detected_crop_size = {
            "width": int(abs(iris_radius * 2)),
            "height": int(abs(iris_radius * 2)),
        }
        pc = getattr(seg_res, "pupil_center", [0, 0])
        ic = getattr(seg_res, "iris_center", [0, 0])
        pupil_center = [float(pc[0] if pc else 0), float(pc[1] if pc else 0)]
        iris_center = [float(ic[0] if ic else 0), float(ic[1] if ic else 0)]

    quality_score = 0.0
    quality_status = "UNKNOWN"
    quality_issues = []
    
    if quality_res:
        quality_score = float(quality_res.get("score", 0.0) or 0.0)
        quality_status = quality_res.get("qualityStatus", "UNKNOWN")
        quality_issues = quality_res.get("issues", [])

    match_details = match_details or {}
    hamming_distance = match_details.get("hammingDistance", 0.0)
    phase_score = match_details.get("phaseScore", 0.0)
    texture_score = match_details.get("textureScore", 0.0)

    return {
        "imageDimensions": {"width": int(width), "height": int(height)},
        "imageValidationResult": "PASS" if (quality_res and quality_res.get("biometricValid", False)) else "FAIL",
        "irisDetected": iris_detected,
        "detectionConfidence": float(round(detection_confidence, 2)),
        "detectedIrisCropSize": detected_crop_size,
        "irisLocationAndSize": {
            "pupilCenter": pupil_center,
            "pupilRadius": float(round(pupil_radius, 2)),
            "irisCenter": iris_center,
            "irisRadius": float(round(iris_radius, 2)),
        },
        "qualityScore": float(round(quality_score, 2)),
        "qualityStatus": quality_status,
        "qualityFailureReasons": quality_issues,
        "enrollmentTemplateType": template_type,
        "enrollmentTemplateDimensions": template_dimensions,
        "verificationTemplateType": template_type,
        "verificationTemplateDimensions": template_dimensions,
        "matchingAlgorithm": matching_algorithm,
        "matchingDetails": {
            "hammingDistance": float(round(hamming_distance, 4)) if hamming_distance else 0.0,
            "phaseScore": float(round(phase_score, 2)) if phase_score else 0.0,
            "textureScore": float(round(texture_score, 2)) if texture_score else 0.0,
        },
        "rawMatchingValue": float(round(raw_match_value, 2)),
        "normalizedSimilarity": float(round(normalized_similarity, 2)),
        "finalDisplayedPercentage": float(round(final_displayed_percentage, 2)),
        "finalVerificationResult": final_verification_result,
    }


def verify_iris(
    captured_payload: str,
    reference_template: str | bytes,
    threshold: float | None = None,
) -> dict:
    """
    Verify a captured iris against a stored reference template.
    Returns standardized biometric decision contract with backward compatibility.
    """
    if threshold is None:
        threshold = DEFAULT_MATCH_THRESHOLD

    if not captured_payload:
        return _make_error_response("Captured iris payload is empty")

    if not reference_template:
        return _make_error_response("Stored reference template is empty")

    # 1. Format/Version Check on Reference Template
    is_token_ref = False
    decoded_ref_str = ""
    token_prefixes = ("iris-template-", "scanner-iris-", "mock_captured_iris_")

    if isinstance(reference_template, str):
        ref_clean = reference_template.strip()
        if any(ref_clean.startswith(p) for p in token_prefixes):
            is_token_ref = True
            decoded_ref_str = ref_clean

    if not is_token_ref:
        try:
            if isinstance(reference_template, str):
                ref_clean = reference_template.strip()
                if "," in ref_clean:
                    ref_clean = ref_clean.split(",", 1)[1]
                ref_bytes = base64.b64decode(ref_clean)
            else:
                ref_bytes = bytes(reference_template)

            try:
                decoded = ref_bytes.decode("utf-8", errors="strict").strip()
                if any(decoded.startswith(p) for p in token_prefixes):
                    is_token_ref = True
                    decoded_ref_str = decoded
            except (UnicodeDecodeError, ValueError):
                pass
        except Exception:
            return _make_error_response("Stored reference template decoding failed")

    # 2. Check if Captured Payload is a Simulation Token
    img = decode_base64_image(captured_payload)
    is_captured_token = False
    captured_token_str = ""

    if img is None and isinstance(captured_payload, str):
        token_clean = captured_payload.strip()
        if any(token_clean.startswith(p) for p in token_prefixes):
            is_captured_token = True
            captured_token_str = token_clean

    # 3. Handle Token-to-Token Simulation Mode
    if is_captured_token and is_token_ref:
        def clean(t: str) -> str:
            return (
                t.replace("scanner-iris-", "")
                .replace("iris-template-", "")
                .replace("mock_captured_iris_", "")
            )

        score = compute_dataset_matching_score(clean(captured_token_str), clean(decoded_ref_str))
        verified = score >= threshold

        return {
            "modality": "iris",
            "biometricType": "iris",
            "status": "VERIFIED" if verified else "NOT_MATCHED",
            "verified": verified,
            "match": verified,
            "qualityScore": 100.0,
            "matchScore": score,
            "score": score,
            "confidence": "HIGH" if verified else "LOW",
            "reason": (
                "Token-based iris verification successful"
                if verified
                else "Token-based iris verification mismatch"
            ),
            "processingDetails": {
                "qualityAccepted": True,
                "featureExtractionSuccessful": True,
                "tokenMatching": True,
            },
        }

    # 4. If Captured is a Token but Reference is a real biometric template (or vice-versa)
    if is_captured_token or is_token_ref:
        return {
            "modality": "iris",
            "biometricType": "iris",
            "status": "NOT_MATCHED",
            "verified": False,
            "match": False,
            "qualityScore": 0.0,
            "matchScore": 0.0,
            "score": 0.0,
            "confidence": "LOW",
            "reason": "Verification mismatch: mixed simulation token and real biometric data",
            "processingDetails": {
                "qualityAccepted": False,
                "featureExtractionSuccessful": False,
            },
        }

    # 5. Image-based verification pipeline
    if img is None:
        return _make_error_response("Captured image decoding failed or invalid format")

    h, w = img.shape[:2]
    if h < MIN_IMAGE_DIMENSION or w < MIN_IMAGE_DIMENSION:
        return _make_error_response(f"Captured image dimensions too small: {w}x{h}")

    # Quality check
    quality_res = check_quality(img)
    if not quality_res["acceptable"]:
        failure_status = "INVALID_BIOMETRIC" if quality_res.get("qualityStatus") == "INVALID_BIOMETRIC" else "QUALITY_RETRY"
        failure_reason = quality_res.get("issues", ["Iris quality check failed"])
        debug = _build_iris_debug_info(
            img=img,
            quality_res=quality_res,
            seg_res=None,
            template_type="UNKNOWN",
            template_dimensions="UNKNOWN",
            matching_algorithm="NOT_RUN",
            raw_match_value=0.0,
            normalized_similarity=0.0,
            final_displayed_percentage=0.0,
            final_verification_result=failure_status,
            quality_failure_reason=", ".join(failure_reason) if isinstance(failure_reason, list) else str(failure_reason),
        )
        return {
            "modality": "iris",
            "biometricType": "iris",
            "status": failure_status,
            "verified": False,
            "match": False,
            "qualityScore": quality_res["score"],
            "matchScore": 0.0,
            "score": 0.0,
            "confidence": "LOW",
            "reason": f"Iris quality check failed ({failure_status}): {', '.join(quality_res['issues'])}",
            "processingDetails": {
                "qualityAccepted": False,
                "featureExtractionSuccessful": False,
                "biometricValid": quality_res.get("biometricValid", False),
                "qualityDetails": quality_res.get("details", {}),
                "signals": quality_res.get("signals", {}),
                "irisDebug": debug,
            },
            "irisDebug": debug,
        }

    # Preprocessing, Segmentation, Normalization & Feature Extraction
    try:
        gray, enhanced, refl_mask = preprocess_iris_image(img)
        seg_res = segment_iris(gray, enhanced, refl_mask)

        if not seg_res.is_valid:
            return {
                "modality": "iris",
                "biometricType": "iris",
                "status": "QUALITY_RETRY",
                "verified": False,
                "match": False,
                "qualityScore": quality_res["score"],
                "matchScore": 0.0,
                "score": 0.0,
                "confidence": "LOW",
                "reason": f"Iris segmentation unreliable: {seg_res.details.get('error', 'Boundary detection failed')}",
                "processingDetails": {
                    "qualityAccepted": False,
                    "featureExtractionSuccessful": False,
                    "segmentationDetails": seg_res.details,
                },
            }

        strip, val_mask = normalize_iris(
            gray,
            seg_res.occlusion_mask,
            seg_res.pupil_center[0],
            seg_res.pupil_center[1],
            seg_res.pupil_radius,
            seg_res.iris_center[0],
            seg_res.iris_center[1],
            seg_res.iris_radius,
        )

        template_bytes = extract_features(
            strip,
            val_mask,
            {
                "pupilCenter": seg_res.pupil_center,
                "pupilRadius": seg_res.pupil_radius,
                "irisCenter": seg_res.iris_center,
                "irisRadius": seg_res.iris_radius,
                "qualityScore": quality_res["score"],
            },
        )

        captured_features = unpack_iris_template(template_bytes)
        if captured_features is None:
            return _make_error_response("Failed to extract features from captured image")

    except Exception as e:
        return _make_error_response(f"Feature extraction failed: {str(e)}")

    # 1:1 Matching
    try:
        score, version, match_details = compare_templates(captured_features, reference_template)
        if version == "UNKNOWN":
            return _make_error_response(match_details.get("error", "Unknown reference template format"))
    except Exception as e:
        return _make_error_response(f"Biometric matching algorithm failure: {str(e)}")

    verified = score >= threshold

    # Confidence calculation
    if score >= threshold + 5.0 and quality_res["qualityStatus"] == "GOOD":
        confidence = "HIGH"
    elif score < threshold - 10.0:
        confidence = "LOW"
    else:
        confidence = "MEDIUM"

    reason = "Iris verification successful" if verified else "Iris features mismatched the reference"

    debug = _build_iris_debug_info(
        img=img,
        quality_res=quality_res,
        seg_res=seg_res,
        template_type=version,
        template_dimensions=f"{captured_features['code_mat'].shape[1]}x{captured_features['code_mat'].shape[2]}",
        matching_algorithm="fractional_hamming_distance + texture_cosine_similarity",
        raw_match_value=float(score),
        normalized_similarity=float(score),
        final_displayed_percentage=float(score),
        final_verification_result="VERIFIED" if verified else "NOT_MATCHED",
        quality_failure_reason="",
        match_details=match_details,
    )

    result = {
        "modality": "iris",
        "biometricType": "iris",
        "status": "VERIFIED" if verified else "NOT_MATCHED",
        "verified": verified,
        "match": verified,
        "qualityScore": quality_res["score"],
        "matchScore": score,
        "score": score,
        "confidence": confidence,
        "reason": reason,
        "processingDetails": {
            "qualityAccepted": True,
            "featureExtractionSuccessful": True,
            "referenceFormat": version,
            "matchDetails": match_details,
            "qualityDetails": quality_res["details"],
            "segmentationDetails": seg_res.details,
            "irisDebug": debug,
        },
        "irisDebug": debug,
    }
    return result


def _make_error_response(message: str) -> dict:
    """Helper to generate standard processing error response."""
    return {
        "modality": "iris",
        "biometricType": "iris",
        "status": "PROCESSING_ERROR",
        "verified": False,
        "match": False,
        "qualityScore": 0.0,
        "matchScore": 0.0,
        "score": 0.0,
        "confidence": "LOW",
        "reason": message,
        "processingDetails": {
            "qualityAccepted": False,
            "featureExtractionSuccessful": False,
        },
    }
