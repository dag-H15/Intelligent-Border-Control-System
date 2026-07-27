from utils.image_processing import decode_base64_image, compute_opencv_similarity
from datasets.embeddings import compute_dataset_matching_score

class BiometricPredictor:
    """
    Biometric predictor model that combines OpenCV computer vision feature analysis
    and dataset embedding similarity matching.
    """
    def __init__(self):
        pass

    def predict_match_score(self, captured_data: str, reference_template: str, biometric_type: str, capture_mode: str) -> float:
        """
        Predicts biometric similarity score (0 to 100) comparing captured data with reference template.
        """
        if not captured_data or not reference_template:
            return 50.0

        # Try image decoding first (if valid base64 image data)
        captured_img = decode_base64_image(captured_data)
        ref_img = decode_base64_image(reference_template)

        if captured_img is not None and ref_img is not None:
            # OpenCV image feature matching
            return compute_opencv_similarity(captured_img, ref_img)

        # If scanner mode or string/token dataset fallback
        return compute_dataset_matching_score(captured_data, reference_template)

predictor = BiometricPredictor()
