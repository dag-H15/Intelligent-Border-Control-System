"""
Iris Feature Extractor — Gabor Phase Quantization (IrisCode)
"""

import struct
import cv2
import numpy as np
from typing import Tuple, List
from iris.config import GABOR_KERNELS_CONFIG, POLAR_ROWS, POLAR_COLS


def _build_gabor_kernel_pairs() -> List[Tuple[np.ndarray, np.ndarray]]:
    """
    Build real and imaginary Gabor kernel pairs for phase quantization.
    """
    pairs = []
    for cfg in GABOR_KERNELS_CONFIG:
        ksize = cfg["ksize"]
        sigma = cfg["sigma"]
        lambd = cfg["lambd"]
        theta = cfg["theta"]

        gabor_real = cv2.getGaborKernel(
            (ksize, ksize), sigma, theta, lambd, 0.5, 0.0, ktype=cv2.CV_32F
        )
        gabor_imag = cv2.getGaborKernel(
            (ksize, ksize), sigma, theta, lambd, 0.5, np.pi / 2.0, ktype=cv2.CV_32F
        )
        pairs.append((gabor_real, gabor_imag))
    return pairs


_GABOR_PAIRS = _build_gabor_kernel_pairs()


class IrisFeatureExtractor:

    def extract_iris_code(
        self, normalized_iris: np.ndarray, normalized_mask: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Extract binary IrisCode and validity bitmask using multi-scale Gabor phase quantization.
        Returns: (binary_template, binary_mask) where each bit layer is (rows x cols) uint8 (0 or 1).
        """
        img_float = normalized_iris.astype(np.float32)

        template_bits = []
        mask_bits = []

        for gabor_real, gabor_imag in _GABOR_PAIRS:
            f_real = cv2.filter2D(img_float, cv2.CV_32F, gabor_real)
            f_imag = cv2.filter2D(img_float, cv2.CV_32F, gabor_imag)

            real_code = (f_real > 0).astype(np.uint8)
            imag_code = (f_imag > 0).astype(np.uint8)

            template_bits.append(real_code)
            template_bits.append(imag_code)

            mask_bits.append(normalized_mask.astype(np.uint8))
            mask_bits.append(normalized_mask.astype(np.uint8))

        binary_template = np.vstack(template_bits).astype(np.uint8)
        binary_mask = np.vstack(mask_bits).astype(np.uint8)

        return binary_template, binary_mask

    def pack_template(self, binary_template: np.ndarray, binary_mask: np.ndarray) -> bytes:
        """
        Pack binary IrisCode template and mask into an encodable byte payload.
        Header: uint16 rows, uint16 cols.
        """
        rows, cols = binary_template.shape
        header = struct.pack("<HH", rows, cols)
        template_bytes = binary_template.tobytes()
        mask_bytes = binary_mask.tobytes()
        return header + template_bytes + mask_bytes

    @staticmethod
    def unpack_template(blob: bytes) -> Tuple[np.ndarray | None, np.ndarray | None]:
        """
        Unpack binary IrisCode template and mask from byte payload.
        """
        if len(blob) < 4:
            return None, None
        try:
            rows, cols = struct.unpack_from("<HH", blob, 0)
            expected_plane = rows * cols
            expected_total = 4 + 2 * expected_plane
            if len(blob) < expected_total:
                return None, None

            template_arr = np.frombuffer(
                blob, dtype=np.uint8, count=expected_plane, offset=4
            ).reshape(rows, cols).copy()

            mask_arr = np.frombuffer(
                blob, dtype=np.uint8, count=expected_plane, offset=4 + expected_plane
            ).reshape(rows, cols).copy()

            return template_arr, mask_arr
        except Exception:
            return None, None
