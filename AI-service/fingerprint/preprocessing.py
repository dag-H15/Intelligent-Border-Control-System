"""
preprocessing.py
----------------
Biometric-grade image preprocessing and normalization for fingerprints.
"""

import cv2
import numpy as np
from fingerprint.config import TARGET_SIZE

def preprocess_fingerprint_image(img_bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Preprocess the fingerprint image for biometric feature extraction.
    
    Steps:
    1. Aspect-ratio-preserving resize to fit in TARGET_SIZE x TARGET_SIZE.
    2. Adaptive padding based on the average border color.
    3. Grayscale conversion.
    4. CLAHE contrast enhancement to clarify ridges.
    5. Gaussian blur to remove sensor/high-frequency noise.
    6. Normalization to full range [0, 255].
    7. Active ridge segmentation (foreground mask).

    Returns:
    -------
    normalized : np.ndarray
        Grayscale enhanced fingerprint image (TARGET_SIZE x TARGET_SIZE, uint8).
    mask : np.ndarray
        Binary mask isolating the fingerprint area (TARGET_SIZE x TARGET_SIZE, uint8).
    """
    h, w = img_bgr.shape[:2]
    
    # 1. Aspect-ratio-preserving resize
    scale = min(TARGET_SIZE / w, TARGET_SIZE / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    # 2. Adaptive background padding
    # Determine the average color from the corners of the original image
    corners = [img_bgr[0, 0], img_bgr[0, -1], img_bgr[-1, 0], img_bgr[-1, -1]]
    bg_color = np.mean(corners, axis=0).astype(np.uint8)
    
    # Create canvas and center the resized image
    canvas = np.full((TARGET_SIZE, TARGET_SIZE, 3), bg_color, dtype=np.uint8)
    dx = (TARGET_SIZE - new_w) // 2
    dy = (TARGET_SIZE - new_h) // 2
    canvas[dy:dy+new_h, dx:dx+new_w] = resized
    
    # 3. Grayscale conversion
    gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
    
    # 4. CLAHE (Local Contrast Limited Adaptive Histogram Equalisation)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # 5. Noise suppression
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)
    
    # 6. Normalization
    normalized = cv2.normalize(blurred, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    # 7. Segment fingerprint foreground (active ridge area) using absolute local gradient magnitude
    sobelx = cv2.Sobel(normalized, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(normalized, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobelx**2 + sobely**2)
    
    # Absolute threshold of 10.0 is robust for active ridges, flat/blurry areas will be below this
    _, mask = cv2.threshold(grad_mag, 10.0, 255, cv2.THRESH_BINARY)
    mask = mask.astype(np.uint8)
    
    # Smooth the mask using morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    return normalized, mask
