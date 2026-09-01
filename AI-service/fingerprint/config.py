"""
config.py
---------
Configuration parameters and thresholds for the fingerprint biometric engine.
"""

# Image constraints
MIN_IMAGE_DIMENSION = 50
TARGET_SIZE = 300

# Quality classification thresholds
MIN_QUALITY_THRESHOLD = 40.0
QUALITY_GOOD_THRESHOLD = 75.0
QUALITY_ACCEPTABLE_THRESHOLD = 40.0

# Biometric Validity Gate Parameters (Configurable engineering defaults)
FP_MIN_VALIDITY_SCORE = 45.0         # Minimum composite score to pass biometric validity
FP_MIN_COHERENCE_DEFAULT = 0.22      # Minimum orientation coherence across active foreground
FP_RIDGE_FREQ_MIN_DEFAULT = 0.025    # Lower spatial frequency bound (period <= 40px)
FP_RIDGE_FREQ_MAX_DEFAULT = 0.30     # Upper spatial frequency bound (period >= 3.3px)
FP_MIN_FOREGROUND_RATIO = 0.08       # Minimum active fingerprint contact area ratio
FP_MIN_CLARITY_RATIO = 0.15          # Minimum ridge-to-valley profile contrast
FP_MAX_SUSPICIOUS_MINUTIAE = 220     # Extreme minutiae count indicating text/grid clutter

# Matching thresholds
DEFAULT_MATCH_THRESHOLD = 85.0

# ORB configuration (for spatial alignment and fallback)
ORB_N_FEATURES = 512
ORB_SCALE_FACTOR = 1.2
ORB_N_LEVELS = 8
ORB_EDGE_THRESHOLD = 15
ORB_PATCH_SIZE = 31
ORB_FAST_THRESHOLD = 10

# Spatial alignment parameters
MIN_KEYPOINTS = 4
RATIO_THRESHOLD = 0.75

# Minutiae parameters
MINUTIAE_MATCH_DISTANCE_THRESHOLD = 12.0   # Pixels within which minutiae align
MINUTIAE_PRUNING_CLOSE_THRESHOLD = 10.0      # Merge minutiae closer than this
MINUTIAE_PRUNING_BORDER_MARGIN = 15.0       # Ignore minutiae near boundaries
MINUTIAE_PRUNING_SHORT_RIDGE_THRESHOLD = 10  # Ignore ridge lines shorter than this
MINUTIAE_PRUNING_BROKEN_RIDGE_THRESHOLD = 12.0 # Merge opposing ends within this distance
