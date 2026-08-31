import hashlib

def generate_embedding_from_string(text: str) -> list[float]:
    """
    Generates a normalized 16-dimensional embedding vector from an input text string
    using SHA-256 hash digests.
    """
    if not text:
        text = "default_seed"
    
    hash_bytes = hashlib.sha256(text.encode('utf-8')).digest()
    # Expand to 16 float values between 0.0 and 1.0
    vector = [(b / 255.0) for b in hash_bytes[:16]]
    norm = sum(v * v for v in vector) ** 0.5
    if norm > 0:
        vector = [v / norm for v in vector]
    return vector

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """
    Calculates cosine similarity between two vectors, mapped to a percentage score (0-100).
    """
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = sum(a * a for a in v1) ** 0.5
    norm2 = sum(b * b for b in v2) ** 0.5
    if norm1 == 0 or norm2 == 0:
        return 0.0
    similarity = dot / (norm1 * norm2)
    # Cosine sim for positive normalized vectors ranges from ~0 to 1
    return max(0.0, min(1.0, similarity))

def compute_dataset_matching_score(captured_token: str, ref_token: str) -> float:
    """
    Calculates deterministic matching score for simulation tokens.
    Same subject ID / matching token -> 98.5 (Verified Match).
    Different subject ID / distinct token -> 30.0 (Distinct Non-Match).
    """
    if not captured_token or not ref_token:
        return 0.0

    t1 = captured_token.strip().lower()
    t2 = ref_token.strip().lower()

    if t1 == t2:
        return 98.5

    v1 = generate_embedding_from_string(t1)
    v2 = generate_embedding_from_string(t2)
    sim = cosine_similarity(v1, v2)
    
    # Non-matching token score in reject range (25.0 - 45.0)
    score = 25.0 + (sim * 20.0)
    return round(score, 2)
