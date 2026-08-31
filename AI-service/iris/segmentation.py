"""
Iris Boundary Segmentation Operations — Adaptive Integro-Differential & Hough Pipeline
"""

import cv2
import numpy as np
from typing import Tuple


def segment_iris(enhanced_gray: np.ndarray) -> Tuple[Tuple[int, int, int], Tuple[int, int, int], np.ndarray]:
    """
    Locate pupil boundary (cx_p, cy_p, r_p), iris boundary (cx_i, cy_i, r_i),
    and build a binary noise mask for specularity, eyelids, and eyelash occlusions.
    """
    h, w = enhanced_gray.shape

    # 1. Outer Iris Boundary (Limbus) Detection
    iris_circle = _detect_iris_boundary(enhanced_gray)
    cx_i, cy_i, r_i = iris_circle

    # 2. Inner Pupil Boundary Detection
    pupil_circle = _detect_pupil_boundary(enhanced_gray, cx_i, cy_i, r_i)

    # 3. Specular Highlight & Eyelid Noise Masking
    noise_mask = _generate_noise_mask(enhanced_gray, iris_circle, pupil_circle)

    return iris_circle, pupil_circle, noise_mask


def _detect_iris_boundary(img: np.ndarray) -> Tuple[int, int, int]:
    """
    Detect outer iris boundary using Hough Circles with Integro-Differential Radial Gradient fallback.
    """
    h, w = img.shape
    circles = cv2.HoughCircles(
        img,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=int(min(h, w) * 0.3),
        param1=60,
        param2=30,
        minRadius=int(min(h, w) * 0.2),
        maxRadius=int(min(h, w) * 0.55),
    )

    if circles is not None:
        cx_i, cy_i, r_i = map(int, np.round(circles[0, 0]))
        if 5 <= r_i <= min(h, w):
            return cx_i, cy_i, r_i

    return _integro_differential_search(img, is_pupil=False)


def _detect_pupil_boundary(img: np.ndarray, cx_i: int, cy_i: int, r_i: int) -> Tuple[int, int, int]:
    """
    Detect inner pupil boundary using adaptive thresholding contour search around iris center.
    """
    h, w = img.shape
    r_search = int(r_i * 0.9)
    y_min, y_max = max(0, cy_i - r_search), min(h, cy_i + r_search)
    x_min, x_max = max(0, cx_i - r_search), min(w, cx_i + r_search)

    pupil_roi = img[y_min:y_max, x_min:x_max]

    if pupil_roi.size > 0:
        min_val = float(np.min(pupil_roi))
        thresh_val = min_val + (np.mean(pupil_roi) - min_val) * 0.4
        _, thresh = cv2.threshold(pupil_roi, int(thresh_val), 255, cv2.THRESH_BINARY_INV)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            best_contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(best_contour)
            if area > 20:
                (x_c, y_c), radius = cv2.minEnclosingCircle(best_contour)
                cx_p = x_min + int(x_c)
                cy_p = y_min + int(y_c)
                r_p = int(radius)
                if 4 <= r_p <= int(r_i * 0.7):
                    return cx_p, cy_p, r_p

    return cx_i, cy_i, max(5, int(r_i * 0.35))


def _integro_differential_search(img: np.ndarray, is_pupil: bool = False) -> Tuple[int, int, int]:
    """
    Daugman Integro-Differential Operator: search for center (cx, cy) and radius r
    that maximizes radial intensity gradient along circular boundary.
    """
    h, w = img.shape
    cx_center, cy_center = w // 2, h // 2

    r_min = int(min(h, w) * (0.08 if is_pupil else 0.20))
    r_max = int(min(h, w) * (0.30 if is_pupil else 0.50))
    r_min = max(5, r_min)
    r_max = max(r_min + 5, r_max)

    best_score = -1.0
    best_circle = (cx_center, cy_center, (r_min + r_max) // 2)

    angles = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)

    step = max(1, min(h, w) // 20)
    for cy in range(max(0, cy_center - step * 3), min(h, cy_center + step * 3 + 1), step):
        for cx in range(max(0, cx_center - step * 3), min(w, cx_center + step * 3 + 1), step):
            for r in range(r_min, r_max, max(1, (r_max - r_min) // 10)):
                xs_inner = np.clip(np.round(cx + (r - 2) * cos_a).astype(int), 0, w - 1)
                ys_inner = np.clip(np.round(cy + (r - 2) * sin_a).astype(int), 0, h - 1)

                xs_outer = np.clip(np.round(cx + (r + 2) * cos_a).astype(int), 0, w - 1)
                ys_outer = np.clip(np.round(cy + (r + 2) * sin_a).astype(int), 0, h - 1)

                inner_mean = np.mean(img[ys_inner, xs_inner])
                outer_mean = np.mean(img[ys_outer, xs_outer])

                diff = (outer_mean - inner_mean) if not is_pupil else (inner_mean - outer_mean)
                if diff > best_score:
                    best_score = diff
                    best_circle = (cx, cy, r)

    return best_circle


def _generate_noise_mask(
    img: np.ndarray, iris_circle: Tuple[int, int, int], pupil_circle: Tuple[int, int, int]
) -> np.ndarray:
    """
    Generate binary noise mask (1 = valid iris pixel, 0 = noise/occlusion).
    Masks specular highlights (> 245) and eyelid margins.
    """
    h, w = img.shape
    noise_mask = np.ones((h, w), dtype=np.uint8)

    # Specular highlights
    noise_mask[img > 245] = 0

    # Upper and lower eyelid exclusion (top 15% and bottom 15% of iris region)
    cx_i, cy_i, r_i = iris_circle
    top_eyelid_y = max(0, cy_i - int(r_i * 0.85))
    bottom_eyelid_y = min(h, cy_i + int(r_i * 0.85))

    noise_mask[:top_eyelid_y, :] = 0
    noise_mask[bottom_eyelid_y:, :] = 0

    return noise_mask
