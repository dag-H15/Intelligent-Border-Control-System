"""
quality.py
----------
Biometric-specific multi-signal quality assessment and validity gating for fingerprints.

Evaluates modality-specific structural signatures (ridge orientation coherence,
frequency consistency, ridge clarity, foreground geometry, minutiae distribution)
on the active fingerprint foreground rather than raw unsegmented backgrounds,
ensuring real optical scanner/photo captures score accurately while non-biometric
images (charts, documents, screenshots, random noise) are rejected.
"""

from __future__ import annotations
import cv2
import numpy as np
from skimage.morphology import skeletonize

from fingerprint.config import (
    MIN_QUALITY_THRESHOLD,
    QUALITY_GOOD_THRESHOLD,
    QUALITY_ACCEPTABLE_THRESHOLD,
    FP_MIN_VALIDITY_SCORE,
    FP_MIN_COHERENCE_DEFAULT,
    FP_RIDGE_FREQ_MIN_DEFAULT,
    FP_RIDGE_FREQ_MAX_DEFAULT,
    FP_MIN_FOREGROUND_RATIO,
    FP_MAX_SUSPICIOUS_MINUTIAE,
)
from fingerprint.preprocessing import preprocess_fingerprint_image


def _compute_orientation_coherence(normalized: np.ndarray, mask: np.ndarray, block_size: int = 16) -> tuple[float, float, int, int]:
    """
    Compute local gradient orientation coherence across the active foreground.
    
    Returns:
    -------
    mean_coherence : float (0.0 to 1.0)
    coh_ratio_in_fg : float (0.0 to 1.0, ratio of active blocks with coherent parallel flow)
    fg_blocks : int
    coherent_blocks : int
    """
    h, w = normalized.shape[:2]
    sobelx = cv2.Sobel(normalized, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(normalized, cv2.CV_64F, 0, 1, ksize=3)

    coherences = []
    coherent_count = 0
    total_fg_blocks = 0

    for y in range(0, h - block_size + 1, block_size):
        for x in range(0, w - block_size + 1, block_size):
            block_mask = mask[y:y + block_size, x:x + block_size]
            if np.sum(block_mask == 255) < (0.20 * block_size * block_size):
                continue

            total_fg_blocks += 1
            gx = sobelx[y:y + block_size, x:x + block_size]
            gy = sobely[y:y + block_size, x:x + block_size]

            vx = float(np.sum(gx ** 2 - gy ** 2))
            vy = float(np.sum(2.0 * gx * gy))
            s = float(np.sum(gx ** 2 + gy ** 2))

            if s > 1e-4:
                coh = np.sqrt(vx ** 2 + vy ** 2) / s
                coherences.append(coh)
                if coh >= 0.45:
                    coherent_count += 1

    if not coherences or total_fg_blocks == 0:
        return 0.0, 0.0, 0, 0

    mean_coherence = float(np.mean(coherences))
    coh_ratio_in_fg = float(coherent_count) / float(total_fg_blocks)
    return mean_coherence, coh_ratio_in_fg, total_fg_blocks, coherent_count


def _compute_ridge_frequency_and_periodicity(normalized: np.ndarray, mask: np.ndarray) -> tuple[float, float, bool]:
    """
    Analyze spatial profiles along horizontal and vertical directions across the active foreground
    to estimate dominant ridge frequency and periodic waveform consistency.
    """
    h, w = normalized.shape[:2]
    frequencies = []
    prominences = []

    # Horizontal slice sampling
    for y in np.linspace(h * 0.2, h * 0.8, 8, dtype=int):
        row = normalized[y, :].astype(np.float64)
        row_mask = mask[y, :] == 255
        if np.sum(row_mask) < 24:
            continue

        valid_row = row[row_mask] - np.mean(row[row_mask])
        if len(valid_row) < 24:
            continue

        fft_res = np.abs(np.fft.rfft(valid_row))
        freq_bins = np.fft.rfftfreq(len(valid_row))

        if len(fft_res) > 2:
            fft_res[0] = 0.0
            peak_idx = int(np.argmax(fft_res))
            peak_power = fft_res[peak_idx]
            total_power = np.sum(fft_res) + 1e-5
            if total_power > 0:
                frequencies.append(freq_bins[peak_idx])
                prominences.append(peak_power / total_power)

    # Vertical slice sampling
    for x in np.linspace(w * 0.2, w * 0.8, 8, dtype=int):
        col = normalized[:, x].astype(np.float64)
        col_mask = mask[:, x] == 255
        if np.sum(col_mask) < 24:
            continue

        valid_col = col[col_mask] - np.mean(col[col_mask])
        if len(valid_col) < 24:
            continue

        fft_res = np.abs(np.fft.rfft(valid_col))
        freq_bins = np.fft.rfftfreq(len(valid_col))

        if len(fft_res) > 2:
            fft_res[0] = 0.0
            peak_idx = int(np.argmax(fft_res))
            peak_power = fft_res[peak_idx]
            total_power = np.sum(fft_res) + 1e-5
            if total_power > 0:
                frequencies.append(freq_bins[peak_idx])
                prominences.append(peak_power / total_power)

    if not frequencies:
        return 0.0, 0.0, False

    mean_freq = float(np.mean(frequencies))
    mean_prom = float(np.mean(prominences))

    is_valid_freq = (FP_RIDGE_FREQ_MIN_DEFAULT <= mean_freq <= FP_RIDGE_FREQ_MAX_DEFAULT)
    freq_score = 100.0 if is_valid_freq else max(0.0, 100.0 - abs(mean_freq - 0.12) * 600.0)
    periodicity_score = float(np.clip(mean_prom * 280.0 * (freq_score / 100.0), 0.0, 100.0))

    return mean_freq, periodicity_score, is_valid_freq


def _evaluate_minutiae_distribution(normalized: np.ndarray, mask: np.ndarray) -> tuple[int, float]:
    """
    Extract candidate minutiae on skeletonized active foreground and evaluate count/spatial spread.
    Acts as a supporting signal (not sole hard gate).
    """
    _, binary = cv2.threshold(normalized, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    binary_bool = (binary == 255) & (mask == 255)

    skeleton = skeletonize(binary_bool)
    h, w = skeleton.shape
    points = np.argwhere(skeleton)

    minutiae_count = 0
    for r, c in points:
        if r < 2 or r >= h - 2 or c < 2 or c >= w - 2:
            continue
        n = [
            skeleton[r - 1, c],
            skeleton[r - 1, c + 1],
            skeleton[r, c + 1],
            skeleton[r + 1, c + 1],
            skeleton[r + 1, c],
            skeleton[r + 1, c - 1],
            skeleton[r, c - 1],
            skeleton[r - 1, c - 1],
        ]
        n_bin = [1 if val else 0 for val in n]
        cn = 0.5 * sum(abs(n_bin[i] - n_bin[(i + 1) % 8]) for i in range(8))
        if cn == 1 or cn == 3:
            minutiae_count += 1

    if minutiae_count == 0:
        reliability = 0.0
    elif minutiae_count > FP_MAX_SUSPICIOUS_MINUTIAE:
        reliability = max(0.0, 100.0 - (minutiae_count - FP_MAX_SUSPICIOUS_MINUTIAE) * 2.0)
    elif minutiae_count < 6:
        reliability = (minutiae_count / 6.0) * 60.0
    else:
        reliability = min(100.0, 50.0 + (minutiae_count / 30.0) * 50.0)

    return minutiae_count, float(reliability)


def check_quality(img_bgr: np.ndarray) -> dict:
    """
    Perform biometric-specific multi-signal quality assessment on a raw BGR fingerprint image.
    Evaluates foreground-specific ridge metrics to support real scanner captures, photos,
    and normalized fingerprints accurately.
    """
    if img_bgr is None or img_bgr.size == 0:
        return {
            "score": 0.0,
            "acceptable": False,
            "biometricValid": False,
            "biometricType": "fingerprint",
            "qualityStatus": "INVALID_BIOMETRIC",
            "issues": ["Empty or invalid image payload"],
            "details": {"sharpness": 0.0, "contrast": 0.0, "heuristic": 0.0},
            "signals": {},
        }

    raw_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # 1. Preprocess & foreground segmentation
    normalized, mask = preprocess_fingerprint_image(img_bgr)
    fg_area_ratio = float(np.sum(mask == 255)) / float(mask.size)
    fg_pixels = normalized[mask == 255]

    # 2. Ridge orientation coherence across active foreground blocks
    mean_coherence, coh_ratio_in_fg, fg_blocks, coherent_blocks = _compute_orientation_coherence(normalized, mask)
    coherence_score = min(100.0, (mean_coherence / 0.40) * 100.0)

    # 3. Ridge frequency & periodicity (multi-slice FFT)
    dominant_freq, periodicity_score, is_valid_freq = _compute_ridge_frequency_and_periodicity(normalized, mask)

    # 4. Foreground ridge clarity & contrast
    raw_resized = cv2.resize(raw_gray, (300, 300))
    raw_fg = raw_resized[mask == 255] if len(fg_pixels) > 50 else raw_resized.ravel()
    raw_contrast = float(np.std(raw_fg))
    contrast_score = min(100.0, (raw_contrast / 40.0) * 100.0)
    clarity_score = min(100.0, (float(np.std(fg_pixels)) / 35.0) * 100.0) if len(fg_pixels) > 50 else 0.0

    # 5. Minutiae count and plausibility
    minutiae_count, minutiae_reliability = _evaluate_minutiae_distribution(normalized, mask)

    # 6. Foreground-aware sharpness (Laplacian variance on active ridge area)
    raw_lap = cv2.Laplacian(raw_resized, cv2.CV_64F)
    raw_lap_fg = raw_lap[mask == 255] if len(fg_pixels) > 50 else raw_lap.ravel()
    raw_lap_var = float(np.var(raw_lap_fg))
    sharpness_score = min(100.0, (raw_lap_var / 100.0) * 100.0)

    # 7. Foreground brightness
    mean_brightness = float(np.mean(raw_fg)) if len(raw_fg) > 50 else float(np.mean(raw_gray))
    brightness_dev = abs(mean_brightness - 127.5)
    brightness_score = max(0.0, 100.0 - (brightness_dev / 1.275))

    # 8. Active contact pad density inside bounding box
    pts = cv2.findNonZero(mask)
    if pts is not None and len(pts) > 50:
        bx, by, bw, bh = cv2.boundingRect(pts)
        density_in_bbox = (cv2.countNonZero(mask) / float(bw * bh)) if (bw * bh) > 0 else 0.0
    else:
        density_in_bbox = 0.0

    area_score = min(100.0, (fg_area_ratio / 0.10) * 100.0)

    # =========================================================================
    # Biometric Validity Gate (Multi-Signal Consensus)
    # =========================================================================
    validity_score = (
        0.35 * coherence_score
        + 0.25 * periodicity_score
        + 0.20 * clarity_score
        + 0.10 * area_score
        + 0.10 * minutiae_reliability
    )

    # Multi-signal validity: genuine fingerprints have high orientation coherence (>=0.35),
    # strong coherent block coverage (>=50%), sufficient foreground blocks (>=18), and
    # compact ridge density (>=0.45 or full canvas >=0.30). Non-biometric clutter (text,
    # grids, charts, screenshots, random noise) is rejected on low coherence / low coherent
    # block coverage / low foreground area rather than on raw minutiae count, because real,
    # high-detail fingerprints legitimately contain many ridge-endings and must not be
    # rejected simply for having a large minutiae count.
    is_biometric_valid = (
        validity_score >= 35.0
        and fg_blocks >= 18
        and fg_area_ratio >= 0.04
        and mean_coherence >= 0.35
        and coh_ratio_in_fg >= 0.50
        and (density_in_bbox >= 0.45 or fg_area_ratio >= 0.30)
    )

    # Non-biometric rejection (charts, documents, screenshots, blank, noise)
    if not is_biometric_valid:
        overall_score = float(round(min(validity_score * 0.35, 24.0), 2))
        return {
            "score": overall_score,
            "acceptable": False,
            "biometricValid": False,
            "biometricType": "fingerprint",
            "qualityStatus": "INVALID_BIOMETRIC",
            "issues": ["No reliable fingerprint ridge structure detected (invalid biometric sample)"],
            "details": {
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
                "heuristic": float(round(validity_score, 2)),
                "laplacianVariance": float(round(raw_lap_var, 2)),
                "brightness": float(round(brightness_score, 2)),
                "area": float(round(area_score, 2)),
            },
            "signals": {
                "foregroundRatio": float(round(fg_area_ratio, 3)),
                "ridgeCoherence": float(round(mean_coherence, 3)),
                "coherentBlockRatio": float(round(coh_ratio_in_fg, 3)),
                "padDensity": float(round(density_in_bbox, 3)),
                "ridgeFrequency": float(round(dominant_freq, 4)),
                "periodicityScore": float(round(periodicity_score, 2)),
                "ridgeClarity": float(round(clarity_score, 2)),
                "minutiaeCount": int(minutiae_count),
                "minutiaeReliability": float(round(minutiae_reliability, 2)),
                "sharpness": float(round(sharpness_score, 2)),
                "contrast": float(round(contrast_score, 2)),
            },
        }

    # =========================================================================
    # Multi-Signal Quality Scoring for Valid Fingerprints
    # =========================================================================
    composite_score = (
        0.25 * coherence_score
        + 0.25 * periodicity_score
        + 0.20 * clarity_score
        + 0.15 * area_score
        + 0.15 * sharpness_score
    )

    # Penalize degraded biometrics (blur, low raw contrast)
    if raw_lap_var < 15.0:
        composite_score = min(composite_score, 38.0)
    if raw_contrast < 15.0:
        composite_score = min(composite_score, 38.0)

    overall_score = float(round(np.clip(composite_score, 0.0, 100.0), 2))

    if overall_score >= QUALITY_GOOD_THRESHOLD:
        status = "GOOD"
    elif overall_score >= QUALITY_ACCEPTABLE_THRESHOLD:
        status = "ACCEPTABLE"
    else:
        status = "POOR"

    issues: list[str] = []
    if raw_lap_var < 20.0 or sharpness_score < 30.0:
        issues.append("Fingerprint image is blurry")
    if raw_contrast < 18.0 or contrast_score < 30.0:
        issues.append("Low contrast in ridge details")
    if brightness_score < 30.0:
        if mean_brightness > 225.0:
            issues.append("Image is overexposed (too bright)")
        elif mean_brightness < 30.0:
            issues.append("Image is underexposed (too dark)")
    if area_score < 25.0:
        issues.append("Fingerprint contact area is too small")
    if coherence_score < 30.0:
        issues.append("Disrupted or irregular ridge flow")

    is_acceptable = (
        overall_score >= MIN_QUALITY_THRESHOLD
        and is_biometric_valid
        and (raw_lap_var >= 12.0)
        and (raw_contrast >= 14.0)
    )

    return {
        "score": overall_score,
        "acceptable": bool(is_acceptable),
        "biometricValid": True,
        "biometricType": "fingerprint",
        "qualityStatus": status,
        "issues": issues,
        "details": {
            "sharpness": float(round(sharpness_score, 2)),
            "contrast": float(round(contrast_score, 2)),
            "heuristic": float(round(coherence_score, 2)),
            "laplacianVariance": float(round(raw_lap_var, 2)),
            "brightness": float(round(brightness_score, 2)),
            "area": float(round(area_score, 2)),
        },
        "signals": {
            "foregroundRatio": float(round(fg_area_ratio, 3)),
            "ridgeCoherence": float(round(mean_coherence, 3)),
            "coherentBlockRatio": float(round(coh_ratio_in_fg, 3)),
            "padDensity": float(round(density_in_bbox, 3)),
            "ridgeFrequency": float(round(dominant_freq, 4)),
            "periodicityScore": float(round(periodicity_score, 2)),
            "ridgeClarity": float(round(clarity_score, 2)),
            "minutiaeCount": int(minutiae_count),
            "minutiaeReliability": float(round(minutiae_reliability, 2)),
            "sharpness": float(round(sharpness_score, 2)),
            "contrast": float(round(contrast_score, 2)),
        },
    }
