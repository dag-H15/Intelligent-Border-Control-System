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


def _make_fingerprint_image(freq: float = 0.12, angle: float = 30.0, seed: int = 7) -> np.ndarray:
    """
    Generate a 200×200 synthetic fingerprint-like image: sinusoidal ridge
    pattern at *angle* degrees with added circular breaks to simulate minutiae,
    plus added Gaussian noise.
    """
    h, w = 200, 200
    xs, ys = np.meshgrid(np.arange(w), np.arange(h))
    rad = np.deg2rad(angle)
    ridges = np.sin(2 * np.pi * freq * (xs * np.cos(rad) + ys * np.sin(rad)))
    ridges = ((ridges + 1) / 2 * 200).astype(np.float32)
    
    # Inject circular breaks (cuts) to create genuine minutiae/ridge endings
    rng = np.random.default_rng(seed=seed)
    for _ in range(4):
        cx = rng.integers(40, 160)
        cy = rng.integers(40, 160)
        r = rng.integers(10, 15)
        # Fade ridges to white background at the circle boundaries
        dist = np.sqrt((xs - cx)**2 + (ys - cy)**2)
        cut_mask = np.clip((dist - r) / 3.0, 0.0, 1.0)
        ridges = ridges * cut_mask + (1.0 - cut_mask) * 200.0
        
    ridges_uint8 = ridges.astype(np.uint8)
    noise = rng.integers(0, 20, (h, w), dtype=np.uint8)
    gray = np.clip(ridges_uint8.astype(np.int32) + noise, 0, 255).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _make_iris_image(
    outer_r: int = 80,
    inner_r: int = 28,
    texture_freq: float = 0.6,
    texture_angle: float = 0.0,
    angular_freq: int = 6,
    seed: int = 13,
) -> np.ndarray:
    """
    Generate a 200×200 synthetic iris image: a dark pupil, a textured iris
    annulus, and a white sclera region.

    *texture_freq*, *angular_freq*, and *texture_angle* control spatial texture frequencies.
    """
    h, w = 200, 200
    cx, cy = w // 2, h // 2
    img = np.full((h, w), 220, dtype=np.uint8)   # sclera (light grey)

    ys, xs = np.ogrid[:h, :w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    # Angular component for directional texture
    angle_map = np.arctan2(ys - cy, xs - cx)

    iris_mask = (dist >= inner_r) & (dist <= outer_r)

    # Combine radial and angular sinusoids
    radial   = np.sin(dist * texture_freq)
    angular  = np.sin(angle_map * angular_freq + texture_angle)
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


def _make_bar_chart_image() -> np.ndarray:
    """Generate a high-contrast 200x200 bar chart (sharp non-biometric image)."""
    img = np.full((200, 200, 3), 255, dtype=np.uint8)
    # Axes
    cv2.line(img, (30, 170), (180, 170), (0, 0, 0), 2)
    cv2.line(img, (30, 20), (30, 170), (0, 0, 0), 2)
    # Bars
    cv2.rectangle(img, (45, 80), (70, 170), (50, 50, 200), -1)
    cv2.rectangle(img, (85, 40), (110, 170), (200, 50, 50), -1)
    cv2.rectangle(img, (125, 110), (150, 170), (50, 180, 50), -1)
    # Text labels
    cv2.putText(img, "Q1", (48, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.putText(img, "Q2", (88, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.putText(img, "Q3", (128, 185), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    return img


def _make_line_graph_image() -> np.ndarray:
    """Generate a high-contrast 200x200 grid and line plot (sharp non-biometric image)."""
    img = np.full((200, 200, 3), 250, dtype=np.uint8)
    for y in range(30, 180, 30):
        cv2.line(img, (30, y), (180, y), (200, 200, 200), 1)
    for x in range(30, 180, 30):
        cv2.line(img, (x, 30), (x, 180), (200, 200, 200), 1)
    pts = np.array([[35, 150], [65, 120], [95, 140], [125, 60], [155, 80], [175, 40]], np.int32)
    cv2.polylines(img, [pts], False, (0, 0, 180), 2)
    for pt in pts:
        cv2.circle(img, tuple(pt), 4, (180, 0, 0), -1)
    return img


def _make_text_document_image() -> np.ndarray:
    """Generate a high-contrast 200x200 printed text document mockup."""
    img = np.full((200, 200, 3), 255, dtype=np.uint8)
    cv2.putText(img, "OFFICIAL REPORT", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    for i, y in enumerate(range(55, 180, 18)):
        text = f"Paragraph line {i+1} containing text metrics and analysis details."
        cv2.putText(img, text[:26], (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (30, 30, 30), 1)
    return img


def _make_screenshot_image() -> np.ndarray:
    """Generate a high-contrast 200x200 UI mockup with window frames, buttons, and text."""
    img = np.full((200, 200, 3), 240, dtype=np.uint8)
    # Window header
    cv2.rectangle(img, (10, 10), (190, 35), (70, 70, 70), -1)
    cv2.putText(img, "Dashboard", (20, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    # Buttons
    cv2.rectangle(img, (20, 50), (90, 75), (0, 120, 215), -1)
    cv2.putText(img, "Submit", (30, 67), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
    cv2.rectangle(img, (110, 50), (180, 75), (200, 200, 200), -1)
    cv2.putText(img, "Cancel", (120, 67), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)
    # Content box
    cv2.rectangle(img, (20, 90), (180, 180), (255, 255, 255), -1)
    cv2.rectangle(img, (20, 90), (180, 180), (180, 180, 180), 1)
    return img


def _make_random_noise_image() -> np.ndarray:
    """Generate 200x200 random noise."""
    rng = np.random.default_rng(seed=42)
    return rng.integers(0, 256, (200, 200, 3), dtype=np.uint8)


def _make_blank_image() -> np.ndarray:
    """Generate 200x200 uniform white image."""
    return np.full((200, 200, 3), 255, dtype=np.uint8)


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

        # Enrolled reference templates
        fp_enroll = self.client.post("/enroll", data=json.dumps({"biometricType": "fingerprint", "image": self.fingerprint_image}), content_type="application/json")
        self.fingerprint_template = json.loads(fp_enroll.data).get("template", "")

        iris_enroll = self.client.post("/enroll", data=json.dumps({"biometricType": "iris", "image": self.iris_image}), content_type="application/json")
        self.iris_template = json.loads(iris_enroll.data).get("template", "")

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

    # --- New Biometric Fingerprint Engine Tests ---

    def test_verify_corrupted_image_returns_processing_error(self):
        """Corrupted/invalid base64 image must return PROCESSING_ERROR with HTTP 200."""
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        payload = {
            "biometricType": "fingerprint",
            "image": "data:image/png;base64,invalid_base64_data_here!!!",
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "PROCESSING_ERROR")
        self.assertFalse(data.get("verified"))

    def test_verify_low_quality_image_returns_quality_retry(self):
        """Extremely blurry image must trigger QUALITY_RETRY and list specific issues."""
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        raw_fp = _make_fingerprint_image(freq=0.12, angle=30.0)
        blurry_fp = cv2.GaussianBlur(raw_fp, (21, 21), 10.0)
        blurry_base64 = _encode_png(blurry_fp)
        
        payload = {
            "biometricType": "fingerprint",
            "image": blurry_base64,
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "QUALITY_RETRY")
        self.assertFalse(data.get("verified"))
        self.assertFalse(data.get("match"))
        self.assertIn("reason", data)
        self.assertLess(data.get("qualityScore"), 40.0)

    def test_verify_returns_standardized_and_legacy_fields(self):
        """Verification must return both modern standardized contract and legacy fields."""
        stored = self._enroll(self.fingerprint_image, "fingerprint")
        payload = {
            "biometricType": "fingerprint",
            "image": self.fingerprint_image,
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        
        # Standardized contract checks
        self.assertEqual(data.get("modality"), "fingerprint")
        self.assertEqual(data.get("status"), "VERIFIED")
        self.assertTrue(data.get("verified"))
        self.assertIn("qualityScore", data)
        self.assertIn("matchScore", data)
        self.assertIn("confidence", data)
        self.assertIn("reason", data)
        self.assertIn("processingDetails", data)
        
        # Legacy/Node compatibility checks
        self.assertEqual(data.get("biometricType"), "fingerprint")
        self.assertTrue(data.get("match"))
        self.assertIsInstance(data.get("score"), (int, float))

    def test_biometric_performance_evaluation(self):
        """
        Evaluate biometric verification performance using a batch of
        distinct synthetic fingerprints, translation/rotation transforms, and noise.
        """
        print("\n\n=== BIOMETRIC VERIFICATION PERFORMANCE EVALUATION ===")
        
        # 1. Generate 5 distinct finger designs
        fingers = []
        freqs = [0.10, 0.14, 0.18, 0.22, 0.26]
        angles = [15.0, 30.0, 45.0, 60.0, 75.0]
        for idx in range(5):
            img = _make_fingerprint_image(freq=freqs[idx], angle=angles[idx], seed=idx+10)
            fingers.append(img)
            
        # 2. Extract reference templates for all 5 fingers
        templates = []
        for img in fingers:
            tpl_res = self.client.post(
                "/enroll",
                data=json.dumps({"biometricType": "fingerprint", "image": _encode_png(img)}),
                content_type="application/json"
            )
            templates.append(json.loads(tpl_res.data)["template"])
            
        # 3. Generate genuine captures (translated by 6px, rotated by 5deg, noise_std=3)
        genuines = []
        for img in fingers:
            h, w = img.shape[:2]
            M = cv2.getRotationMatrix2D((w/2, h/2), 5.0, 1.0)
            M[0, 2] += 6.0
            M[1, 2] += -4.0
            transformed = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
            rng = np.random.default_rng(seed=42)
            noise = rng.normal(0, 3.0, img.shape).astype(np.int16)
            noisy = np.clip(transformed.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            genuines.append(noisy)

        # 4. Perform Genuine comparisons (5 tests)
        genuine_results = []
        for i in range(5):
            res = self.client.post(
                "/verify",
                data=json.dumps({
                    "biometricType": "fingerprint",
                    "image": _encode_png(genuines[i]),
                    "storedTemplate": templates[i],
                    "threshold": 73.0
                }),
                content_type="application/json"
            )
            data = json.loads(res.data)
            genuine_results.append(data.get("verified", False))

        # 5. Perform Impostor comparisons (20 tests: each ref template matched against all other genuines)
        impostor_results = []
        for r_idx in range(5):
            for g_idx in range(5):
                if r_idx == g_idx:
                    continue
                res = self.client.post(
                    "/verify",
                    data=json.dumps({
                        "biometricType": "fingerprint",
                        "image": _encode_png(genuines[g_idx]),
                        "storedTemplate": templates[r_idx],
                        "threshold": 73.0
                    }),
                    content_type="application/json"
                )
                data = json.loads(res.data)
                impostor_results.append(data.get("verified", False))

        # Calculate metrics
        num_gen = len(genuine_results)
        num_imp = len(impostor_results)
        
        true_accepts = sum(1 for r in genuine_results if r)
        false_rejects = num_gen - true_accepts
        
        false_accepts = sum(1 for r in impostor_results if r)
        true_rejects = num_imp - false_accepts
        
        tar = (true_accepts / num_gen) * 100.0
        frr = (false_rejects / num_gen) * 100.0
        far = (false_accepts / num_imp) * 100.0
        trr = (true_rejects / num_imp) * 100.0
        
        print(f"Number of Genuine Comparisons : {num_gen}")
        print(f"Number of Impostor Comparisons: {num_imp}")
        print(f"True Accept Rate (TAR)        : {tar:.1f}%")
        print(f"True Reject Rate (TRR)        : {trr:.1f}%")
        print(f"False Acceptance Rate (FAR)   : {far:.1f}%")
        print(f"False Rejection Rate (FRR)    : {frr:.1f}%")
        print("=====================================================\n")

    # --- New Biometric Iris Engine Tests ---

    def test_verify_iris_corrupted_image_returns_processing_error(self):
        """Corrupted/invalid base64 iris image must return PROCESSING_ERROR."""
        stored = self._enroll(self.iris_image, "iris")
        payload = {
            "biometricType": "iris",
            "image": "data:image/png;base64,invalid_corrupted_base64_iris_data!!!",
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "PROCESSING_ERROR")
        self.assertFalse(data.get("verified"))

    def test_verify_iris_low_quality_blurry_returns_quality_retry(self):
        """Extremely blurry iris image must trigger QUALITY_RETRY."""
        stored = self._enroll(self.iris_image, "iris")
        raw_iris = _make_iris_image(outer_r=80, inner_r=28, texture_freq=0.6, texture_angle=0.0)
        blurry_iris = cv2.GaussianBlur(raw_iris, (25, 25), 12.0)
        blurry_base64 = _encode_png(blurry_iris)

        payload = {
            "biometricType": "iris",
            "image": blurry_base64,
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "QUALITY_RETRY")
        self.assertFalse(data.get("verified"))
        self.assertFalse(data.get("match"))
        self.assertIn("reason", data)
        self.assertLess(data.get("qualityScore"), 40.0)

    def test_verify_iris_returns_standardized_and_legacy_fields(self):
        """Iris verification must return standardized contract and legacy fields."""
        stored = self._enroll(self.iris_image, "iris")
        payload = {
            "biometricType": "iris",
            "image": self.iris_image,
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        # Standardized contract checks
        self.assertEqual(data.get("modality"), "iris")
        self.assertEqual(data.get("status"), "VERIFIED")
        self.assertTrue(data.get("verified"))
        self.assertIn("qualityScore", data)
        self.assertIn("matchScore", data)
        self.assertIn("confidence", data)
        self.assertIn("reason", data)
        self.assertIn("processingDetails", data)

        # Legacy/Node compatibility checks
        self.assertEqual(data.get("biometricType"), "iris")
        self.assertTrue(data.get("match"))
        self.assertIsInstance(data.get("score"), (int, float))

    def test_verify_iris_token_simulation_mode(self):
        """Token-to-token simulation matching for iris."""
        stored_b64 = base64.b64encode(b"iris-template-FAN-100001").decode("utf-8")
        payload = {
            "biometricType": "iris",
            "irisData": "scanner-iris-FAN-100001",
            "storedTemplate": stored_b64,
            "threshold": 70.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("modality"), "iris")
        self.assertEqual(data.get("status"), "VERIFIED")
        self.assertTrue(data.get("verified"))
        self.assertGreaterEqual(data.get("matchScore"), 70.0)

    def test_verify_iris_token_and_real_mismatch(self):
        """Mixed simulation token and real biometric data must return NOT_MATCHED."""
        stored = self._enroll(self.iris_image, "iris")
        payload = {
            "biometricType": "iris",
            "irisData": "scanner-iris-FAN-100001",
            "storedTemplate": stored,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "NOT_MATCHED")
        self.assertFalse(data.get("verified"))

    def test_verify_iris_corrupted_template_returns_processing_error(self):
        """Corrupted template bytes must be safely rejected with PROCESSING_ERROR."""
        corrupted_template = base64.b64encode(b"CORRUPTED_TEMPLATE_DATA_NOT_VALID").decode("utf-8")
        payload = {
            "biometricType": "iris",
            "image": self.iris_image,
            "storedTemplate": corrupted_template,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "PROCESSING_ERROR")
        self.assertFalse(data.get("verified"))

    def test_verify_iris_legacy_template_compatibility(self):
        """Confirmed legacy 160-byte float32 Gabor+LBP template must be recognized and matched."""
        # Create a confirmed legacy template (40 float32 values) from the iris image
        from models.predictor import predictor
        img_cv = cv2.imdecode(np.frombuffer(base64.b64decode(self.iris_image.split(",")[1]), np.uint8), cv2.IMREAD_COLOR)
        legacy_bytes = predictor._extract_iris_template(img_cv)
        legacy_b64 = base64.b64encode(legacy_bytes).decode("ascii")

        payload = {
            "biometricType": "iris",
            "image": self.iris_image,
            "storedTemplate": legacy_b64,
            "threshold": 85.0
        }
        res = self.client.post("/verify", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get("status"), "VERIFIED")
        self.assertTrue(data.get("verified"))
        self.assertEqual(data.get("processingDetails", {}).get("referenceFormat"), "LEGACY")

    def test_iris_robustness_controlled_variations(self):
        """
        Robustness test: evaluate algorithm under controlled synthetic transformations:
        rotation, translation, scale, brightness shift, and noise.
        """
        print("\n\n=== IRIS ROBUSTNESS TESTING (CONTROLLED SYNTHETIC VARIATIONS) ===")
        raw_iris = _make_iris_image(outer_r=80, inner_r=28, texture_freq=0.6, texture_angle=0.0, seed=42)
        stored_tpl = self._enroll(_encode_png(raw_iris), "iris")

        # 1. Rotation (+6 degrees)
        h, w = raw_iris.shape[:2]
        M_rot = cv2.getRotationMatrix2D((w/2, h/2), 6.0, 1.0)
        rot_iris = cv2.warpAffine(raw_iris, M_rot, (w, h), borderMode=cv2.BORDER_REPLICATE)
        res_rot = self.client.post("/verify", data=json.dumps({
            "biometricType": "iris", "image": _encode_png(rot_iris), "storedTemplate": stored_tpl, "threshold": 75.0
        }), content_type="application/json")
        data_rot = json.loads(res_rot.data)
        self.assertTrue(data_rot.get("verified"), msg=f"Rotation (+6deg) score {data_rot.get('score')} < threshold")

        # 2. Translation (+5px, -4px)
        M_trans = np.float32([[1, 0, 5], [0, 1, -4]])
        trans_iris = cv2.warpAffine(raw_iris, M_trans, (w, h), borderMode=cv2.BORDER_REPLICATE)
        res_trans = self.client.post("/verify", data=json.dumps({
            "biometricType": "iris", "image": _encode_png(trans_iris), "storedTemplate": stored_tpl, "threshold": 75.0
        }), content_type="application/json")
        data_trans = json.loads(res_trans.data)
        self.assertTrue(data_trans.get("verified"), msg=f"Translation score {data_trans.get('score')} < threshold")

        # 3. Brightness shift (+20 intensity)
        bright_iris = np.clip(raw_iris.astype(np.int16) + 20, 0, 255).astype(np.uint8)
        res_bright = self.client.post("/verify", data=json.dumps({
            "biometricType": "iris", "image": _encode_png(bright_iris), "storedTemplate": stored_tpl, "threshold": 75.0
        }), content_type="application/json")
        data_bright = json.loads(res_bright.data)
        self.assertTrue(data_bright.get("verified"), msg=f"Brightness shift score {data_bright.get('score')} < threshold")

        # 4. Sensor Noise (Gaussian noise sigma = 3.0)
        rng = np.random.default_rng(seed=123)
        noise = rng.normal(0, 3.0, raw_iris.shape).astype(np.int16)
        noisy_iris = np.clip(raw_iris.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        res_noise = self.client.post("/verify", data=json.dumps({
            "biometricType": "iris", "image": _encode_png(noisy_iris), "storedTemplate": stored_tpl, "threshold": 75.0
        }), content_type="application/json")
        data_noise = json.loads(res_noise.data)
        self.assertTrue(data_noise.get("verified"), msg=f"Noise score {data_noise.get('score')} < threshold")

        print("Controlled synthetic robustness tests passed (Rotation, Translation, Brightness, Noise).")
        print("Note: Synthetic transformations are robustness tests and must not be presented as proof of real-world biometric accuracy.")
        print("=================================================================\n")

    def test_iris_biometric_performance_evaluation(self):
        """
        Evaluate biometric verification performance using independent distinct synthetic iris samples.
        Measures and reports actual observed TAR, TRR, FAR, and FRR.
        """
        print("\n\n=== IRIS BIOMETRIC PERFORMANCE EVALUATION ===")

        # 1. Generate 5 distinct iris designs representing independent eyes
        irises = []
        freqs = [0.4, 0.8, 1.3, 1.7, 2.2]
        ang_freqs = [3, 5, 7, 11, 13]
        angles = [0.0, 0.6, 1.2, 1.8, 2.4]
        for idx in range(5):
            img = _make_iris_image(
                outer_r=80,
                inner_r=28,
                texture_freq=freqs[idx],
                angular_freq=ang_freqs[idx],
                texture_angle=angles[idx],
                seed=idx + 100,
            )
            irises.append(img)

        # 2. Extract reference templates for all 5 irises
        templates = []
        for img in irises:
            tpl_res = self.client.post(
                "/enroll",
                data=json.dumps({"biometricType": "iris", "image": _encode_png(img)}),
                content_type="application/json",
            )
            templates.append(json.loads(tpl_res.data)["template"])

        # 3. Generate genuine captures (transformed: rotated by 4deg, translated by 4px, noise_std=2)
        genuines = []
        for img in irises:
            h, w = img.shape[:2]
            M = cv2.getRotationMatrix2D((w / 2, h / 2), 4.0, 1.0)
            M[0, 2] += 4.0
            M[1, 2] += -3.0
            transformed = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
            rng = np.random.default_rng(seed=idx + 200)
            noise = rng.normal(0, 2.0, img.shape).astype(np.int16)
            noisy = np.clip(transformed.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            genuines.append(noisy)

        # 4. Perform Genuine comparisons (5 tests)
        genuine_results = []
        for i in range(5):
            res = self.client.post(
                "/verify",
                data=json.dumps({
                    "biometricType": "iris",
                    "image": _encode_png(genuines[i]),
                    "storedTemplate": templates[i],
                    "threshold": 75.0,
                }),
                content_type="application/json",
            )
            data = json.loads(res.data)
            genuine_results.append(data.get("verified", False))

        # 5. Perform Impostor comparisons (20 tests: each ref template matched against all other genuines)
        impostor_results = []
        for r_idx in range(5):
            for g_idx in range(5):
                if r_idx == g_idx:
                    continue
                res = self.client.post(
                    "/verify",
                    data=json.dumps({
                        "biometricType": "iris",
                        "image": _encode_png(genuines[g_idx]),
                        "storedTemplate": templates[r_idx],
                        "threshold": 75.0,
                    }),
                    content_type="application/json",
                )
                data = json.loads(res.data)
                impostor_results.append(data.get("verified", False))

        # Calculate metrics
        num_gen = len(genuine_results)
        num_imp = len(impostor_results)

        true_accepts = sum(1 for r in genuine_results if r)
        false_rejects = num_gen - true_accepts

        false_accepts = sum(1 for r in impostor_results if r)
        true_rejects = num_imp - false_accepts

        tar = (true_accepts / num_gen) * 100.0 if num_gen > 0 else 0.0
        frr = (false_rejects / num_gen) * 100.0 if num_gen > 0 else 0.0
        far = (false_accepts / num_imp) * 100.0 if num_imp > 0 else 0.0
        trr = (true_rejects / num_imp) * 100.0 if num_imp > 0 else 0.0

        print(f"Number of Genuine Comparisons : {num_gen}")
        print(f"Number of Impostor Comparisons: {num_imp}")
        print(f"True Accepts (TP)             : {true_accepts}")
        print(f"False Rejects (FN)            : {false_rejects}")
        print(f"True Rejects (TN)             : {true_rejects}")
        print(f"False Accepts (FP)            : {false_accepts}")
        print(f"True Accept Rate (TAR)        : {tar:.1f}%")
        print(f"True Reject Rate (TRR)        : {trr:.1f}%")
        print(f"False Acceptance Rate (FAR)   : {far:.1f}%")
        print(f"False Rejection Rate (FRR)    : {frr:.1f}%")
        print("Evaluation Limitations: Evaluated on synthetic distinct iris patterns with controlled variations.")
        print("Real-world biometric accuracy must be established using large-scale operational biometric datasets.")
        print("=============================================\n")

        self.assertEqual(true_accepts + false_rejects, num_gen)
        self.assertEqual(false_accepts + true_rejects, num_imp)

    def test_fingerprint_non_biometric_images_rejected_as_invalid(self):
        """
        Verify that sharp/high-contrast non-biometric images (charts, documents, screenshots,
        noise, blank) are rejected by the fingerprint validity gate with INVALID_BIOMETRIC.
        """
        negative_fixtures = {
            "Bar Chart": _make_bar_chart_image(),
            "Line Graph": _make_line_graph_image(),
            "Text Document": _make_text_document_image(),
            "UI Screenshot": _make_screenshot_image(),
            "Random Noise": _make_random_noise_image(),
            "Blank Canvas": _make_blank_image(),
        }

        for name, img in negative_fixtures.items():
            # 1. Test /quality endpoint
            q_res = self.client.post(
                "/quality",
                data=json.dumps({"biometricType": "fingerprint", "image": _encode_png(img)}),
                content_type="application/json",
            )
            self.assertEqual(q_res.status_code, 200, f"Failed for {name}")
            q_data = json.loads(q_res.data)

            self.assertFalse(q_data["acceptable"], f"{name} should not be acceptable")
            self.assertFalse(q_data.get("biometricValid", True), f"{name} should fail biometric validity gate")
            self.assertEqual(q_data["qualityStatus"], "INVALID_BIOMETRIC", f"{name} should be INVALID_BIOMETRIC")
            self.assertLessEqual(q_data["score"], 25.0, f"{name} quality score must be <= 25.0, got {q_data['score']}")

            # 2. Test /verify endpoint
            v_res = self.client.post(
                "/verify",
                data=json.dumps({
                    "biometricType": "fingerprint",
                    "image": _encode_png(img),
                    "storedTemplate": self.fingerprint_template,
                }),
                content_type="application/json",
            )
            v_data = json.loads(v_res.data)
            self.assertEqual(v_data.get("status"), "INVALID_BIOMETRIC", f"{name} verification should return INVALID_BIOMETRIC")
            self.assertFalse(v_data.get("verified", True))

    def test_iris_non_biometric_images_rejected_as_invalid(self):
        """
        Verify that sharp/high-contrast non-biometric images (charts, documents, screenshots,
        noise, blank) are rejected by the iris validity gate with INVALID_BIOMETRIC.
        """
        negative_fixtures = {
            "Bar Chart": _make_bar_chart_image(),
            "Line Graph": _make_line_graph_image(),
            "Text Document": _make_text_document_image(),
            "UI Screenshot": _make_screenshot_image(),
            "Random Noise": _make_random_noise_image(),
            "Blank Canvas": _make_blank_image(),
        }

        for name, img in negative_fixtures.items():
            # 1. Test /quality endpoint
            q_res = self.client.post(
                "/quality",
                data=json.dumps({"biometricType": "iris", "image": _encode_png(img)}),
                content_type="application/json",
            )
            self.assertEqual(q_res.status_code, 200, f"Failed for {name}")
            q_data = json.loads(q_res.data)

            self.assertFalse(q_data["acceptable"], f"{name} should not be acceptable")
            self.assertFalse(q_data.get("biometricValid", True), f"{name} should fail biometric validity gate")
            self.assertEqual(q_data["qualityStatus"], "INVALID_BIOMETRIC", f"{name} should be INVALID_BIOMETRIC")
            self.assertLessEqual(q_data["score"], 25.0, f"{name} quality score must be <= 25.0, got {q_data['score']}")

            # 2. Test /verify endpoint
            v_res = self.client.post(
                "/verify",
                data=json.dumps({
                    "biometricType": "iris",
                    "image": _encode_png(img),
                    "storedTemplate": self.iris_template,
                }),
                content_type="application/json",
            )
            v_data = json.loads(v_res.data)
            self.assertEqual(v_data.get("status"), "INVALID_BIOMETRIC", f"{name} verification should return INVALID_BIOMETRIC")
            self.assertFalse(v_data.get("verified", True))

    def test_degraded_fingerprint_returns_quality_retry_not_invalid(self):
        """
        Verify that a real but degraded (blurry/low contrast) fingerprint is recognized as
        biometricValid=True with status POOR and returns QUALITY_RETRY, not INVALID_BIOMETRIC.
        """
        good_fp = _make_fingerprint_image(freq=0.12, angle=30.0)
        # Apply heavy blur to degrade quality
        blurry_fp = cv2.GaussianBlur(good_fp, (25, 25), 10.0)

        q_res = self.client.post(
            "/quality",
            data=json.dumps({"biometricType": "fingerprint", "image": _encode_png(blurry_fp)}),
            content_type="application/json",
        )
        q_data = json.loads(q_res.data)

        self.assertFalse(q_data["acceptable"])
        self.assertEqual(q_data["qualityStatus"], "POOR")
        self.assertLess(q_data["score"], 40.0)

        # Verification must return QUALITY_RETRY
        v_res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "fingerprint",
                "image": _encode_png(blurry_fp),
                "storedTemplate": self.fingerprint_template,
            }),
            content_type="application/json",
        )
        v_data = json.loads(v_res.data)
        self.assertEqual(v_data.get("status"), "QUALITY_RETRY")
        self.assertFalse(v_data.get("verified", True))

    def test_degraded_iris_returns_quality_retry_not_invalid(self):
        """
        Verify that a real but degraded (blurry) iris is recognized as
        biometricValid=True with status POOR and returns QUALITY_RETRY, not INVALID_BIOMETRIC.
        """
        good_iris = _make_iris_image()
        # Apply heavy blur to degrade quality
        blurry_iris = cv2.GaussianBlur(good_iris, (25, 25), 8.0)

        q_res = self.client.post(
            "/quality",
            data=json.dumps({"biometricType": "iris", "image": _encode_png(blurry_iris)}),
            content_type="application/json",
        )
        q_data = json.loads(q_res.data)

        self.assertFalse(q_data["acceptable"])
        self.assertEqual(q_data["qualityStatus"], "POOR")
        self.assertLess(q_data["score"], 40.0)

        # Verification must return QUALITY_RETRY
        v_res = self.client.post(
            "/verify",
            data=json.dumps({
                "biometricType": "iris",
                "image": _encode_png(blurry_iris),
                "storedTemplate": self.iris_template,
            }),
            content_type="application/json",
        )
        v_data = json.loads(v_res.data)
        self.assertEqual(v_data.get("status"), "QUALITY_RETRY")
        self.assertFalse(v_data.get("verified", True))

    def test_biometric_quality_distribution_reporting(self):
        """
        Evaluate and report quality score distributions across Good Biometrics,
        Degraded Biometrics, and Non-Biometric Images.
        """
        print("\n\n=== BIOMETRIC QUALITY SCORE DISTRIBUTION EVALUATION ===")

        # 1. Good Biometrics (Fingerprints + Irises)
        good_samples = [
            ("Good FP 1", "fingerprint", _make_fingerprint_image(freq=0.12, angle=30.0)),
            ("Good FP 2", "fingerprint", _make_fingerprint_image(freq=0.15, angle=60.0)),
            ("Good FP 3", "fingerprint", _make_fingerprint_image(freq=0.10, angle=0.0)),
            ("Good Iris 1", "iris", _make_iris_image(texture_freq=0.5, angular_freq=5)),
            ("Good Iris 2", "iris", _make_iris_image(texture_freq=0.8, angular_freq=7)),
            ("Good Iris 3", "iris", _make_iris_image(texture_freq=1.2, angular_freq=11)),
        ]

        # 2. Degraded Biometrics
        degraded_samples = [
            ("Blurry FP", "fingerprint", cv2.GaussianBlur(_make_fingerprint_image(freq=0.12), (21, 21), 6.0)),
            ("Low Contrast FP", "fingerprint", np.clip(_make_fingerprint_image(freq=0.12).astype(np.float32) * 0.2 + 100, 0, 255).astype(np.uint8)),
            ("Damaged FP", "fingerprint", cv2.GaussianBlur(_make_fingerprint_image(freq=0.12), (15, 15), 4.0)),
            ("Blurry Iris", "iris", cv2.GaussianBlur(_make_iris_image(), (21, 21), 6.0)),
            ("Low Contrast Iris", "iris", np.clip(_make_iris_image().astype(np.float32) * 0.2 + 110, 0, 255).astype(np.uint8)),
            ("Dark Iris", "iris", np.clip(_make_iris_image().astype(np.float32) * 0.15 + 10, 0, 255).astype(np.uint8)),
        ]

        # 3. Non-Biometric Images
        non_biometric_samples = [
            ("Bar Chart", "fingerprint", _make_bar_chart_image()),
            ("Line Graph", "fingerprint", _make_line_graph_image()),
            ("Text Document", "fingerprint", _make_text_document_image()),
            ("UI Screenshot", "iris", _make_screenshot_image()),
            ("Random Noise", "iris", _make_random_noise_image()),
            ("Blank Canvas", "iris", _make_blank_image()),
        ]

        def evaluate_group(group_name: str, samples: list):
            scores = []
            accepted = 0
            invalid_bio = 0
            poor_retry = 0

            for label, modality, img in samples:
                res = self.client.post(
                    "/quality",
                    data=json.dumps({"biometricType": modality, "image": _encode_png(img)}),
                    content_type="application/json",
                )
                data = json.loads(res.data)
                score = data["score"]
                scores.append(score)
                if data["acceptable"]:
                    accepted += 1
                if data.get("qualityStatus") == "INVALID_BIOMETRIC":
                    invalid_bio += 1
                elif data.get("qualityStatus") == "POOR":
                    poor_retry += 1

            scores = np.array(scores)
            print(f"\n--- {group_name} (N={len(samples)}) ---")
            print(f"  Score Min / Max / Mean / Median: {np.min(scores):.1f} / {np.max(scores):.1f} / {np.mean(scores):.1f} / {np.median(scores):.1f}")
            print(f"  Standard Deviation              : {np.std(scores):.2f}")
            print(f"  Accepted (Quality >= 40%)       : {accepted}/{len(samples)} ({(accepted/len(samples))*100:.1f}%)")
            print(f"  Invalid Biometric Filtered      : {invalid_bio}/{len(samples)} ({(invalid_bio/len(samples))*100:.1f}%)")
            print(f"  Quality Retry (POOR) Flagged    : {poor_retry}/{len(samples)} ({(poor_retry/len(samples))*100:.1f}%)")
            return scores, accepted, invalid_bio, poor_retry

        good_scores, good_acc, _, _ = evaluate_group("GOOD BIOMETRICS", good_samples)
        deg_scores, deg_acc, _, deg_retry = evaluate_group("DEGRADED BIOMETRICS", degraded_samples)
        non_scores, non_acc, non_inv, _ = evaluate_group("NON-BIOMETRIC IMAGES", non_biometric_samples)

        print("\n=======================================================\n")

        # Assertions on distribution boundaries
        self.assertGreaterEqual(np.mean(good_scores), 75.0, "Good biometrics mean score should be >= 75.0")
        self.assertEqual(good_acc, len(good_samples), "All good biometrics should be acceptable")

        self.assertEqual(deg_acc, 0, "No degraded biometric should be acceptable")
        self.assertGreater(deg_retry, 0, "Degraded biometrics should be classified as POOR / quality retry")

        self.assertEqual(non_acc, 0, "No non-biometric image should be acceptable")
        self.assertEqual(non_inv, len(non_biometric_samples), "All non-biometrics should be filtered as INVALID_BIOMETRIC")
        self.assertLessEqual(np.max(non_scores), 25.0, "Max non-biometric score must be <= 25.0")


if __name__ == "__main__":
    unittest.main()



