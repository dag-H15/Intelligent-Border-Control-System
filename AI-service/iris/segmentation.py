"""
segmentation.py
---------------
Biometric iris and pupil boundary segmentation and occlusion masking.
"""

from __future__ import annotations

from dataclasses import dataclass
import cv2
import numpy as np
from iris.config import (
    PUPIL_MIN_RATIO,
    PUPIL_MAX_RATIO,
    MAX_CENTER_OFFSET_RATIO,
    MIN_SEGMENTATION_CONFIDENCE,
    HOUGH_DP,
    HOUGH_PUPIL_PARAM1,
    HOUGH_PUPIL_PARAM2,
    HOUGH_IRIS_PARAM1,
    HOUGH_IRIS_PARAM2,
)


@dataclass
class IrisSegmentationResult:
    pupil_center: tuple[int, int]
    pupil_radius: int
    iris_center: tuple[int, int]
    iris_radius: int
    confidence: float
    is_valid: bool
    occlusion_mask: np.ndarray  # (H, W) uint8: 255 = valid iris tissue, 0 = invalid/occluded
    usable_area_ratio: float
    details: dict


def segment_iris(
    gray: np.ndarray,
    enhanced: np.ndarray,
    refl_mask: np.ndarray,
) -> IrisSegmentationResult:
    """
    Segment pupil and iris boundaries and construct full-resolution 2D validity mask.

    The algorithm locates non-concentric pupil and iris circles, detects eyelid/eyelash
    occlusions, and masks specular reflections.

    Rules:
    - Never fabricates boundaries or invents geometry.
    - If reliable segmentation is not achievable, returns is_valid=False and confidence=0.0.
    """
    h, w = gray.shape[:2]
    empty_mask = np.zeros((h, w), dtype=np.uint8)

    # 1. Detect Pupil Boundary
    pupil = _detect_pupil(gray, enhanced, refl_mask)
    if pupil is None:
        return IrisSegmentationResult(
            pupil_center=(0, 0),
            pupil_radius=0,
            iris_center=(0, 0),
            iris_radius=0,
            confidence=0.0,
            is_valid=False,
            occlusion_mask=empty_mask,
            usable_area_ratio=0.0,
            details={"error": "Pupil boundary could not be reliably located"},
        )

    px, py, pr = pupil

    # 2. Detect Outer Iris Boundary around pupil location
    iris = _detect_iris_boundary(gray, enhanced, px, py, pr)
    if iris is None:
        return IrisSegmentationResult(
            pupil_center=(px, py),
            pupil_radius=pr,
            iris_center=(0, 0),
            iris_radius=0,
            confidence=0.0,
            is_valid=False,
            occlusion_mask=empty_mask,
            usable_area_ratio=0.0,
            details={"error": "Outer iris boundary could not be reliably located"},
        )

    ix, iy, ir = iris

    # 3. Geometric Plausibility Validation
    geom_valid, confidence, geom_details = _validate_geometry(w, h, px, py, pr, ix, iy, ir, gray)
    if not geom_valid or confidence < MIN_SEGMENTATION_CONFIDENCE:
        return IrisSegmentationResult(
            pupil_center=(px, py),
            pupil_radius=pr,
            iris_center=(ix, iy),
            iris_radius=ir,
            confidence=float(round(confidence, 2)),
            is_valid=False,
            occlusion_mask=empty_mask,
            usable_area_ratio=0.0,
            details={"error": "Segmented geometry failed plausibility validation", **geom_details},
        )

    # 4. Generate Occlusion & Reflection Mask
    occlusion_mask, usable_ratio = _create_occlusion_mask(
        gray, w, h, px, py, pr, ix, iy, ir, refl_mask
    )

    return IrisSegmentationResult(
        pupil_center=(px, py),
        pupil_radius=pr,
        iris_center=(ix, iy),
        iris_radius=ir,
        confidence=float(round(confidence, 2)),
        is_valid=True,
        occlusion_mask=occlusion_mask,
        usable_area_ratio=float(round(usable_ratio, 3)),
        details={
            "pupilCenter": [px, py],
            "pupilRadius": pr,
            "irisCenter": [ix, iy],
            "irisRadius": ir,
            "centerOffset": float(round(np.hypot(px - ix, py - iy), 2)),
            "usableAreaRatio": float(round(usable_ratio, 3)),
            **geom_details,
        },
    )


# ---------------------------------------------------------------------------
# Internal segmentation helpers
# ---------------------------------------------------------------------------

def _detect_pupil(
    gray: np.ndarray,
    enhanced: np.ndarray,
    refl_mask: np.ndarray,
) -> tuple[int, int, int] | None:
    """
    Detect the pupil circle (center x, y and radius r).
    Combines adaptive thresholding / morphological contour fit with Circular Hough.
    """
    h, w = gray.shape[:2]
    min_dim = min(h, w)

    # Realistic pupil size bounds are a small fraction of the frame.
    # Wide upper bounds allowed the Hough detector to lock onto large, clearly
    # non-pupil dark regions (e.g. shadows), destabilising segmentation.
    min_r = max(6, int(min_dim * 0.045))
    max_r = int(min_dim * 0.16)

    if min_r >= max_r:
        return None

    # Inpaint specular reflection so glints inside pupil don't fragment the blob
    in_gray = gray.copy()
    if np.sum(refl_mask == 255) > 0:
        in_gray = cv2.inpaint(gray, refl_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    # --- Primary: compact dark-blob contour candidate ---
    # Threshold the darkest 15% intensity, then open (remove eyelash bridges) and
    # close (fill glint gaps) so the pupil appears as one compact round blob.
    thresh_val = np.percentile(in_gray, 15)
    _, dark_bin = cv2.threshold(in_gray, int(thresh_val), 255, cv2.THRESH_BINARY_INV)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    cleaned = cv2.morphologyEx(dark_bin, cv2.MORPH_OPEN, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)

    best_candidate: tuple[float, int, int, int] | None = None

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = float(cv2.contourArea(cnt))
        if area < 0.5 * np.pi * (min_r ** 2):
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter <= 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.45:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        cx, cy, r = int(round(cx)), int(round(cy)), int(round(r))
        if not (min_r <= r <= max_r and 0 <= cx < w and 0 <= cy < h):
            continue
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (cx, cy), max(1, int(r * 0.7)), 255, -1)
        mean_val = float(cv2.mean(gray, mask=mask)[0])
        # Darkness reward (the pupil is the darkest structure), roundness bonus
        # (shadows/edges are elongated, real pupils are round) and a mild size
        # penalty to avoid preferring oversized merged blobs.
        darkness = max(0.0, 150.0 - mean_val)
        circ_bonus = max(0.0, (circularity - 0.5) * 150.0)
        score = darkness + circ_bonus - float(r) * 0.4
        if best_candidate is None or score > best_candidate[0]:
            best_candidate = (score, cx, cy, r)

    if best_candidate is not None:
        return best_candidate[1], best_candidate[2], best_candidate[3]

    # --- Fallback: Circular Hough only when no clean dark blob is available ---
    blurred = cv2.medianBlur(enhanced, 7)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=HOUGH_DP,
        minDist=int(min_dim * 0.3),
        param1=HOUGH_PUPIL_PARAM1,
        param2=HOUGH_PUPIL_PARAM2,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is not None:
        best_hough: tuple[float, int, int, int] | None = None
        for c in circles[0]:
            cx, cy, r = int(round(c[0])), int(round(c[1])), int(round(c[2]))
            if not (min_r <= r <= max_r and 0 <= cx < w and 0 <= cy < h):
                continue
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.circle(mask, (cx, cy), max(1, int(r * 0.7)), 255, -1)
            mean_val = float(cv2.mean(gray, mask=mask)[0])
            darkness = max(0.0, 150.0 - mean_val)
            score = darkness - float(r) * 0.4
            if best_hough is None or score > best_hough[0]:
                best_hough = (score, cx, cy, r)
        if best_hough is not None:
            return best_hough[1], best_hough[2], best_hough[3]

    return None


def _detect_iris_boundary(
    gray: np.ndarray,
    enhanced: np.ndarray,
    px: int,
    py: int,
    pr: int,
) -> tuple[int, int, int] | None:
    """
    Detect the outer limbic (iris) boundary around the detected pupil.
    Searches for concentric/near-concentric circular edge in radius range [pr * 1.5, max_r].
    """
    h, w = gray.shape[:2]
    min_dim = min(h, w)

    min_iris_r = max(int(pr * 1.6), 20)
    max_iris_r = min(int(pr * 3.8), int(min_dim * 0.55))

    if min_iris_r >= max_iris_r:
        return None

    # Pre-blur for outer boundary search
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.5)

    # --- Primary: Daugman integrodifferential operator with center refinement ---
    # Circular Hough is unstable for the limbus because it locks onto any strong
    # circular edge (eyelid line, iris crypts, contact-lens boundary). Searching
    # the lateral radial gradient over a small center+cradius neighbourhood of the
    # pupil is far more stable between captures of the same eye.
    off = min(12, max(3, int(pr)))

    best_iris = None
    best_score = -1.0

    for dcx in range(-off, off + 1, 3):
        for dcy in range(-off, off + 1, 3):
            cx, cy = px + dcx, py + dcy
            for r in range(min_iris_r, max_iris_r + 1, 2):
                grad = _evaluate_circle_gradient_sector(blurred, cx, cy, r)
                if grad > best_score:
                    best_score = grad
                    best_iris = (cx, cy, r)

    if best_iris is not None and best_score >= 3.0:
        return best_iris

    # --- Fallback: Hough Circle with search restricted around pupil center ---
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=HOUGH_DP,
        minDist=int(min_dim * 0.3),
        param1=HOUGH_IRIS_PARAM1,
        param2=HOUGH_IRIS_PARAM2,
        minRadius=min_iris_r,
        maxRadius=max_iris_r,
    )

    if circles is not None:
        for c in circles[0]:
            cx, cy, r = int(round(c[0])), int(round(c[1])), int(round(c[2]))
            dist_to_pupil = np.hypot(cx - px, cy - py)
            max_allowed_offset = r * MAX_CENTER_OFFSET_RATIO
            if dist_to_pupil <= max_allowed_offset and min_iris_r <= r <= max_iris_r:
                # Evaluate radial gradient along the boundary
                grad_score = _evaluate_circle_gradient(gray, cx, cy, r)
                # Penalize large center offsets
                score = grad_score / (1.0 + (dist_to_pupil / r))
                if score > best_score:
                    best_score = score
                    best_iris = (cx, cy, r)

    return best_iris


def _evaluate_circle_gradient(gray: np.ndarray, cx: int, cy: int, r: int, n_samples: int = 64) -> float:
    """
    Evaluate the radial contrast across a circular boundary (outer intensity minus inner intensity).
    """
    h, w = gray.shape[:2]
    thetas = np.linspace(0, 2 * np.pi, n_samples, endpoint=False)
    inner_r = max(1, r - 3)
    outer_r = min(min(h, w), r + 3)

    in_pts_x = np.clip(np.round(cx + inner_r * np.cos(thetas)).astype(int), 0, w - 1)
    in_pts_y = np.clip(np.round(cy + inner_r * np.sin(thetas)).astype(int), 0, h - 1)

    out_pts_x = np.clip(np.round(cx + outer_r * np.cos(thetas)).astype(int), 0, w - 1)
    out_pts_y = np.clip(np.round(cy + outer_r * np.sin(thetas)).astype(int), 0, h - 1)

    in_vals = gray[in_pts_y, in_pts_x].astype(np.float32)
    out_vals = gray[out_pts_y, out_pts_x].astype(np.float32)

    # Iris is darker than surrounding sclera -> (sclera - iris) is positive
    diff = np.mean(out_vals - in_vals)
    return float(max(0.0, diff))


def _evaluate_circle_gradient_sector(
    gray: np.ndarray, cx: int, cy: int, r: int, n_samples: int = 128
) -> float:
    """
    Evaluate radial contrast across a circular boundary using only the lateral
    sectors. Upper/lower eyelid and eyelash occlusion break the limbal edge in
    the vertical sectors, so excluding them keeps the score stable across
    captures that differ in eyelid position.
    """
    h, w = gray.shape[:2]
    thetas = np.linspace(0, 2 * np.pi, n_samples, endpoint=False)
    y_norm = np.sin(thetas)
    sector_ok = (y_norm > -0.87) & (y_norm < 0.87)
    thetas = thetas[sector_ok]

    inner_r = max(1, r - 3)
    outer_r = r + 3

    in_pts_x = np.clip(np.round(cx + inner_r * np.cos(thetas)).astype(int), 0, w - 1)
    in_pts_y = np.clip(np.round(cy + inner_r * np.sin(thetas)).astype(int), 0, h - 1)

    out_pts_x = np.clip(np.round(cx + outer_r * np.cos(thetas)).astype(int), 0, w - 1)
    out_pts_y = np.clip(np.round(cy + outer_r * np.sin(thetas)).astype(int), 0, h - 1)

    in_vals = gray[in_pts_y, in_pts_x].astype(np.float32)
    out_vals = gray[out_pts_y, out_pts_x].astype(np.float32)

    # Iris is darker than surrounding sclera -> (sclera - iris) is positive
    diff = np.mean(out_vals - in_vals)
    return float(max(0.0, diff))


def _integrodifferential_radial_search(
    gray: np.ndarray,
    px: int,
    py: int,
    min_r: int,
    max_r: int,
    n_radii: int = 40,
) -> tuple[int, int, int, float] | None:
    """
    1D discrete Daugman integrodifferential operator searching for max radial derivative of circular path.
    """
    radii = np.linspace(min_r, max_r, n_radii, dtype=int)
    thetas = np.linspace(-np.pi / 3, np.pi / 3, 32)  # Lateral sectors to avoid upper/lower eyelid
    thetas = np.concatenate([thetas, thetas + np.pi])

    averages = []
    h, w = gray.shape[:2]
    cos_t = np.cos(thetas)
    sin_t = np.sin(thetas)

    for r in radii:
        xs = np.clip(np.round(px + r * cos_t).astype(int), 0, w - 1)
        ys = np.clip(np.round(py + r * sin_t).astype(int), 0, h - 1)
        averages.append(float(np.mean(gray[ys, xs])))

    averages = np.array(averages, dtype=np.float32)
    # Differences between consecutive radii
    diffs = np.diff(averages)
    if len(diffs) == 0:
        return None

    best_idx = int(np.argmax(diffs))
    max_diff = float(diffs[best_idx])
    best_r = int(radii[best_idx])

    if max_diff > 3.0:
        return px, py, best_r, max_diff
    return None


def _validate_geometry(
    w: int,
    h: int,
    px: int,
    py: int,
    pr: int,
    ix: int,
    iy: int,
    ir: int,
    gray: np.ndarray,
) -> tuple[bool, float, dict]:
    """
    Validate geometric plausibility of segmented circles and calculate confidence score (0-100).
    """
    if pr <= 0 or ir <= 0 or pr >= ir:
        return False, 0.0, {"reason": "Pupil radius must be strictly positive and smaller than iris radius"}

    ratio = pr / float(ir)
    if ratio < PUPIL_MIN_RATIO or ratio > PUPIL_MAX_RATIO:
        return False, 0.0, {"reason": f"Pupil/Iris radius ratio {ratio:.2f} outside bounds [{PUPIL_MIN_RATIO}, {PUPIL_MAX_RATIO}]"}

    offset = float(np.hypot(px - ix, py - iy))
    max_offset = ir * MAX_CENTER_OFFSET_RATIO
    if offset > max_offset:
        return False, 0.0, {"reason": f"Pupil-iris center offset {offset:.1f}px exceeds limit {max_offset:.1f}px"}

    # Bounds check: centers must lie within frame
    if not (0 <= px < w and 0 <= py < h and 0 <= ix < w and 0 <= iy < h):
        return False, 0.0, {"reason": "Center coordinates lie outside image bounds"}

    # Calculate confidence based on contrast across boundaries
    pupil_contrast = _evaluate_circle_gradient(gray, px, py, pr)
    iris_contrast = _evaluate_circle_gradient(gray, ix, iy, ir)

    # Photometric analysis: pupil interior vs iris annulus
    pupil_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(pupil_mask, (px, py), max(1, int(pr * 0.75)), 255, -1)
    pupil_mean = float(cv2.mean(gray, mask=pupil_mask)[0])

    annulus_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(annulus_mask, (ix, iy), ir, 255, -1)
    cv2.circle(annulus_mask, (px, py), pr, 0, -1)
    annulus_mean = float(cv2.mean(gray, mask=annulus_mask)[0])

    annulus_pixels = gray[annulus_mask == 255]
    annulus_std = float(np.std(annulus_pixels)) if len(annulus_pixels) > 20 else 0.0
    pupil_iris_diff = annulus_mean - pupil_mean

    # Offset penalty (0 for concentric, up to 25 penalty for max allowed offset)
    offset_penalty = (offset / max(1.0, max_offset)) * 25.0

    # Photometric support (pupil darker than iris gives positive support)
    photometric_support = np.clip(pupil_iris_diff * 0.8, -15.0, 20.0)
    texture_support = min(15.0, annulus_std * 0.6)

    raw_conf = (pupil_contrast * 2.0) + (iris_contrast * 1.8) + photometric_support + texture_support + 20.0 - offset_penalty
    confidence = float(np.clip(raw_conf, 0.0, 100.0))

    return True, confidence, {
        "pupilContrast": float(round(pupil_contrast, 2)),
        "irisContrast": float(round(iris_contrast, 2)),
        "pupilIrisRatio": float(round(ratio, 3)),
        "pupilMean": float(round(pupil_mean, 1)),
        "annulusMean": float(round(annulus_mean, 1)),
        "annulusStd": float(round(annulus_std, 1)),
        "pupilIrisDiff": float(round(pupil_iris_diff, 1)),
    }


def _create_occlusion_mask(
    gray: np.ndarray,
    w: int,
    h: int,
    px: int,
    py: int,
    pr: int,
    ix: int,
    iy: int,
    ir: int,
    refl_mask: np.ndarray,
) -> tuple[np.ndarray, float]:
    """
    Build the 2D binary occlusion mask (255 = valid unoccluded iris tissue, 0 = invalid).
    Masks eyelids, eyelashes, and specular reflections.
    """
    # 1. Annular iris mask: inside iris circle, outside pupil circle
    annulus_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(annulus_mask, (ix, iy), ir, 255, -1)
    cv2.circle(annulus_mask, (px, py), pr, 0, -1)

    total_annulus_pixels = int(np.sum(annulus_mask == 255))
    if total_annulus_pixels == 0:
        return np.zeros((h, w), dtype=np.uint8), 0.0

    valid_mask = annulus_mask.copy()

    # 2. Exclude specular reflections
    if refl_mask is not None and np.sum(refl_mask == 255) > 0:
        valid_mask[refl_mask == 255] = 0

    # 3. Detect Upper and Lower Eyelid Occlusions
    # Upper eyelid typically covers top 20-35% of iris circle if drooping
    upper_bound_y = iy - int(ir * 0.70)
    lower_bound_y = iy + int(ir * 0.75)

    # Edge analysis in upper sector to find potential eyelid boundary
    ys, xs = np.ogrid[:h, :w]
    # Simple thresholding on dark eyelashes/eyelids if they cut across the iris
    # Eyelashes have high gradient or very low brightness in upper quadrant
    upper_quadrant = (ys < iy) & (valid_mask == 255)
    if np.any(upper_quadrant):
        upper_vals = gray[upper_quadrant]
        if len(upper_vals) > 0:
            dark_thresh = np.percentile(upper_vals, 15)
            # Mask out extremely dark eyelash clusters in upper region
            valid_mask[upper_quadrant & (gray < max(25, dark_thresh))] = 0

    valid_pixels = int(np.sum(valid_mask == 255))
    usable_ratio = valid_pixels / float(total_annulus_pixels)

    return valid_mask, usable_ratio
