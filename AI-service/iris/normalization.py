"""
Iris Polar Rubber-Sheet Normalization (Daugman Model)
"""

import cv2
import numpy as np
from typing import Tuple
from iris.config import POLAR_ROWS, POLAR_COLS


def normalize_iris(
    gray_image: np.ndarray,
    noise_mask: np.ndarray,
    iris_circle: Tuple[int, int, int],
    pupil_circle: Tuple[int, int, int],
    radial_res: int = POLAR_ROWS,
    angular_res: int = POLAR_COLS,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Unwrap the annular iris region between non-concentric pupil circle (cx_p, cy_p, r_p)
    and iris circle (cx_i, cy_i, r_i) into a polar rectangular grid.
    Returns: (normalized_iris, normalized_mask)
    """
    cx_i, cy_i, r_i = iris_circle
    cx_p, cy_p, r_p = pupil_circle
    h, w = gray_image.shape

    if r_i < 10:
        return _iris_fallback(gray_image, noise_mask, radial_res, angular_res)

    thetas = np.linspace(0.0, 2.0 * np.pi, angular_res, endpoint=False, dtype=np.float32)
    r_factors = np.linspace(0.0, 1.0, radial_res, dtype=np.float32)[:, None]

    # Calculate boundary coordinates in Cartesian space
    p_edge_x = cx_p + r_p * np.cos(thetas)
    p_edge_y = cy_p + r_p * np.sin(thetas)

    i_edge_x = cx_i + r_i * np.cos(thetas)
    i_edge_y = cy_i + r_i * np.sin(thetas)

    # Linear interpolation between inner pupil and outer iris boundary
    x_grid = (1.0 - r_factors) * p_edge_x + r_factors * i_edge_x
    y_grid = (1.0 - r_factors) * p_edge_y + r_factors * i_edge_y

    # Remap image into polar strip
    normalized_iris = cv2.remap(
        gray_image.astype(np.uint8),
        x_grid.astype(np.float32),
        y_grid.astype(np.float32),
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )

    # Remap noise mask into polar grid
    normalized_mask = cv2.remap(
        noise_mask.astype(np.uint8),
        x_grid.astype(np.float32),
        y_grid.astype(np.float32),
        interpolation=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )

    # Equalize strip illumination
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    normalized_iris = clahe.apply(normalized_iris)

    return normalized_iris, normalized_mask


def _iris_fallback(
    gray: np.ndarray, mask: np.ndarray, rows: int, cols: int
) -> Tuple[np.ndarray, np.ndarray]:
    h, w = gray.shape
    margin_y = int(h * 0.20)
    margin_x = int(w * 0.20)
    crop_gray = gray[margin_y : h - margin_y, margin_x : w - margin_x]
    crop_mask = mask[margin_y : h - margin_y, margin_x : w - margin_x]

    norm_iris = cv2.resize(crop_gray, (cols, rows), interpolation=cv2.INTER_AREA)
    norm_mask = cv2.resize(crop_mask, (cols, rows), interpolation=cv2.INTER_NEAREST)
    return norm_iris, norm_mask
