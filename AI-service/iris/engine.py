"""
Iris Engine Orchestrator — Full Daugman Recognition Pipeline
"""

import base64
import numpy as np
from iris.feature_extractor import IrisFeatureExtractor
from iris.matcher import IrisMatcher
from iris.normalization import normalize_iris
from iris.preprocessing import preprocess_iris_image
from iris.segmentation import segment_iris
from utils.image_processing import decode_base64_image


class IrisEngine:

    def __init__(self) -> None:
        self.extractor = IrisFeatureExtractor()
        self.matcher = IrisMatcher()

    def extract_template(self, payload: str) -> str:
        img = decode_base64_image(payload)
        if img is None:
            return base64.b64encode(b"").decode("ascii")

        gray, enhanced = preprocess_iris_image(img)
        iris_circle, pupil_circle, noise_mask = segment_iris(enhanced)
        norm_iris, norm_mask = normalize_iris(gray, noise_mask, iris_circle, pupil_circle)

        binary_template, binary_mask = self.extractor.extract_iris_code(norm_iris, norm_mask)
        template_bytes = self.extractor.pack_template(binary_template, binary_mask)
        return base64.b64encode(template_bytes).decode("ascii")

    def compare_template(self, captured_data: str, reference_template: str) -> float:
        if not captured_data or not reference_template:
            return 0.0

        try:
            stored_bytes = base64.b64decode(reference_template)
        except Exception:
            return 0.0

        if len(stored_bytes) == 0:
            return 0.0

        captured_b64 = self.extract_template(captured_data)
        captured_bytes = base64.b64decode(captured_b64) if captured_b64 else b""

        return self.matcher.match(captured_bytes, stored_bytes)
