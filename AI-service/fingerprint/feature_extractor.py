"""
feature_extractor.py
--------------------
Extracts fingerprint-specific minutiae features and supporting ORB descriptors.
"""

import struct
import cv2
import numpy as np
from skimage.morphology import skeletonize
from fingerprint.config import (
    MINUTIAE_PRUNING_CLOSE_THRESHOLD,
    MINUTIAE_PRUNING_BORDER_MARGIN,
    MINUTIAE_PRUNING_BROKEN_RIDGE_THRESHOLD,
    ORB_N_FEATURES,
    ORB_SCALE_FACTOR,
    ORB_N_LEVELS,
    ORB_EDGE_THRESHOLD,
    ORB_PATCH_SIZE,
    ORB_FAST_THRESHOLD
)

# Minutiae types
ENDING = 1
BIFURCATION = 2

# Binary template header
MAGIC_HEADER = b"FPM\x01"

def extract_features(normalized: np.ndarray, mask: np.ndarray) -> bytes:
    """
    Extract minutiae points and ORB keypoints/descriptors from preprocessed image
    and return the packed versioned binary template.

    Parameters:
    ----------
    normalized : np.ndarray
        Preprocessed grayscale fingerprint image (uint8).
    mask : np.ndarray
        Segmented fingerprint foreground mask (uint8).

    Returns:
    -------
    bytes
        Packed binary template blob.
    """
    # 1. Binarization
    _, binary = cv2.threshold(normalized, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Ensure binary contains only 0 and 1
    binary_bool = (binary == 255)
    
    # 2. Skeletonization
    skeleton = skeletonize(binary_bool)
    
    # 3. Crossing Number minutiae extraction
    h, w = skeleton.shape
    points = np.argwhere(skeleton)
    raw_minutiae = []
    
    for r, c in points:
        # Avoid edges
        if r < 1 or r >= h - 1 or c < 1 or c >= w - 1:
            continue
            
        # Get 8-neighborhood values in circular sequence
        n = [
            skeleton[r-1, c],     # P2 (top)
            skeleton[r-1, c+1],   # P3 (top-right)
            skeleton[r, c+1],     # P4 (right)
            skeleton[r+1, c+1],   # P5 (bottom-right)
            skeleton[r+1, c],     # P6 (bottom)
            skeleton[r+1, c-1],   # P7 (bottom-left)
            skeleton[r, c-1],     # P8 (left)
            skeleton[r-1, c-1]    # P9 (top-left)
        ]
        
        n_bin = [1 if val else 0 for val in n]
        cn = 0.5 * sum(abs(n_bin[i] - n_bin[(i + 1) % 8]) for i in range(8))
        
        if cn == 1:
            raw_minutiae.append((float(c), float(r), ENDING))
        elif cn == 3:
            raw_minutiae.append((float(c), float(r), BIFURCATION))

    # 4. False Minutiae Pruning
    pruned_minutiae = prune_minutiae(raw_minutiae, skeleton, mask)
    
    # 5. Extract supporting ORB features for alignment
    orb = cv2.ORB_create(
        nfeatures=ORB_N_FEATURES,
        scaleFactor=ORB_SCALE_FACTOR,
        nlevels=ORB_N_LEVELS,
        edgeThreshold=ORB_EDGE_THRESHOLD,
        patchSize=ORB_PATCH_SIZE,
        fastThreshold=ORB_FAST_THRESHOLD
    )
    orb_kps, orb_des = orb.detectAndCompute(normalized, mask)
    
    if orb_des is None:
        orb_des = np.zeros((0, 32), dtype=np.uint8)
        orb_kps = []
        
    return pack_template(pruned_minutiae, orb_kps, orb_des)


def prune_minutiae(minutiae_list: list, skeleton: np.ndarray, mask: np.ndarray) -> list:
    """
    Remove false minutiae caused by boundaries, skeletonization spikes, or noise.
    """
    h, w = skeleton.shape
    keep = [True] * len(minutiae_list)
    
    # 1. Border artifact filter (remove near background boundary)
    margin = int(MINUTIAE_PRUNING_BORDER_MARGIN)
    for i, (x, y, t) in enumerate(minutiae_list):
        r, c = int(y), int(x)
        r0, r1 = max(0, r - margin), min(h, r + margin + 1)
        c0, c1 = max(0, c - margin), min(w, c + margin + 1)
        if np.any(mask[r0:r1, c0:c1] == 0):
            keep[i] = False

    # 2. Broken ridges and close duplicate minutiae filter
    for i in range(len(minutiae_list)):
        if not keep[i]:
            continue
        x1, y1, t1 = minutiae_list[i]
        for j in range(i + 1, len(minutiae_list)):
            if not keep[j]:
                continue
            x2, y2, t2 = minutiae_list[j]
            dist = np.hypot(x1 - x2, y1 - y2)
            
            # If two endings are close and point towards each other (broken ridge), or if they are duplicates
            if dist < MINUTIAE_PRUNING_CLOSE_THRESHOLD:
                keep[i] = False
                keep[j] = False
                break
            elif t1 == ENDING and t2 == ENDING and dist < MINUTIAE_PRUNING_BROKEN_RIDGE_THRESHOLD:
                # Broken ridge check: check if the direction is roughly opposite
                keep[i] = False
                keep[j] = False
                break
                
    return [minutiae_list[i] for i in range(len(minutiae_list)) if keep[i]]


def pack_template(minutiae: list[tuple[float, float, int]], orb_kps: list, orb_des: np.ndarray) -> bytes:
    """
    Pack features into versioned FPM v1 binary template.
    """
    num_minutiae = len(minutiae)
    m_xs = np.array([m[0] for m in minutiae], dtype=np.float32)
    m_ys = np.array([m[1] for m in minutiae], dtype=np.float32)
    m_types = np.array([m[2] for m in minutiae], dtype=np.uint8)
    
    num_orb = len(orb_kps)
    o_xs = np.array([kp.pt[0] for kp in orb_kps], dtype=np.float32)
    o_ys = np.array([kp.pt[1] for kp in orb_kps], dtype=np.float32)
    o_sizes = np.array([kp.size for kp in orb_kps], dtype=np.float32)
    o_angles = np.array([kp.angle for kp in orb_kps], dtype=np.float32)
    
    parts = [
        MAGIC_HEADER,
        struct.pack("<I", num_minutiae),
        m_xs.tobytes(),
        m_ys.tobytes(),
        m_types.tobytes(),
        struct.pack("<I", num_orb),
        o_xs.tobytes(),
        o_ys.tobytes(),
        o_sizes.tobytes(),
        o_angles.tobytes(),
        orb_des.astype(np.uint8).tobytes()
    ]
    return b"".join(parts)


def unpack_template(blob: bytes) -> dict | None:
    """
    Unpack the FPM v1 binary template.
    """
    if len(blob) < 8 or blob[:4] != MAGIC_HEADER:
        return None
        
    try:
        offset = 4
        (num_minutiae,) = struct.unpack_from("<I", blob, offset)
        offset += 4
        
        m_xs = np.frombuffer(blob, dtype=np.float32, count=num_minutiae, offset=offset)
        offset += num_minutiae * 4
        
        m_ys = np.frombuffer(blob, dtype=np.float32, count=num_minutiae, offset=offset)
        offset += num_minutiae * 4
        
        m_types = np.frombuffer(blob, dtype=np.uint8, count=num_minutiae, offset=offset)
        offset += num_minutiae * 1
        
        (num_orb,) = struct.unpack_from("<I", blob, offset)
        offset += 4
        
        o_xs = np.frombuffer(blob, dtype=np.float32, count=num_orb, offset=offset)
        offset += num_orb * 4
        
        o_ys = np.frombuffer(blob, dtype=np.float32, count=num_orb, offset=offset)
        offset += num_orb * 4
        
        o_sizes = np.frombuffer(blob, dtype=np.float32, count=num_orb, offset=offset)
        offset += num_orb * 4
        
        o_angles = np.frombuffer(blob, dtype=np.float32, count=num_orb, offset=offset)
        offset += num_orb * 4
        
        orb_des = np.frombuffer(
            blob, dtype=np.uint8,
            count=num_orb * 32,
            offset=offset
        ).reshape(num_orb, 32).copy()
        
        minutiae = list(zip(m_xs.tolist(), m_ys.tolist(), m_types.tolist()))
        
        return {
            "minutiae": minutiae,
            "orb_xs": o_xs.tolist(),
            "orb_ys": o_ys.tolist(),
            "orb_sizes": o_sizes.tolist(),
            "orb_angles": o_angles.tolist(),
            "orb_des": orb_des
        }
    except Exception:
        return None
