"""
Iris Image Preprocessing Operations
"""

import cv2
import numpy as np
from typing import Tuple


def preprocess_iris_image(img_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Returns (gray, enhanced)
    gray: clean grayscale image for polar sampling
    enhanced: CLAHE + Gaussian blurred image for Hough Circle detection
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if len(img_bgr.shape) == 3 else img_bgr
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.5)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)
    return gray, enhanced
