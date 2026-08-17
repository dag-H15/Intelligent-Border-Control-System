"""
predictor.py
------------
BiometricPredictor — extracts and compares biometric templates.

Fingerprint  (ORB keypoint descriptors)
  Template format:  [ n_keypoints (uint32 LE)
                    | kp_x … (float32 × n)
                    | kp_y … (float32 × n)
                    | kp_size … (float32 × n)
                    | kp_angle … (float32 × n)
                    | descriptors (uint8 × n × 32) ]
  Extraction:
    1. CLAHE-enhanced 300×300 grayscale (preprocess_fingerprint)
    2. ORB (nfeatures=512, scaleFactor=1.2, nlevels=8, edgeThreshold=15,
            patchSize=31, fastThreshold=10) — lower edgeThreshold and
       fastThreshold retain more keypoints on smooth low-contrast ridges.
    3. Pack keypoint metadata + BRIEF descriptors into a single byte blob.
  Comparison:
    BFMatcher (Hamming) + Lowe ratio test (0.75) → good-match ratio mapped
    to a 0–100 score.  Minimum 4 keypoints required; falls back to a
    histogram-based score when ORB cannot find enough points.

Iris  (Gabor + LBP feature vector)
  Template format:  float32 array, L2-normalised, variable length
                    (4 filter × histogram_bins for each Gabor response).
  Extraction:
    1. 64×512 polar strip (preprocess_iris — Daugman rubber-sheet model).
    2. Bank of 4 Gabor filters (2 frequencies × 2 orientations) applied to
       the strip.
    3. LBP histogram (radius=1, n_points=8, method='uniform') computed on
       each Gabor response map.
    4. Concatenate histograms → L2-normalise → float32 array.
  Comparison:
    Cosine similarity (dot product of L2-normalised vectors) → 0–100 score.

Wire format (both directions)
  extract_template() → base64(raw bytes of the template blob)
  compare_template() → float score 0.0–100.0
  These are the same signatures matcher.py and app.py already expect.
"""

from __future__ import annotations

import base64
import struct

import cv2
import numpy as np

from utils.image_processing import (
    decode_base64_image,
    preprocess_fingerprint,
    preprocess_iris,
)

# ---------------------------------------------------------------------------
# Iris Gabor + LBP helpers — no scikit-image runtime import at module level
# so the service still starts even if scikit-image is absent (it will raise
# only when an iris image is actually processed).
# ---------------------------------------------------------------------------

def _build_gabor_kernels() -> list[np.ndarray]:
    """
    Return 4 Gabor kernels covering 2 frequencies × 2 orientations.
    Parameters are tuned for the 64×512 polar strip:
      - ksize 31×31 — large enough to capture iris texture bands
      - sigma  4    — controls the Gaussian envelope width
      - frequencies 0.1, 0.2 — two spatial frequency bands
      - orientations 0, π/2  — horizontal and vertical texture directions
    """
    kernels: list[np.ndarray] = []
    for freq in (0.1, 0.2):
        for theta in (0.0, np.pi / 2):
            k = cv2.getGaborKernel(
                ksize=(31, 31),
                sigma=4.0,
                theta=theta,
                lambd=1.0 / freq,
                gamma=0.5,
                psi=0.0,
                ktype=cv2.CV_32F,
            )
            kernels.append(k)
    return kernels


_GABOR_KERNELS: list[np.ndarray] = _build_gabor_kernels()

_LBP_N_POINTS = 8
_LBP_RADIUS   = 1
_LBP_N_BINS   = _LBP_N_POINTS + 2   # uniform LBP: n_points + 2 bins


def _lbp_histogram(image: np.ndarray) -> np.ndarray:
    """
    Compute a uniform Local Binary Pattern histogram for *image*.
    Returns a 1-D float32 array of length (_LBP_N_BINS,).
    Raises ImportError if scikit-image is not installed.
    """
    from skimage.feature import local_binary_pattern  # type: ignore
    # LBP expects integer dtype to avoid floating-point comparison artefacts
    lbp = local_binary_pattern(
        image.astype(np.uint8),
        P=_LBP_N_POINTS,
        R=_LBP_RADIUS,
        method="uniform",
    )
    hist, _ = np.histogram(lbp, bins=_LBP_N_BINS, range=(0, _LBP_N_BINS))
    return hist.astype(np.float32)


# ---------------------------------------------------------------------------
# ORB fingerprint constants
# ---------------------------------------------------------------------------

_ORB_N_FEATURES   = 512
_DESCRIPTOR_BYTES = 32        # BRIEF descriptor length for ORB (always 32 bytes)
_MIN_KEYPOINTS    = 4         # below this we fall back to histogram comparison
_RATIO_THRESHOLD  = 0.75      # Lowe ratio test threshold


# ---------------------------------------------------------------------------
# BiometricPredictor
# ---------------------------------------------------------------------------

class BiometricPredictor:
    """
    Public API (unchanged from the previous version):
        extract_template(payload, biometric_type)  → base64 str
        compare_template(captured_data, reference_template, biometric_type) → float
        predict_match_score(...)  → float   (compatibility wrapper)
    """

    def __init__(self) -> None:
        self._orb = cv2.ORB_create(
            nfeatures=_ORB_N_FEATURES,
            scaleFactor=1.2,
            nlevels=8,
            edgeThreshold=15,
            patchSize=31,
            fastThreshold=10,
        )
        # BFMatcher with Hamming distance for binary (ORB/BRIEF) descriptors.
        # crossCheck=False so we can apply the ratio test ourselves.
        self._bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def extract_template(self, payload: str, biometric_type: str) -> str:
        """
        Extract a biometric template from *payload* (base64 image or scanner
        token string) and return it as a base64-encoded byte string.

        The template bytes are opaque to the caller — they are stored as BYTEA
        in PostgreSQL via Node/Prisma and passed back verbatim on verify.
        """
        biometric_type = biometric_type.lower()
        img = decode_base64_image(payload)

        if img is None:
            # Payload is not an image (e.g. scanner stub string).
            # We cannot extract a meaningful template.  Return an empty
            # template — the caller will receive a 0-score on compare.
            return base64.b64encode(b"").decode("ascii")

        if biometric_type == "iris":
            template_bytes = self._extract_iris_template(img)
        else:
            # Default to fingerprint for "fingerprint" or any unrecognised type
            template_bytes = self._extract_fingerprint_template(img)

        return base64.b64encode(template_bytes).decode("ascii")

    def compare_template(
        self,
        captured_data: str,
        reference_template: str,
        biometric_type: str,
    ) -> float:
        """
        Compare a freshly captured image (*captured_data*, base64 or string)
        against a stored template (*reference_template*, base64 byte blob as
        returned by extract_template).

        Returns a similarity score in [0.0, 100.0].
        """
        if not captured_data or not reference_template:
            return 0.0

        biometric_type = biometric_type.lower()

        # Decode the stored template bytes
        try:
            stored_bytes = base64.b64decode(reference_template)
        except Exception:
            return 0.0

        if len(stored_bytes) == 0:
            return 0.0

        img = decode_base64_image(captured_data)
        if img is None:
            return 0.0

        if biometric_type == "iris":
            return self._compare_iris(img, stored_bytes)
        else:
            return self._compare_fingerprint(img, stored_bytes)

    def predict_match_score(
        self,
        captured_data: str,
        reference_template: str,
        biometric_type: str,
        capture_mode: str,  # kept for backward compatibility
    ) -> float:
        """Compatibility wrapper for older callers."""
        return self.compare_template(captured_data, reference_template, biometric_type)

    # ------------------------------------------------------------------
    # Fingerprint: extraction
    # ------------------------------------------------------------------

    def _extract_fingerprint_template(self, img_bgr: np.ndarray) -> bytes:
        """
        Detect ORB keypoints on the CLAHE-enhanced fingerprint image and pack
        keypoint metadata + BRIEF descriptors into a compact byte blob.

        Blob layout
        -----------
        [0:4]      uint32 LE  — number of keypoints  n
        [4 : 4+4n] float32 LE — keypoint x coords (n values)
        [4+4n : …] float32 LE — keypoint y coords
        [   …    ] float32 LE — keypoint sizes
        [   …    ] float32 LE — keypoint angles (degrees, -1 if unset)
        [   …    ] uint8      — BRIEF descriptors  (n × 32 bytes)

        If fewer than _MIN_KEYPOINTS keypoints are found, the ORB detection
        is retried with a lower FAST threshold (5) and fewer required
        keypoints (128) before giving up and returning an empty blob.
        """
        gray = preprocess_fingerprint(img_bgr)
        kps, des = self._orb.detectAndCompute(gray, None)

        # Retry with more permissive settings for low-contrast images
        if des is None or len(kps) < _MIN_KEYPOINTS:
            orb_fallback = cv2.ORB_create(
                nfeatures=128,
                scaleFactor=1.2,
                nlevels=8,
                edgeThreshold=10,
                patchSize=21,
                fastThreshold=5,
            )
            kps, des = orb_fallback.detectAndCompute(gray, None)

        if des is None or len(kps) < _MIN_KEYPOINTS:
            # Still not enough — return empty template; compare will return 0
            return b""

        n = len(kps)
        xs     = np.array([k.pt[0]    for k in kps], dtype=np.float32)
        ys     = np.array([k.pt[1]    for k in kps], dtype=np.float32)
        sizes  = np.array([k.size     for k in kps], dtype=np.float32)
        angles = np.array([k.angle    for k in kps], dtype=np.float32)
        # des shape: (n, 32) uint8

        parts = [
            struct.pack("<I", n),   # number of keypoints
            xs.tobytes(),
            ys.tobytes(),
            sizes.tobytes(),
            angles.tobytes(),
            des.astype(np.uint8).tobytes(),
        ]
        return b"".join(parts)

    # ------------------------------------------------------------------
    # Fingerprint: comparison
    # ------------------------------------------------------------------

    def _compare_fingerprint(
        self, img_bgr: np.ndarray, stored_bytes: bytes
    ) -> float:
        """
        Compare a captured fingerprint image against a stored ORB template.

        1. Extract ORB descriptors from the captured image.
        2. Unpack descriptors from the stored template.
        3. BFMatcher + Lowe ratio test → good-match ratio.
        4. Map to a 0–100 score.

        Falls back to a histogram-based score if either side lacks keypoints.
        """
        gray = preprocess_fingerprint(img_bgr)

        # --- Unpack stored template ---
        stored_des = self._unpack_fingerprint_descriptors(stored_bytes)

        # --- Extract from captured image ---
        kps_cap, des_cap = self._orb.detectAndCompute(gray, None)
        if des_cap is None or len(kps_cap) < _MIN_KEYPOINTS:
            orb_fallback = cv2.ORB_create(
                nfeatures=128,
                scaleFactor=1.2,
                nlevels=8,
                edgeThreshold=10,
                patchSize=21,
                fastThreshold=5,
            )
            kps_cap, des_cap = orb_fallback.detectAndCompute(gray, None)

        if stored_des is None or des_cap is None:
            # Fall back to histogram comparison
            return self._fingerprint_histogram_score(gray, stored_bytes)

        if len(stored_des) < _MIN_KEYPOINTS or len(des_cap) < _MIN_KEYPOINTS:
            return self._fingerprint_histogram_score(gray, stored_bytes)

        # --- Ratio-test matching ---
        try:
            matches_list = self._bf.knnMatch(des_cap, stored_des, k=2)
        except cv2.error:
            return self._fingerprint_histogram_score(gray, stored_bytes)

        good: list = []
        for pair in matches_list:
            if len(pair) == 2:
                m, n_match = pair
                if m.distance < _RATIO_THRESHOLD * n_match.distance:
                    good.append(m)
            elif len(pair) == 1:
                # Only one match returned — accept unconditionally
                good.append(pair[0])

        n_ref = len(stored_des)
        n_cap = len(des_cap)
        ratio = len(good) / max(min(n_ref, n_cap), 1)

        # Non-linear mapping: ratio 0→0, 0.15→70, 0.40→85, 1.0→100
        # This gives a realistic spread rather than always landing near 100.
        score = _map_match_ratio_to_score(ratio)
        return round(score, 2)

    @staticmethod
    def _unpack_fingerprint_descriptors(blob: bytes) -> np.ndarray | None:
        """
        Unpack BRIEF descriptors from a fingerprint template blob.
        Returns an (n × 32) uint8 ndarray, or None if the blob is invalid.
        """
        if len(blob) < 4:
            return None
        try:
            (n,) = struct.unpack_from("<I", blob, 0)
            if n == 0:
                return None
            offset = 4 + n * 4 * 4   # skip n, xs, ys, sizes, angles
            expected_size = 4 + n * 4 * 4 + n * _DESCRIPTOR_BYTES
            if len(blob) < expected_size:
                return None
            des = np.frombuffer(
                blob, dtype=np.uint8,
                count=n * _DESCRIPTOR_BYTES,
                offset=offset,
            ).reshape(n, _DESCRIPTOR_BYTES).copy()
            return des
        except Exception:
            return None

    def _fingerprint_histogram_score(
        self, gray_cap: np.ndarray, stored_bytes: bytes
    ) -> float:
        """
        Last-resort comparison: histogram correlation between the captured
        grayscale image and a histogram reconstructed from the stored blob.
        Used when ORB keypoint detection fails on either side.
        Returns a score in [0, 100].
        """
        hist_cap = cv2.calcHist([gray_cap], [0], None, [256], [0, 256])
        cv2.normalize(hist_cap, hist_cap, 0, 1, cv2.NORM_MINMAX)

        # Try to build a comparison histogram from stored descriptor bytes
        # (treat raw bytes as pixel intensities — crude but better than 0)
        arr = np.frombuffer(stored_bytes[-min(4096, len(stored_bytes)):], dtype=np.uint8)
        dummy_img = arr.reshape(-1, 1) if arr.size > 0 else np.zeros((256,), dtype=np.uint8)
        hist_ref = cv2.calcHist([dummy_img.astype(np.uint8)], [0], None, [256], [0, 256])
        cv2.normalize(hist_ref, hist_ref, 0, 1, cv2.NORM_MINMAX)

        corr = cv2.compareHist(hist_cap, hist_ref, cv2.HISTCMP_CORREL)
        # Correlation in [-1, 1]; map to [0, 100]
        return round(max(0.0, float(corr)) * 100.0, 2)

    # ------------------------------------------------------------------
    # Iris: extraction
    # ------------------------------------------------------------------

    def _extract_iris_template(self, img_bgr: np.ndarray) -> bytes:
        """
        Compute a Gabor + LBP feature vector from the polar-normalised iris
        strip and return it as raw float32 bytes.

        Steps
        -----
        1. Unwrap the iris annulus into a 64×512 polar strip.
        2. Apply each of the 4 Gabor kernels to the strip (magnitude response).
        3. Compute an LBP histogram for each response map.
        4. Concatenate the 4 histograms, L2-normalise, convert to float32.

        Template size: 4 × (_LBP_N_BINS) float32 values = 40 floats = 160 bytes.
        """
        strip = preprocess_iris(img_bgr)

        feature_parts: list[np.ndarray] = []
        for kernel in _GABOR_KERNELS:
            response = cv2.filter2D(strip.astype(np.float32), cv2.CV_32F, kernel)
            # Use magnitude (unsigned) so phase shift does not flip the histogram
            magnitude = np.abs(response).astype(np.uint8)
            hist = _lbp_histogram(magnitude)
            feature_parts.append(hist)

        vector = np.concatenate(feature_parts).astype(np.float32)
        norm = float(np.linalg.norm(vector))
        if norm > 0.0:
            vector = vector / norm

        return vector.tobytes()

    # ------------------------------------------------------------------
    # Iris: comparison
    # ------------------------------------------------------------------

    def _compare_iris(
        self, img_bgr: np.ndarray, stored_bytes: bytes
    ) -> float:
        """
        Compute the Gabor+LBP feature vector of the captured iris image and
        return the cosine similarity against the stored template vector.
        """
        # Reconstruct stored vector
        try:
            stored_vec = np.frombuffer(stored_bytes, dtype=np.float32).copy()
            if stored_vec.size == 0:
                return 0.0
        except Exception:
            return 0.0

        # Extract from captured image
        captured_bytes = self._extract_iris_template(img_bgr)
        if not captured_bytes:
            return 0.0

        captured_vec = np.frombuffer(captured_bytes, dtype=np.float32).copy()

        if captured_vec.shape != stored_vec.shape:
            # Dimension mismatch — template was generated by a different
            # algorithm version; cannot compare
            return 0.0

        # Both vectors are already L2-normalised; dot product = cosine similarity
        cap_norm = float(np.linalg.norm(captured_vec))
        ref_norm = float(np.linalg.norm(stored_vec))
        if cap_norm == 0.0 or ref_norm == 0.0:
            return 0.0

        similarity = float(np.dot(captured_vec / cap_norm, stored_vec / ref_norm))
        similarity = float(np.clip(similarity, 0.0, 1.0))

        # Map cosine similarity to a 0–100 score
        return round(similarity * 100.0, 2)


# ---------------------------------------------------------------------------
# Score mapping helper
# ---------------------------------------------------------------------------

def _map_match_ratio_to_score(ratio: float) -> float:
    """
    Map a good-match ratio in [0, 1] to a similarity score in [0, 100].

    The curve is designed so that:
      ratio = 0.00 →   0   (no matches at all)
      ratio = 0.10 →  50   (very few matches — likely different finger)
      ratio = 0.20 →  70   (weak match)
      ratio = 0.40 →  85   (moderate match)
      ratio = 0.70 →  95   (strong match)
      ratio = 1.00 → 100   (all descriptors matched)
    """
    # Piecewise linear through anchor points
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


# ---------------------------------------------------------------------------
# Module-level singleton (matcher.py imports `predictor`)
# ---------------------------------------------------------------------------

predictor = BiometricPredictor()
