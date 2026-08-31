"""
Iris Matcher — Mask-Aware Rotation-Invariant Fractional Hamming Distance
"""

import numpy as np
from iris.config import MAX_ROTATION_SHIFT
from iris.feature_extractor import IrisFeatureExtractor


class IrisMatcher:

    def match(self, captured_bytes: bytes, stored_bytes: bytes) -> float:
        """
        Compute minimum Fractional Hamming Distance across horizontal shifts (-MAX_SHIFT to +MAX_SHIFT).
        Returns similarity score in [0.0, 100.0].
        """
        t1, m1 = IrisFeatureExtractor.unpack_template(captured_bytes)
        t2, m2 = IrisFeatureExtractor.unpack_template(stored_bytes)

        if t1 is not None and m1 is not None and t2 is not None and m2 is not None:
            min_hd = self.compute_fractional_hamming_distance(t1, m1, t2, m2)
            score = self.map_hamming_distance_to_score(min_hd)
            return round(score, 2)

        return self._fallback_cosine_similarity(captured_bytes, stored_bytes)

    def compute_fractional_hamming_distance(
        self,
        template1: np.ndarray,
        mask1: np.ndarray,
        template2: np.ndarray,
        mask2: np.ndarray,
        max_shift: int = MAX_ROTATION_SHIFT,
    ) -> float:
        """
        Rotation-invariant Fractional Hamming Distance calculation using bitwise XOR over valid mask bits.
        """
        if template1.shape != template2.shape or mask1.shape != mask2.shape:
            return 0.50

        min_hd = 1.0

        for shift in range(-max_shift, max_shift + 1):
            shifted_t1 = np.roll(template1, shift, axis=1)
            shifted_m1 = np.roll(mask1, shift, axis=1)

            combined_mask = np.logical_and(shifted_m1 == 1, mask2 == 1)
            total_valid_bits = np.sum(combined_mask)

            if total_valid_bits == 0:
                continue

            xor_result = np.bitwise_xor(shifted_t1, template2)
            valid_xor = np.logical_and(xor_result, combined_mask)

            hd = np.sum(valid_xor) / float(total_valid_bits)
            if hd < min_hd:
                min_hd = hd

        return float(min_hd)

    @staticmethod
    def map_hamming_distance_to_score(hd: float) -> float:
        """
        Standard Daugman decision curve anchors:
          HD = 0.00 -> 100.0 (identical match)
          HD = 0.15 ->  95.0 (strong match)
          HD = 0.25 ->  85.0 (verification threshold)
          HD = 0.32 ->  65.0 (weak overlap)
          HD >= 0.38 ->   0.0 (different subject rejection)
        """
        anchors = [
            (0.00, 100.0),
            (0.15, 95.0),
            (0.25, 85.0),
            (0.32, 65.0),
            (0.38, 0.0),
        ]
        if hd <= 0.0:
            return 100.0
        if hd >= 0.38:
            return 0.0

        for i in range(len(anchors) - 1):
            x0, y0 = anchors[i]
            x1, y1 = anchors[i + 1]
            if x0 <= hd <= x1:
                t = (hd - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return 0.0

    @staticmethod
    def _fallback_cosine_similarity(captured_bytes: bytes, stored_bytes: bytes) -> float:
        try:
            stored_vec = np.frombuffer(stored_bytes, dtype=np.float32).copy()
            captured_vec = np.frombuffer(captured_bytes, dtype=np.float32).copy()
            if stored_vec.size == 0 or captured_vec.size == 0 or captured_vec.shape != stored_vec.shape:
                return 0.0
            cap_norm = float(np.linalg.norm(captured_vec))
            ref_norm = float(np.linalg.norm(stored_vec))
            if cap_norm == 0.0 or ref_norm == 0.0:
                return 0.0
            sim = float(np.dot(captured_vec / cap_norm, stored_vec / ref_norm))
            return round(max(0.0, min(1.0, sim)) * 100.0, 2)
        except Exception:
            return 0.0
