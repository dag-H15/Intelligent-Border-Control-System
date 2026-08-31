"""
Iris Module Configurations — Daugman Pipeline Settings
"""

POLAR_ROWS = 64
POLAR_COLS = 512

GABOR_KERNELS_CONFIG = [
    {"ksize": 9, "sigma": 3.0, "lambd": 8.0, "theta": 0.0},
    {"ksize": 9, "sigma": 3.0, "lambd": 8.0, "theta": 1.5707963267948966},
    {"ksize": 15, "sigma": 4.5, "lambd": 12.0, "theta": 0.0},
    {"ksize": 15, "sigma": 4.5, "lambd": 12.0, "theta": 1.5707963267948966},
]

MAX_ROTATION_SHIFT = 10
DEFAULT_MATCH_THRESHOLD = 85.0
