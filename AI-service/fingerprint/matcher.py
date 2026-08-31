"""
matcher.py
----------
Matches captured fingerprint templates against stored references, handling format versions.
"""

import base64
import struct
import cv2
import numpy as np
from datasets.embeddings import compute_dataset_matching_score
from fingerprint.config import (
    MINUTIAE_MATCH_DISTANCE_THRESHOLD,
    MIN_KEYPOINTS,
    RATIO_THRESHOLD
)
from fingerprint.feature_extractor import MAGIC_HEADER, unpack_template

def compare_templates(
    captured_features: dict,
    reference_template_b64: str
) -> tuple[float, str, dict]:
    """
    Compare pre-extracted captured features against reference template.

    Parameters:
    ----------
    captured_features : dict
        Features extracted from captured image (keys: minutiae, orb_xs, orb_ys, orb_des, etc.).
    reference_template_b64 : str
        Base64-encoded stored reference template.

    Returns:
    -------
    score : float
        Biometric similarity score in range [0.0, 100.0].
    version : str
        Detected reference format ('TOKEN', 'LEGACY', 'FPM_V1', or 'UNKNOWN').
    details : dict
        Details of the matching process.
    """
    if not reference_template_b64:
        return 0.0, "UNKNOWN", {"error": "Empty reference template"}

    # 1. Decode reference template bytes
    try:
        ref_bytes = base64.b64decode(reference_template_b64)
    except Exception:
        return 0.0, "UNKNOWN", {"error": "Failed to decode base64 template"}

    if not ref_bytes:
        return 0.0, "UNKNOWN", {"error": "Decoded reference template is empty"}

    # 2. Format / Version Detection
    
    # A. Check for Simulation Token
    try:
        decoded_str = ref_bytes.decode('utf-8', errors='strict')
        if (decoded_str.startswith("fingerprint-template-") or 
            decoded_str.startswith("scanner-fingerprint-") or
            decoded_str.startswith("mock_captured_fingerprint_")):
            
            # Extract cleaned tokens to compare
            # If captured features has a text representation (e.g. scanner stub)
            # we will compute score using dataset embedding similarity.
            return -1.0, "TOKEN", {"token": decoded_str}
    except (UnicodeDecodeError, ValueError):
        pass

    # B. Check for FPM v1 Minutiae Template
    if ref_bytes.startswith(MAGIC_HEADER):
        ref_features = unpack_template(ref_bytes)
        if ref_features is not None:
            score, details = _match_minutiae_fpm_v1(captured_features, ref_features)
            return score, "FPM_V1", details
            
    # C. Check for Legacy ORB Template
    legacy_features = _unpack_legacy_orb_template(ref_bytes)
    if legacy_features is not None:
        score, details = _match_legacy_orb(captured_features, legacy_features)
        return score, "LEGACY", details

    return 0.0, "UNKNOWN", {"error": "Unsupported reference template format"}


def _match_minutiae_fpm_v1(cap: dict, ref: dict) -> tuple[float, dict]:
    """
    Perform robust minutiae alignment and matching guide by ORB keypoints.
    """
    cap_minutiae = cap.get("minutiae", [])
    ref_minutiae = ref.get("minutiae", [])
    
    cap_des = cap.get("orb_des")
    ref_des = ref.get("orb_des")
    
    cap_xs = cap.get("orb_xs", [])
    cap_ys = cap.get("orb_ys", [])
    ref_xs = ref.get("orb_xs", [])
    ref_ys = ref.get("orb_ys", [])
    
    # Default alignment matrix: identity (no translation or rotation)
    M = np.eye(2, 3, dtype=np.float32)
    aligned = False
    
    # 1. ORB-based spatial alignment estimation
    if (cap_des is not None and ref_des is not None and 
        len(cap_des) >= MIN_KEYPOINTS and len(ref_des) >= MIN_KEYPOINTS):
        
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        try:
            matches_list = bf.knnMatch(cap_des, ref_des, k=2)
            good_matches = []
            for pair in matches_list:
                if len(pair) == 2:
                    m, n_match = pair
                    if m.distance < RATIO_THRESHOLD * n_match.distance:
                        good_matches.append(m)
                elif len(pair) == 1:
                    good_matches.append(pair[0])
            
            # Fallback if ratio test yields zero/insufficient matches (e.g. self-similar sinusoids)
            if len(good_matches) < MIN_KEYPOINTS:
                matches = bf.match(cap_des, ref_des)
                good_matches = [m for m in matches if m.distance < 52.0]
                    
            if len(good_matches) >= MIN_KEYPOINTS:
                # Build coordinate arrays for matching keypoints
                pts_c = np.float32([[cap_xs[m.queryIdx], cap_ys[m.queryIdx]] for m in good_matches]).reshape(-1, 1, 2)
                pts_r = np.float32([[ref_xs[m.trainIdx], ref_ys[m.trainIdx]] for m in good_matches]).reshape(-1, 1, 2)
                
                # Estimate rotation, translation, and scale (RANSAC)
                matrix, inliers = cv2.estimateAffinePartial2D(pts_c, pts_r, method=cv2.RANSAC, ransacReprojThreshold=5.0)
                if matrix is not None:
                    M = matrix
                    aligned = True
        except cv2.error:
            pass

    # 2. Centroid-based fallback alignment if ORB alignment failed
    if not aligned and len(cap_minutiae) > 0 and len(ref_minutiae) > 0:
        c_x = np.mean([m[0] for m in cap_minutiae])
        c_y = np.mean([m[1] for m in cap_minutiae])
        r_x = np.mean([m[0] for m in ref_minutiae])
        r_y = np.mean([m[1] for m in ref_minutiae])
        M[0, 2] = r_x - c_x
        M[1, 2] = r_y - c_y
        aligned = True

    # 3. Transform and match minutiae points
    num_matched = 0
    matched_pairs = []
    
    if len(cap_minutiae) > 0 and len(ref_minutiae) > 0:
        # Convert captured minutiae to coordinates array (N, 1, 2)
        pts_min = np.float32([[m[0], m[1]] for m in cap_minutiae]).reshape(-1, 1, 2)
        # Apply alignment matrix
        pts_aligned = cv2.transform(pts_min, M).reshape(-1, 2)
        
        # Greedy point matching
        ref_used = [False] * len(ref_minutiae)
        for i, (ax, ay) in enumerate(pts_aligned):
            type_c = cap_minutiae[i][2]
            best_dist = float('inf')
            best_idx = -1
            
            for j, (rx, ry, type_r) in enumerate(ref_minutiae):
                if ref_used[j] or type_c != type_r:
                    continue
                dist = np.hypot(ax - rx, ay - ry)
                if dist < MINUTIAE_MATCH_DISTANCE_THRESHOLD and dist < best_dist:
                    best_dist = dist
                    best_idx = j
                    
            if best_idx != -1:
                ref_used[best_idx] = True
                num_matched += 1
                matched_pairs.append((i, best_idx))

    # Calculate minutiae match ratio and map it using anchor curve
    minutiae_score = 0.0
    min_len = min(len(cap_minutiae), len(ref_minutiae))
    if min_len > 0:
        ratio = num_matched / min_len
        minutiae_score = _map_minutiae_ratio_to_score(ratio)

    # Fallback/supporting ORB matching score
    orb_score = 0.0
    if (cap_des is not None and ref_des is not None and 
        len(cap_des) >= MIN_KEYPOINTS and len(ref_des) >= MIN_KEYPOINTS):
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        try:
            matches = bf.knnMatch(cap_des, ref_des, k=2)
            good = [m[0] for m in matches if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
            if len(good) < MIN_KEYPOINTS:
                # Fallback to absolute Hamming distance
                flat_matches = bf.match(cap_des, ref_des)
                good = [m for m in flat_matches if m.distance < 52.0]
            ratio = len(good) / max(min(len(cap_des), len(ref_des)), 1)
            orb_score = _map_match_ratio_to_score(ratio)
        except cv2.error:
            pass

    # Score Fusion: 70% minutiae, 30% ORB spatial fallback
    # If no minutiae are extracted, fall back entirely to ORB correlation
    if len(cap_minutiae) == 0 or len(ref_minutiae) == 0:
        final_score = orb_score
    else:
        final_score = 0.7 * minutiae_score + 0.3 * orb_score

    final_score = round(max(0.0, min(100.0, final_score)), 2)
    
    return final_score, {
        "minutiaeScore": float(round(minutiae_score, 2)),
        "orbScore": float(round(orb_score, 2)),
        "minutiaeCaptured": len(cap_minutiae),
        "minutiaeReference": len(ref_minutiae),
        "minutiaeMatched": num_matched,
        "aligned": aligned
    }


def _match_legacy_orb(cap: dict, ref: dict) -> tuple[float, dict]:
    """
    Match captured ORB features against legacy reference descriptors.
    """
    cap_des = cap.get("orb_des")
    ref_des = ref.get("orb_des")
    
    if cap_des is None or ref_des is None:
        return 0.0, {"error": "Missing descriptors"}
        
    if len(cap_des) < MIN_KEYPOINTS or len(ref_des) < MIN_KEYPOINTS:
        return 0.0, {"error": "Insufficient descriptors"}
        
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    try:
        matches = bf.knnMatch(cap_des, ref_des, k=2)
        good = [m[0] for m in matches if len(m) == 2 and m[0].distance < RATIO_THRESHOLD * m[1].distance]
        if len(good) < MIN_KEYPOINTS:
            # Fallback to absolute Hamming distance
            flat_matches = bf.match(cap_des, ref_des)
            good = [m for m in flat_matches if m.distance < 52.0]
        ratio = len(good) / max(min(len(cap_des), len(ref_des)), 1)
        score = _map_match_ratio_to_score(ratio)
        return round(score, 2), {
            "orbScore": float(round(score, 2)),
            "matchesCount": len(good),
            "ratio": float(round(ratio, 3))
        }
    except cv2.error:
        return 0.0, {"error": "OpenCV matcher failure"}


def _unpack_legacy_orb_template(blob: bytes) -> dict | None:
    """
    Unpack legacy keypoint coordinate + BRIEF descriptor packed format.
    """
    if len(blob) < 4:
        return None
    try:
        (n,) = struct.unpack_from("<I", blob, 0)
        if n == 0:
            return None
        # Old layout size check
        expected_size = 4 + n * 4 * 4 + n * 32
        if len(blob) != expected_size:
            return None
            
        offset = 4
        # Skip coordinates, sizes, angles to get directly to descriptors
        offset += n * 4 * 4
        des = np.frombuffer(
            blob, dtype=np.uint8,
            count=n * 32,
            offset=offset
        ).reshape(n, 32).copy()
        return {"orb_des": des}
    except Exception:
        return None


def _map_match_ratio_to_score(ratio: float) -> float:
    """
    Map a good-match ratio in [0, 1] to a similarity score in [0, 100].
    """
    anchors = [
        (0.00,   0.0),
        (0.10,  50.0),
        (0.20,  70.0),
        (0.40,  85.0),
        (0.70,  95.0),
        (1.00, 100.0),
    ]
    if ratio <= 0.0:
        return 0.0
    if ratio >= 1.0:
        return 100.0
    for i in range(len(anchors) - 1):
        x0, y0 = anchors[i]
        x1, y1 = anchors[i + 1]
        if x0 <= ratio <= x1:
            t = (ratio - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return 100.0


def _map_minutiae_ratio_to_score(ratio: float) -> float:
    """
    Map minutiae match ratio to biometric similarity score.
    A ratio of 0.35 (35% of minutiae matched) is already a strong match.
    """
    anchors = [
        (0.00,   0.0),
        (0.12,  50.0),
        (0.20,  70.0),
        (0.35,  85.0),
        (0.50,  92.0),
        (0.70,  97.0),
        (1.00, 100.0),
    ]
    if ratio <= 0.0:
        return 0.0
    if ratio >= 1.0:
        return 100.0
    for i in range(len(anchors) - 1):
        x0, y0 = anchors[i]
        x1, y1 = anchors[i + 1]
        if x0 <= ratio <= x1:
            t = (ratio - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return 100.0

