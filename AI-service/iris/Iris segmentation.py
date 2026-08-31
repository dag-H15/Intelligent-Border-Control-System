import cv2
import numpy as np
from typing import Tuple, Dict, Any

def segment_iris(
    gray_image: np.ndarray, 
    pupil_r_range: Tuple[int, int] = (10, 60), 
    iris_r_range: Tuple[int, int] = (30, 120)
) -> Tuple[Tuple[int, int, int], Tuple[int, int, int], np.ndarray]:
    """
    Detects pupil and iris boundaries and generates a preliminary occlusion mask for eyelids/eyelashes.
    Returns: (iris_circle, pupil_circle, noise_mask)
    """
    if gray_image is None or gray_image.size == 0:
        raise ValueError("Invalid image input for segmentation.")

    # 1. Enhance contrast using CLAHE to isolate pupil boundaries under poor lighting
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray_image)
    blurred = cv2.medianBlur(enhanced, 7)

    # 2. Pupil Detection (Inner Boundary)
    pupil_circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1, minDist=60,
        param1=90, param2=25,
        minRadius=pupil_r_range[0], maxRadius=pupil_r_range[1]
    )
    
    if pupil_circles is None:
        raise RuntimeError("Pupil segmentation failed: No circular boundary identified.")
        
    pupil = np.uint16(np.around(pupil_circles[0][0]))
    p_x, p_y, p_r = int(pupil[0]), int(pupil[1]), int(pupil[2])

    # 3. Iris Detection (Outer Boundary)
    iris_circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1, minDist=60,
        param1=80, param2=30,
        minRadius=max(p_r + 15, iris_r_range[0]), maxRadius=iris_r_range[1]
    )
    
    if iris_circles is None:
        # Geometrical fallback relative to pupil center
        i_x, i_y, i_r = p_x, p_y, int(p_r * 2.6)
    else:
        iris = np.uint16(np.around(iris_circles[0][0]))
        i_x, i_y, i_r = int(iris[0]), int(iris[1]), int(iris[2])

    # 4. Generate Initial Noise Mask (0 = Occluded by eyelids/reflections, 1 = Valid Iris)
    h, w = gray_image.shape
    noise_mask = np.ones((h, w), dtype=np.uint8)

    # Threshold out extreme specular highlights (glare) and dark eyelashes
    noise_mask[gray_image > 240] = 0
    noise_mask[gray_image < 15] = 0

    return (i_x, i_y, i_r), (p_x, p_y, p_r), noise_mask