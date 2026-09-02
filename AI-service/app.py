import os
from flask import Flask, request, jsonify
from services.matcher import compare_templates, extract_template, identify_template

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "AI Biometric Service",
        "engine": "OpenCV + Template Matching"
    }), 200


def _read_json_payload() -> dict:
    return request.get_json(force=True, silent=True) or {}


def _read_image_payload(data: dict) -> str:
    return (
        data.get("image")
        or data.get("fingerprintImage")
        or data.get("irisImage")
        or data.get("fingerprintData")
        or data.get("irisData")
        or data.get("capturedImage")
        or ""
    )


def _read_template_payload(data: dict) -> str:
    return (
        data.get("storedTemplate")
        or data.get("referenceTemplate")
        or data.get("template")
        or data.get("referenceFingerprint")
        or data.get("referenceIris")
        or ""
    )


def _read_biometric_type(data: dict) -> str:
    return (data.get("biometricType") or data.get("type") or "fingerprint").lower()


@app.route("/enroll", methods=["POST"])
@app.route("/api/enroll", methods=["POST"])
def enroll():
    try:
        data = _read_json_payload()
        payload = _read_image_payload(data)
        biometric_type = _read_biometric_type(data)

        if not payload:
            return jsonify({"message": "An image payload is required for enrollment."}), 400

        result = extract_template(payload, biometric_type)
        return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error in enrollment: {e}")
        return jsonify({
            "message": "An error occurred while extracting the biometric template",
            "error": str(e)
        }), 500

from services.quality import check_biometric_quality

@app.route("/quality", methods=["POST"])
@app.route("/api/quality", methods=["POST"])
def quality():
    try:
        data = _read_json_payload()
        payload = _read_image_payload(data)
        biometric_type = _read_biometric_type(data)

        if not payload:
            return jsonify({"message": "An image payload is required for quality check."}), 400

        result = check_biometric_quality(payload, biometric_type)
        return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error in quality check: {e}")
        return jsonify({
            "message": "An error occurred while checking biometric quality",
            "error": str(e)
        }), 500

@app.route("/verify", methods=["POST"])
@app.route("/api/verify", methods=["POST"])
def verify():
    try:
        data = _read_json_payload()
        biometric_type = _read_biometric_type(data)
        threshold = float(data.get("threshold", 85.0))
        captured_image = _read_image_payload(data)
        stored_template = _read_template_payload(data)

        if not captured_image or not stored_template:
            return jsonify({
                "message": "Both a captured image and stored template are required."
            }), 400

        result = compare_templates(
            captured_data=captured_image,
            stored_template=stored_template,
            biometric_type=biometric_type,
            threshold=threshold,
        )

        return jsonify(result), 200

    except Exception as e:
        app.logger.error(f"Error in verification: {e}")
        return jsonify({
            "message": "An error occurred in the AI matching service",
            "error": str(e)
        }), 500

@app.route("/identify", methods=["POST"])
@app.route("/api/identify", methods=["POST"])
def identify():
    try:
        data = _read_json_payload()
        biometric_type = _read_biometric_type(data)
        threshold = float(data.get("threshold", 85.0))
        captured_image = _read_image_payload(data)
        candidates = data.get("candidates") or []

        if not captured_image or not candidates:
            return jsonify({
                "message": "Both a captured image and candidate list are required for 1:N identification."
            }), 400

        # ── Fingerprint validity gate ──────────────────────────────────────────
        # Before searching the database, verify the uploaded image is actually a
        # fingerprint. Reject random images, documents, photos, etc.
        if biometric_type == "fingerprint":
            from utils.image_processing import decode_base64_image
            from fingerprint.quality import check_quality as fp_check_quality

            img = decode_base64_image(captured_image)
            if img is None:
                return jsonify({
                    "matchFound": False,
                    "matchedTravelerId": None,
                    "score": 0.0,
                    "biometricType": biometric_type,
                    "reason": "Uploaded file is not a valid image."
                }), 200

            quality = fp_check_quality(img)
            if not quality.get("biometricValid", False):
                return jsonify({
                    "matchFound": False,
                    "matchedTravelerId": None,
                    "score": 0.0,
                    "biometricType": biometric_type,
                    "reason": "Uploaded image does not contain a valid fingerprint ridge structure. Please upload a real fingerprint scan."
                }), 200
        # ──────────────────────────────────────────────────────────────────────

        result = identify_template(
            captured_data=captured_image,
            candidates=candidates,
            biometric_type=biometric_type,
            threshold=threshold,
        )

        return jsonify(result), 200

    except Exception as e:
        app.logger.error(f"Error in identification: {e}")
        return jsonify({
            "message": "An error occurred in the AI identification service",
            "error": str(e)
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("AI_SERVICE_PORT", 5001))
    print(f"Starting Python AI Biometric Service on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
