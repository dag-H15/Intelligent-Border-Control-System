"""
image_processing.py — Low-level image helpers shared across the biometric pipeline.
"""

from __future__ import annotations

import base64
from io import BytesIO

import cv2
import numpy as np
from PIL import Image


def decode_base64_image(data_str: str | np.ndarray) -> np.ndarray | None:
    """
    Decode a base64-encoded image string into an OpenCV BGR uint8 ndarray.
    If an ndarray is passed directly, returns it as-is.
    """
    if isinstance(data_str, np.ndarray):
        return data_str
    if not data_str or not isinstance(data_str, str):
        return None
    try:
        if "," in data_str:
            data_str = data_str.split(",", 1)[1]
        raw = base64.b64decode(data_str)
        pil = Image.open(BytesIO(raw)).convert("RGB")
        rgb = np.array(pil, dtype=np.uint8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        return None
