"""
matcher.py
----------
1:1 Biometric matching for iris templates across format versions (IRM v1, Legacy, Token).
"""

from __future__ import annotations

import base64
import numpy as np
from iris.config import (
    ROTATION_SHIFT_RANGE,
    RADIAL_SHIFT_RANGE,
    MIN_VALID_BIT_RATIO,
    DEFAULT_MATCH_THRESHOLD,
    TEXTURE_GRID_ROWS,
    TEXTURE_GRID_COLS,
    TEXTURE_GRID_SIZE,
    TEXTURE_SCORE_WEIGHT,
    PHASE_SCORE_WEIGHT,
)
from iris.feature_extractor import MAGIC_HEADER, unpack_iris_template


def compare_templates(
    captured_features: dict,
    reference_template: str | bytes,
) -> tuple[float, str, dict]:
    """
    Compare pre-extracted captured iris features against a stored reference template.

    Format Detection Order:
    1. Simulation token prefixes (iris-template-, scanner-iris-, mock_captured_iris_) -> TOKEN
    2. Safe base64 decoding (if string input)
    3. Binary magic inspection (b'IRM\\x01') -> IRM_V1
    4. Confirmed legacy template inspection (160 bytes float32) -> LEGACY
    5. Unknown / Corrupted format -> UNKNOWN (safely rejected)

    Parameters:
    ----------
    captured_features : dict
        Extracted features of captured iris (keys: 'code_mat', 'mask_mat', 'lbp_vector').
    reference_template : str | bytes
        Stored reference template (token string, base64 string, or raw bytes).

    Returns:
    -------
    score : float
        Biometric similarity score in range [0.0, 100.0].
    version : str
        Detected reference format ('TOKEN', 'IRM_V1', 'LEGACY', or 'UNKNOWN').
    details : dict
        Granular matching diagnostics.
    """
    if not reference_template:
        return 0.0, "UNKNOWN", {"error": "Empty reference template"}

    # 1. Step 1: Simulation Token Detection (before binary deserialization)
    token_str = _extract_simulation_token_string(reference_template)
    if token_str is not None:
        return -1.0, "TOKEN", {"token": token_str}

    # 2. Step 2: Safe Binary Decoding
    ref_bytes = _to_bytes(reference_template)
    if ref_bytes is None or len(ref_bytes) == 0:
        return 0.0, "UNKNOWN", {"error": "Failed to decode reference template bytes"}

    # Check if decoded bytes happen to be a token string
    token_str_decoded = _extract_simulation_token_string(ref_bytes)
    if token_str_decoded is not None:
        return -1.0, "TOKEN", {"token": token_str_decoded}

    # 3. Step 3: IRM_V1 Template Header Inspection
    if ref_bytes.startswith(MAGIC_HEADER):
        ref_unpacked = unpack_iris_template(ref_bytes)
        if ref_unpacked is not None:
            score, details = _match_irm_v1(captured_features, ref_unpacked)
            return score, "IRM_V1", details
        else:
            return 0.0, "UNKNOWN", {"error": "Corrupted or truncated IRM_V1 template"}

    # 4. Step 4: Confirmed Legacy Format Check (40 float32 values = 160 bytes)
    if len(ref_bytes) == 160:
        score, details = _match_legacy_lbp(captured_features, ref_bytes)
        return score, "LEGACY", details

    # 5. Step 5: Safe Rejection
    return 0.0, "UNKNOWN", {"error": "Unsupported reference template format"}


def _match_irm_v1(cap: dict, ref: dict) -> tuple[float, dict]:
    """
    Match IRM_V1 template using fractional Hamming distance across angular bit-shifts
    fused with Gabor+LBP texture descriptor cosine similarity.
    """
    cap_code = cap.get("code_mat")
    cap_mask = cap.get("mask_mat")
    cap_lbp = cap.get("lbp_vector")

    ref_code = ref.get("code_mat")
    ref_mask = ref.get("mask_mat")
    ref_lbp = ref.get("lbp_vector")

    if cap_code is None or cap_mask is None or ref_code is None or ref_mask is None:
        return 0.0, {"error": "Missing IrisCode or mask arrays"}

    total_bits = cap_code.size
    min_required_bits = int(total_bits * MIN_VALID_BIT_RATIO)

    best_hd = 1.0
    best_shift = 0
    best_radial = 0
    best_valid_bits = 0

    # 2D alignment search:
    #   - radial (row) shifts tolerate pupil/iris radius & center inconsistency
    #   - angular (column) shifts tolerate in-plane eye rotation
    for radial in range(-RADIAL_SHIFT_RANGE, RADIAL_SHIFT_RANGE + 1):
        # Radial roll along radial row axis (axis 1)
        ref_code_radial = np.roll(ref_code, radial, axis=1)
        ref_mask_radial = np.roll(ref_mask, radial, axis=1)

        # Angular rotation search over window [-ROTATION_SHIFT_RANGE, +ROTATION_SHIFT_RANGE]
        for shift in range(-ROTATION_SHIFT_RANGE, ROTATION_SHIFT_RANGE + 1):
            # Circular roll along angular column axis (axis 2)
            ref_code_shifted = np.roll(ref_code_radial, shift, axis=2)
            ref_mask_shifted = np.roll(ref_mask_radial, shift, axis=2)

            # Common valid bit mask
            common_mask = cap_mask & ref_mask_shifted
            valid_bits = int(np.sum(common_mask))

            if valid_bits < min_required_bits:
                continue

            # Differing bits within valid region
            xor_diff = (cap_code ^ ref_code_shifted) & common_mask
            hd = float(np.sum(xor_diff)) / float(valid_bits)

            if hd < best_hd:
                best_hd = hd
                best_shift = shift
                best_radial = radial
                best_valid_bits = valid_bits

    # Map fractional Hamming distance to 0-100 phase score
    phase_score = _map_hamming_distance_to_score(best_hd)

    # Texture similarity: aligned local spatial-texture grid (dominant, discriminant
    # signal) with graceful fallback to plain vector cosine for legacy templates.
    texture_score = _match_texture_aligned(
        cap_lbp,
        ref_lbp,
        best_shift,
        best_radial,
    )

    # Score Fusion: texture-dominant because the phase code is near non-discriminative
    # on low-contrast real captures (genuine vs impostor HD separation ~0.02), whereas
    # the local texture grid separates them clearly (+21..+28 pts on the real eval set).
    final_score = (
        PHASE_SCORE_WEIGHT * phase_score + TEXTURE_SCORE_WEIGHT * texture_score
    )
    final_score = float(round(np.clip(final_score, 0.0, 100.0), 2))

    return final_score, {
        "hammingDistance": float(round(best_hd, 4)),
        "bestShift": best_shift,
        "bestRadial": best_radial,
        "validBits": best_valid_bits,
        "phaseScore": float(round(phase_score, 2)),
        "textureScore": float(round(texture_score, 2)),
    }


def _match_texture_aligned(
    cap_vec: np.ndarray | None,
    ref_vec: np.ndarray | None,
    best_shift: int,
    best_radial: int,
) -> float:
    """
    Compare the local spatial-texture descriptor between a captured and reference
    template.

    New templates store TEXTURE_GRID_SIZE floats (a spatial grid of tile means over
    the polar strip) optionally followed by legacy LBP floats. The grid is scored
    with cosine similarity under its OWN angular (column) and radial (row) roll
    search, because the phase code's best shift is a local optimum for phase bits
    that does not coincide with the texture alignment (measured: reusing the phase
    shift zeroes a genuine rotated match; the texture's own optimum recovers it).

    Backward compatibility: if either side lacks a full grid (e.g. an old 40-float
    LBP template, or a length mismatch), the trailing LBP segments are compared so
    grid values never collide with legacy LBP values.
    """
    if cap_vec is None or ref_vec is None or len(cap_vec) == 0 or len(ref_vec) == 0:
        return 0.0

    if len(cap_vec) >= TEXTURE_GRID_SIZE and len(ref_vec) >= TEXTURE_GRID_SIZE:
        cap_grid = cap_vec[:TEXTURE_GRID_SIZE].reshape(TEXTURE_GRID_ROWS, TEXTURE_GRID_COLS)
        ref_grid = ref_vec[:TEXTURE_GRID_SIZE].reshape(TEXTURE_GRID_ROWS, TEXTURE_GRID_COLS)
        best = -1.0
        cap_flat = cap_grid.ravel().astype(np.float64)
        norm_cap = float(np.linalg.norm(cap_flat))
        if norm_cap <= 0.0:
            return 0.0
        for radial in range(-RADIAL_SHIFT_RANGE, RADIAL_SHIFT_RANGE + 1):
            ref_radial = np.roll(ref_grid, radial, axis=0)
            for shift in range(-ROTATION_SHIFT_RANGE, ROTATION_SHIFT_RANGE + 1):
                ref_shifted = np.roll(ref_radial, shift, axis=1)
                ref_flat = ref_shifted.ravel().astype(np.float64)
                norm_ref = float(np.linalg.norm(ref_flat))
                if norm_ref <= 0.0:
                    continue
                cos_sim = float(np.dot(cap_flat / norm_cap, ref_flat / norm_ref))
                if cos_sim > best:
                    best = cos_sim
        if best < 0.0:
            return 0.0
        return float(np.clip(best, 0.0, 1.0) * 100.0)
    else:
        # Legacy/fallback comparison. New templates store the LBP histogram in the
        # trailing 40 floats (after the 512-float spatial grid); pure legacy refs are
        # 40 floats of LBP. Compare the trailing-LBP segment so grid values at the
        # front of new vectors are never matched against legacy LBP values.
        common = 40
        if common > len(cap_vec) or common > len(ref_vec):
            common = min(len(cap_vec), len(ref_vec))
        cap = cap_vec[-common:].astype(np.float64)
        ref = ref_vec[-common:].astype(np.float64)

    norm_cap = float(np.linalg.norm(cap))
    norm_ref = float(np.linalg.norm(ref))
    if norm_cap <= 0.0 or norm_ref <= 0.0:
        return 0.0
    cos_sim = float(np.dot(cap / norm_cap, ref / norm_ref))
    cos_sim = float(np.clip(cos_sim, 0.0, 1.0))
    return cos_sim * 100.0


def _match_legacy_lbp(cap: dict, ref_bytes: bytes) -> tuple[float, dict]:
    """
    Match captured LBP texture vector against confirmed legacy 160-byte float32 reference vector.
    """
    try:
        ref_vec = np.frombuffer(ref_bytes, dtype=np.float32).copy()
        if len(ref_vec) != 40:
            return 0.0, {"error": "Invalid legacy vector length"}

        cap_lbp = cap.get("lbp_vector")
        if cap_lbp is None:
            return 0.0, {"error": "Captured LBP vector missing"}

        # New templates store the legacy LBP histogram in the trailing 40 floats
        # (after the 512-float spatial grid); accept both pure 40-float legacy
        # captured vectors and the new (grid + LBP) form.
        cap_lbp = np.asarray(cap_lbp)
        if len(cap_lbp) >= 40:
            cap_lbp = cap_lbp[-40:].astype(np.float32)
        else:
            return 0.0, {"error": "Captured LBP vector too short"}

        norm_cap = float(np.linalg.norm(cap_lbp))
        norm_ref = float(np.linalg.norm(ref_vec))
        if norm_cap == 0.0 or norm_ref == 0.0:
            return 0.0, {"error": "Zero vector norm"}

        similarity = float(np.dot(cap_lbp / norm_cap, ref_vec / norm_ref))
        similarity = float(np.clip(similarity, 0.0, 1.0))
        score = float(round(similarity * 100.0, 2))

        return score, {
            "cosineSimilarity": float(round(similarity, 4)),
            "legacyFormat": "FLOAT32_GABOR_LBP_40",
        }
    except Exception as e:
        return 0.0, {"error": f"Legacy matching failed: {str(e)}"}


def _map_hamming_distance_to_score(hd: float) -> float:
    """
    Map fractional Hamming distance to a normalized 0-100 biometric score.
    
    Anchor points:
      HD <= 0.15 -> 100.0 (near identical phase bits)
      HD = 0.25  -> 92.0  (strong genuine match)
      HD = 0.32  -> 85.0  (verification threshold boundary)
      HD = 0.35  -> 75.0  (moderate correlation)
      HD = 0.38  -> 60.0  (borderline correlation)
      HD = 0.42  -> 38.0  (weak correlation)
      HD = 0.48  -> 10.0  (independent random irises / impostors)
      HD >= 0.50 -> 0.0
    """
    anchors = [
        (0.00, 100.0),
        (0.15, 100.0),
        (0.25,  92.0),
        (0.32,  85.0),
        (0.35,  75.0),
        (0.38,  60.0),
        (0.42,  38.0),
        (0.48,  10.0),
        (1.00,   0.0),
    ]
    if hd <= 0.0:
        return 100.0
    if hd >= 1.0:
        return 0.0

    for i in range(len(anchors) - 1):
        x0, y0 = anchors[i]
        x1, y1 = anchors[i + 1]
        if x0 <= hd <= x1:
            t = (hd - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return 0.0


def _extract_simulation_token_string(ref: str | bytes) -> str | None:
    """
    Detect if the reference input is a known simulation token string.
    """
    token_prefixes = ("iris-template-", "scanner-iris-", "mock_captured_iris_")
    if isinstance(ref, str):
        cleaned = ref.strip()
        if any(cleaned.startswith(p) for p in token_prefixes):
            return cleaned
    elif isinstance(ref, (bytes, bytearray)):
        try:
            decoded = ref.decode("utf-8", errors="strict").strip()
            if any(decoded.startswith(p) for p in token_prefixes):
                return decoded
        except (UnicodeDecodeError, ValueError):
            pass
    return None


def _to_bytes(data: str | bytes) -> bytes | None:
    """
    Safely convert base64 string or bytes to raw bytes.
    """
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        cleaned = data.strip()
        if "," in cleaned:
            cleaned = cleaned.split(",", 1)[1]
        try:
            return base64.b64decode(cleaned)
        except Exception:
            return None
    return None
