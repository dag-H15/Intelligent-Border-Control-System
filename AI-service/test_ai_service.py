"""
test_ai_service.py
------------------
Integration tests for the Flask AI biometric service.

Image fixtures
  * fingerprint_image  — synthetic ridge pattern (sinusoidal stripes with
                         added noise) that gives ORB reliable keypoints.
  * iris_image         — concentric ring pattern that gives Hough circle
                         detection a clean outer boundary and Gabor filters
                         meaningful texture.
  * different_fingerprint_image / different_iris_image — same modality but
    with a different frequency / orientation so they look genuinely distinct.

All fixture images are generated programmatically (no external files needed).
"""

import base64
import json
import unittest
from io import BytesIO

import cv2
import numpy as np
from app import app


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _encode_png(img_bgr: np.ndarray) -> str:
    """Encode an OpenCV BGR image as a data-URI PNG base64 string."""
    _, buf = cv2.imencode(".png", img_bgr)
    return "data:image/png;base64," + base64.b64encode(buf).decode("utf-8")


def _make_fingerprint_image(freq: float = 0.12, angle: float = 30.0) -> np.ndarray:
    """
    Generate a 200×200 synthetic fingerprint-like image: sinusoidal ridge
    pattern at *angle* degrees with added Gaussian noise.
    """
    h, w = 200, 200
    xs, ys = np.meshgrid(np.arange(w), np.arange(h))
    rad = np.deg2rad(angle)
    ridges = np.sin(2 * np.pi * freq * (xs * np.cos(rad) + ys * np.sin(rad)))
    ridges = ((ridges + 1) / 2 * 200).astype(np.uint8)
    rng = np.random.default_rng(seed=7)
    noise = rng.integers(0, 30, (h, w), dtype=np.uint8)
    gray = np.clip(ridges.astype(np.int32) + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _make_iris_image(
    outer_r: int = 80,
    inner_r: int = 28,
    texture_freq: float = 0.6,
    texture_angle: float = 0.0,
    seed: int = 13,
) -> np.ndarray:
    """
    Generate a 200×200 synthetic iris image: a dark pupil, a textured iris
    annulus, and a white sclera region.

    *texture_freq* and *texture_angle* control the dominant spatial frequency
    and orientation of the annulus texture, making two calls with different
    values produce visually and metrically distinct irises.
    """
    h, w = 200, 200
    cx, cy = w // 2, h // 2
    img = np.full((h, w), 220, dtype=np.uint8)   # sclera (light grey)

    ys, xs = np.ogrid[:h, :w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    # Angular component for directional texture
    angle_map = np.arctan2(ys - cy, xs - cx)

    iris_mask = (dist >= inner_r) & (dist <= outer_r)

    # Combine radial and angular sinusoids so texture_freq and texture_angle
    # both affect the histogram bins captured by the Gabor + LBP pipeline.
    radial   = np.sin(dist * texture_freq)
    angular  = np.sin(angle_map * 6 + texture_angle)
    combined = (radial * 0.6 + angular * 0.4)
    texture  = (combined * 50 + 110).astype(np.float32)
    texture  = np.clip(texture, 0, 255).astype(np.uint8)
    img[iris_mask] = texture[iris_mask]

    # Pupil
    img[dist < inner_r] = 20

    rng = np.random.default_rng(seed=seed)
    noise = rng.integers(0, 15, (h, w), dtype=np.uint8)
    img = np.clip(img.astype(np.int32) + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestAIService(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()

        # Fingerprint fixtures
        self.fingerprint_image           = _encode_png(_make_fingerprint_image(freq=0.12, angle=30.0))
        self.different_fingerprint_image = _encode_png(_make_fingerprint_image(freq=0.25, angle=75.0))

        # Iris fixtures — different texture frequencies AND orientations
        self.iris_image           = _encode_png(_make_iris_image(
            outer_r=80, inner_r=28, texture_freq=0.6, texture_angle=0.0, seed=13))
        self.different_iris_image = _encode_png(_make_iris_image(
            outer_r=80, inner_r=28, texture_freq=1.8, texture_angle=2.5, seed=91))

    # --- Health ----------------------------------------------------------

    def test_health(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "ok")

    # --- Enrollment responses -------------------------------------------

    def test_enroll_fingerprint_returns_template(self):
        payload = {"biometricType": "fingerprint", "image": self.fingerprint_image}
        res = self.client.post("/enroll", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("template", data)
        self.assertEqual(data.get("biometricType"), "fingerprint")
        self.assertEqual(data.get("encoding"), "base64")
        # Template must be non-empty base64
        raw = base64.b64decode(data["template"])
        self.assertGreater(len(raw), 0)

    def test_enroll_iris_returns_template(self):
        payload = {"biometricType": "iris", "image": self.iris_image}
        res = self.client.post("/enroll", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("template", data)
        self.assertEqual(data.get("biometricType"), "iris")
        raw = base64.b64decode(data["template"])
        self.assertGreater(len(raw), 0)
        # Iris template is a float32 array — length must be divisible by 4
        self.assertEqual(len(raw) % 4, 0)

    def test_enroll_missing_image_returns_400(self):
        payload = {"biometricType": "fingerprint"}
        res = self.client.post("/enroll", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 400)

    # --- Fingerprint verification ---------------------------------------

    def _enroll(self, image: str, biometric_type: str) -> str:
        """Helper: enroll an image and return the stored template string."""
        res = self.client.post(
            "/enroll",
            data=json.dumps({"biometricType": biometric_type, "image": image}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        return json.loads(res.data)["template"]

    def test_fingerprint_self_verify_score_above_threshold(self):
        """
        Enrolling an image and verifying with the identical image must produce
        a score >= 85 (the system's minimum meaningful threshold).
        The same image processed twice through a deterministic pipeline must
        match itself.
        """
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "fingerprint",
                "image": self.fingerprint_image,
                "storedTemplate": stored,
                "threshold": 85.0,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("score", data)
        self.assertIn("match", data)
        self.assertTrue(data["match"], msg=f"Self-verify score was {data['score']}, expected >= 85")
        self.assertGreaterEqual(data["score"], 85.0)

    def test_fingerprint_mismatch_does_not_match_at_high_threshold(self):
        """
        A genuinely different fingerprint image must not match at threshold 95.
        """
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "fingerprint",
                "image": self.different_fingerprint_image,
                "storedTemplate": stored,
                "threshold": 95.0,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data["match"], msg=f"Mismatch score was {data['score']}, expected < 95")

    # --- Iris verification ----------------------------------------------

    def test_iris_self_verify_score_above_threshold(self):
        """Same iris image enrolled then verified must score >= 85."""
        stored = self._enroll(self.iris_image, "iris")
        res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "iris",
                "image": self.iris_image,
                "storedTemplate": stored,
                "threshold": 85.0,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data["match"], msg=f"Iris self-verify score was {data['score']}, expected >= 85")
        self.assertGreaterEqual(data["score"], 85.0)

    def test_iris_mismatch_does_not_match_at_high_threshold(self):
        """A different iris image must not match at threshold 95."""
        stored = self._enroll(self.iris_image, "iris")
        res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "iris",
                "image": self.different_iris_image,
                "storedTemplate": stored,
                "threshold": 95.0,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data["match"], msg=f"Iris mismatch score was {data['score']}, expected < 95")

    # --- Verify: missing fields -----------------------------------------

    def test_verify_missing_template_returns_400(self):
        payload = {
            "biometricType": "fingerprint",
            "image": self.fingerprint_image,
            # storedTemplate intentionally omitted
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 400)

    def test_verify_missing_image_returns_400(self):
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        payload = {
            "biometricType": "fingerprint",
            # image intentionally omitted
            "storedTemplate": stored,
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 400)

    # --- Scanner stub data (non-image payload) --------------------------

    def test_verify_scanner_stub_returns_valid_response(self):
        """
        When a scanner stub string (not an image) is sent as the captured
        payload, the service must return a valid JSON response with score and
        match fields rather than crashing.  The score may be 0 — that is
        correct behaviour since we cannot extract features from a string.
        """
        # Stored template is also a stub string encoded as base64
        stored_b64 = base64.b64encode(b"scanner-fingerprint-FAN-100001").decode("utf-8")
        payload = {
            "biometricType": "fingerprint",
            "fingerprintData": "scanner-fingerprint-FAN-100001",
            "storedTemplate": stored_b64,
            "threshold": 70.0,
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("score", data)
        self.assertIn("match", data)
        self.assertIsInstance(data["score"], (int, float))


if __name__ == "__main__":
    unittest.main()
