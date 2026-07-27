import os
from flask import Flask, request, jsonify
from services.matcher import evaluate_verification

app = Flask(__name__)

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "AI Biometric Service",
        "engine": "OpenCV + Dataset Embeddings"
    }), 200

@app.route("/verify", methods=["POST"])
@app.route("/api/verify", methods=["POST"])
def verify():
    try:
        data = request.get_json(force=True, silent=True) or {}

        traveler_id = data.get("travelerId")
        capture_mode = data.get("captureMode", "SIMULATION")
        threshold = float(data.get("threshold", 95.0))

        # Accept inputs under multiple possible keys for robustness
        fp_captured = data.get("fingerprint") or data.get("fingerprintImage") or data.get("fingerprintData") or ""
        iris_captured = data.get("iris") or data.get("irisImage") or data.get("irisData") or ""

        ref_fp = data.get("referenceFingerprint") or ""
        ref_iris = data.get("referenceIris") or ""

        if not fp_captured or not iris_captured:
            return jsonify({
                "message": "Both fingerprint and iris captured inputs are required."
            }), 400

        result = evaluate_verification(
            traveler_id=traveler_id,
            capture_mode=capture_mode,
            fingerprint_captured=fp_captured,
            iris_captured=iris_captured,
            ref_fingerprint=ref_fp,
            ref_iris=ref_iris,
            threshold=threshold
        )

        return jsonify(result), 200

    except Exception as e:
        app.logger.error(f"Error in verification: {e}")
        return jsonify({
            "message": "An error occurred in the AI matching service",
            "error": str(e)
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("AI_SERVICE_PORT", 5001))
    print(f"Starting Python AI Biometric Service on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
