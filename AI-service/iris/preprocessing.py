"""
preprocessing.py
----------------
Biometric-grade image preprocessing and normalization for iris images.
"""

from __future__ import annotations

import cv2
import numpy as np
from iris.config import (
    MIN_IMAGE_DIMENSION,
    MAX_IMAGE_DIMENSION,
    SPECULAR_THRESHOLD,
)
from utils.image_processing import decode_base64_image


def validate_iris_image(img: np.ndarray | None) -> tuple[bool, str]:
    """
    Validate that an input image is a valid OpenCV ndarray with acceptable dimensions.
    """
    if img is None:
        return False, "Input image is None or failed to decode"

    if not isinstance(img, np.ndarray):
        return False, "Input image is not a valid numpy ndarray"

    if img.size == 0 or len(img.shape) < 2:
        return False, "Input image has invalid shape or empty data"

    h, w = img.shape[:2]
    if h < MIN_IMAGE_DIMENSION or w < MIN_IMAGE_DIMENSION:
        return False, f"Image dimensions too small ({w}x{h}, minimum is {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION})"

    if h > MAX_IMAGE_DIMENSION or w > MAX_IMAGE_DIMENSION:
        return False, f"Image dimensions exceed maximum allowable bound ({w}x{h})"

    return True, ""


def to_grayscale(img: np.ndarray) -> np.ndarray:
    """
    Safely convert color or multichannel image to single-channel uint8 grayscale.
    """
    if len(img.shape) == 2:
        return img.copy().astype(np.uint8)
    if len(img.shape) == 3:
        if img.shape[2] == 4:
            return cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        if img.shape[2] == 3:
            return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if img.shape[2] == 1:
            return img[:, :, 0].copy().astype(np.uint8)
    raise ValueError(f"Unsupported image shape: {img.shape}")


def detect_specular_reflections(gray: np.ndarray, threshold: int = SPECULAR_THRESHOLD) -> np.ndarray:
    """
    Detect bright specular reflections and corneal glints in the eye image.
    Returns binary mask (uint8: 255 for reflection, 0 for valid tissue).
    """
    _, refl_mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    # Small morphological dilation to cover the saturated halo around glints
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    dilated = cv2.dilate(refl_mask, kernel, iterations=1)
    return dilated.astype(np.uint8)


def suppress_specular_highlights(gray: np.ndarray, refl_mask: np.ndarray) -> np.ndarray:
    """
    Mild inpainting / median suppression of specular highlights so they do not
    disrupt edge detection or circle Hough transforms.
    """
    if np.sum(refl_mask == 255) == 0:
        return gray.copy()
    # Inpaint specular spots using Telea fast marching algorithm
    inpainted = cv2.inpaint(gray, refl_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    return inpainted


def preprocess_iris_image(img_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Preprocess the raw eye image for segmentation and feature extraction.

    Steps:
    1. Grayscale conversion.
    2. Specular reflection detection.
    3. Mild highlight suppression for robust boundary finding.
    4. CLAHE contrast enhancement preserving delicate iris texture.
    5. Mild Gaussian smoothing for noise reduction without smearing crypts.

    Returns:
    -------
    gray : np.ndarray
        Original grayscale image (uint8).
    enhanced : np.ndarray
        CLAHE-enhanced and noise-filtered grayscale image for segmentation (uint8).
    reflection_mask : np.ndarray
        Binary mask of specular reflections (uint8, 255 = reflection, 0 = tissue).
    """
    valid, err = validate_iris_image(img_bgr)
    if not valid:
        raise ValueError(err)

    gray = to_grayscale(img_bgr)

    # 1. Specular reflection mask
    refl_mask = detect_specular_reflections(gray)

    # 2. Reflection-suppressed image for circle detection
    cleaned = suppress_specular_highlights(gray, refl_mask)

    # 3. CLAHE enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_clahe = clahe.apply(cleaned)

    # 4. Mild noise reduction (preserves high-frequency collarette/furrows)
    enhanced = cv2.GaussianBlur(enhanced_clahe, (5, 5), 1.0)

    return gray, enhanced, refl_mask
