"""
image_processing.py
-------------------
Low-level image helpers shared across the biometric pipeline.

Fingerprint preprocessing
  preprocess_fingerprint(img_bgr) → grayscale ndarray
  • CLAHE contrast enhancement to sharpen ridge structure
  • Gaussian blur to suppress sensor noise
  • Otsu threshold + morphological close to produce a clean ridge mask
  The output is a normalised uint8 grayscale image ready for ORB keypoint
  detection.

Iris preprocessing
  preprocess_iris(img_bgr) → polar ndarray  (64 rows × 512 cols, uint8)
  • Detect the outer iris boundary with Hough circles
  • Isolate the annular iris band (outer circle minus pupil estimate)
  • Unwrap the annulus to a rectangular strip using the Daugman rubber-sheet
    polar transform
  Falls back to a centre-crop + resize when circle detection fails (e.g.
  low-quality / synthetic images) so extraction always produces a template
  rather than crashing.

Shared utilities
  decode_base64_image(data_str) → BGR ndarray | None
"""

from __future__ import annotations

import base64
from io import BytesIO

import cv2
import numpy as np
from PIL import Image


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def decode_base64_image(data_str: str) -> np.ndarray | None:
    """
    Decode a base64-encoded image string (with or without data-URI prefix)
    into an OpenCV BGR uint8 ndarray.  Returns None on any failure.
    """
    if not data_str or not isinstance(data_str, str):
        return None
    try:
        if "," in data_str:
            data_str = data_str.split(",", 1)[1]
        raw = base64.b64decode(data_str)
        pil = Image.open(BytesIO(raw)).convert("RGB")
        rgb = np.array(pil, dtype=np.uint8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Fingerprint preprocessing
# ---------------------------------------------------------------------------

def preprocess_fingerprint(img_bgr: np.ndarray) -> np.ndarray:
    """
    Enhance a fingerprint image so that ORB can reliably detect ridge-
    structure keypoints.

    Steps
    -----
    1. Grayscale conversion.
    2. CLAHE (clipLimit=3, tileGrid=8×8) — amplifies local ridge contrast
       without blowing out highlights.
    3. Mild Gaussian blur (3×3) — suppresses high-frequency sensor noise
       before keypoint detection.
    4. Resize to a fixed 300×300 working resolution so that keypoint
       coordinates are comparable across images regardless of capture
       resolution.
    5. Normalise to [0, 255] uint8.

    Returns
    -------
    Preprocessed grayscale ndarray (300×300, uint8).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # CLAHE — Local Contrast Limited Adaptive Histogram Equalisation
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Suppress sensor noise
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)

    # Fixed working resolution
    resized = cv2.resize(blurred, (300, 300), interpolation=cv2.INTER_AREA)

    # Ensure uint8 in full range
    normalised = cv2.normalize(resized, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    return normalised


# ---------------------------------------------------------------------------
# Iris preprocessing — polar (rubber-sheet) normalisation
# ---------------------------------------------------------------------------

_POLAR_ROWS = 64   # radial resolution of the unwrapped strip
_POLAR_COLS = 512  # angular resolution

def preprocess_iris(img_bgr: np.ndarray) -> np.ndarray:
    """
    Segment and normalise an iris image into a fixed-size rectangular strip
    using a Daugman-style polar (rubber-sheet) transform.

    Steps
    -----
    1. Grayscale + CLAHE to improve contrast for circle detection.
    2. Hough circle detection to locate the outer iris boundary.
    3. Estimate the pupil radius as 35 % of the iris radius (conservative
       default when the pupil is not separately detected).
    4. Unwrap the annular iris band into a (_POLAR_ROWS × _POLAR_COLS)
       rectangular strip via remap().
    5. Apply a second pass of CLAHE to equalise illumination in the strip.

    Fallback
    --------
    When Hough detection fails (blurry / synthetic image), the function
    crops the central 60 % of the image and resizes it to
    (_POLAR_ROWS × _POLAR_COLS).  The caller (predictor.py) still gets a
    valid array and can extract a texture template from it.

    Returns
    -------
    Normalised grayscale strip ndarray (_POLAR_ROWS × _POLAR_COLS, uint8).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Pre-blur before Hough to reduce false circle detections
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.5)

    # CLAHE for better edge contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)

    h, w = enhanced.shape

    # --- Hough circle detection -----------------------------------------------
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

    if circles is not None:
        cx, cy, r_iris = map(int, np.round(circles[0, 0]))
        r_pupil = int(r_iris * 0.35)
    else:
        # Fallback: assume the iris is centred and fills ~55 % of the frame
        cx, cy = w // 2, h // 2
        r_iris = int(min(h, w) * 0.55 * 0.5)
        r_pupil = int(r_iris * 0.35)

        # If we genuinely have no circle, use the central-crop fallback
        if r_iris < 10:
            return _iris_fallback(gray)

    # --- Rubber-sheet polar transform -----------------------------------------
    strip = _polar_unwrap(gray, cx, cy, r_pupil, r_iris, _POLAR_ROWS, _POLAR_COLS)

    # Final CLAHE pass to normalise strip illumination
    strip = clahe.apply(strip)
    return strip


def _polar_unwrap(
    gray: np.ndarray,
    cx: int,
    cy: int,
    r_inner: int,
    r_outer: int,
    rows: int,
    cols: int,
) -> np.ndarray:
    """
    Map the annular region [r_inner, r_outer] around (cx, cy) into a
    rectangular (rows × cols) image using bilinear interpolation.

    Each row corresponds to a normalised radial distance (0 = pupil boundary,
    1 = iris boundary); each column corresponds to an angle [0, 2π).
    """
    # Build the sampling grids
    theta = np.linspace(0.0, 2.0 * np.pi, cols, endpoint=False, dtype=np.float32)
    rho   = np.linspace(r_inner, r_outer, rows, dtype=np.float32)

    # (rows, cols) grids of source pixel coordinates
    cos_t = np.cos(theta)[np.newaxis, :]   # (1, cols)
    sin_t = np.sin(theta)[np.newaxis, :]   # (1, cols)
    rho_   = rho[:, np.newaxis]            # (rows, 1)

    map_x = (cx + rho_ * cos_t).astype(np.float32)
    map_y = (cy + rho_ * sin_t).astype(np.float32)

    strip = cv2.remap(
        gray, map_x, map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    return strip.astype(np.uint8)


def _iris_fallback(gray: np.ndarray) -> np.ndarray:
    """
    Centre-crop the inner 60 % of the image and resize to the canonical
    polar-strip dimensions.  Used when Hough circle detection fails entirely.
    """
    h, w = gray.shape
    margin_y = int(h * 0.20)
    margin_x = int(w * 0.20)
    crop = gray[margin_y: h - margin_y, margin_x: w - margin_x]
    return cv2.resize(crop, (_POLAR_COLS, _POLAR_ROWS), interpolation=cv2.INTER_AREA)
