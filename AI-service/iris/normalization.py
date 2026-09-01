"""
normalization.py
----------------
Daugman rubber-sheet polar normalization for non-concentric iris annuli.
"""

from __future__ import annotations

import cv2
import numpy as np
from iris.config import POLAR_HEIGHT, POLAR_WIDTH


def normalize_iris(
    gray: np.ndarray,
    occlusion_mask: np.ndarray,
    px: int,
    py: int,
    pr: int,
    ix: int,
    iy: int,
    ir: int,
    rows: int = POLAR_HEIGHT,
    cols: int = POLAR_WIDTH,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Unwrap the non-concentric annular iris region and its corresponding occlusion mask
    into standardized rectangular polar strips using Daugman's rubber-sheet model.

    Parameters:
    ----------
    gray : np.ndarray
        Grayscale input eye image (H, W, uint8).
    occlusion_mask : np.ndarray
        2D binary occlusion mask (H, W, uint8: 255 = valid tissue, 0 = occluded).
    px, py, pr : int
        Pupil center (x, y) and radius (r).
    ix, iy, ir : int
        Iris center (x, y) and radius (r).
    rows : int
        Radial resolution of normalized strip (default: 64).
    cols : int
        Angular resolution of normalized strip (default: 512).

    Returns:
    -------
    normalized_strip : np.ndarray
        Normalized grayscale polar iris strip (rows x cols, uint8).
    validity_mask : np.ndarray
        Normalized binary validity mask (rows x cols, uint8: 1 = valid, 0 = invalid).
    """
    h, w = gray.shape[:2]

    # Angles theta from 0 to 2*pi (cols samples)
    thetas = np.linspace(0.0, 2.0 * np.pi, cols, endpoint=False, dtype=np.float32)
    # Radial factors r from 0.0 (pupil boundary) to 1.0 (iris boundary) (rows samples)
    r_factors = np.linspace(0.0, 1.0, rows, dtype=np.float32)

    cos_t = np.cos(thetas)  # (cols,)
    sin_t = np.sin(thetas)  # (cols,)

    # Pupil boundary points at each theta: (cols,)
    xp = px + pr * cos_t
    yp = py + pr * sin_t

    # Iris boundary points at each theta: (cols,)
    xi = ix + ir * cos_t
    yi = iy + ir * sin_t

    # Grid of sampling points using broadcasting:
    # x(r, theta) = (1 - r) * xp(theta) + r * xi(theta)
    # y(r, theta) = (1 - r) * yp(theta) + r * yi(theta)
    r_mat = r_factors[:, np.newaxis]  # (rows, 1)
    one_minus_r = 1.0 - r_mat         # (rows, 1)

    map_x = (one_minus_r * xp[np.newaxis, :] + r_mat * xi[np.newaxis, :]).astype(np.float32)
    map_y = (one_minus_r * yp[np.newaxis, :] + r_mat * yi[np.newaxis, :]).astype(np.float32)

    # 1. Remap the grayscale iris image with bilinear interpolation
    strip = cv2.remap(
        gray,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )

    # 2. Remap the 2D occlusion mask with nearest neighbor interpolation
    norm_mask_raw = cv2.remap(
        occlusion_mask,
        map_x,
        map_y,
        interpolation=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    validity_mask = (norm_mask_raw == 255).astype(np.uint8)

    # 3. Apply CLAHE on the unwrapped polar strip for uniform illumination
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_strip = clahe.apply(strip)

    return enhanced_strip, validity_mask
