/**
 * Detects image format from buffer using magic bytes
 */
export function detectImageFormat(buffer: Buffer): 'png' | 'jpeg' | 'bmp' | 'tiff' | null {
  if (buffer.length < 4) return null;
  
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  
  // BMP: 42 4D (BM)
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'bmp';
  }
  
  // TIFF: 49 49 2A 00 (II*) or 4D 4D 00 2A (MM*)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return 'tiff';
  }
  
  return null;
}

/**
 * Converts a base64 string (with or without data URI prefix) into a Buffer
 */
export function base64ToBuffer(base64Str: string): Buffer | null {
  try {
    let cleanStr = base64Str;
    if (base64Str.includes(',')) {
      cleanStr = base64Str.split(',')[1];
    }
    return Buffer.from(cleanStr, 'base64');
  } catch {
    return null;
  }
}

/**
 * Validates fingerprint image format
 */
export function isValidFingerprintFormat(input: Buffer | string): boolean {
  const buffer = typeof input === 'string' ? base64ToBuffer(input) : input;
  if (!buffer) return false;
  const format = detectImageFormat(buffer);
  return format !== null && ['png', 'jpeg', 'bmp', 'tiff'].includes(format);
}

/**
 * Validates iris image format
 */
export function isValidIrisFormat(input: Buffer | string): boolean {
  const buffer = typeof input === 'string' ? base64ToBuffer(input) : input;
  if (!buffer) return false;
  const format = detectImageFormat(buffer);
  return format !== null && ['png', 'jpeg', 'bmp'].includes(format);
}

/**
 * Checks if the fingerprint template is a mock / seeded string
 */
export function isMockOrSeededFingerprint(input: Buffer | string): boolean {
  try {
    const str = typeof input === 'string' ? input : input.toString('base64');
    let cleanStr = str;
    if (str.includes(',')) {
      cleanStr = str.split(',')[1];
    }
    const decoded = Buffer.from(cleanStr, 'base64').toString('utf8');
    return (
      decoded.startsWith('scanner-fingerprint-') ||
      decoded.startsWith('fingerprint-template-') ||
      decoded.startsWith('mock_captured_fingerprint_')
    );
  } catch {
    return false;
  }
}

/**
 * Checks if the iris template is a mock / seeded string
 */
export function isMockOrSeededIris(input: Buffer | string): boolean {
  try {
    const str = typeof input === 'string' ? input : input.toString('base64');
    let cleanStr = str;
    if (str.includes(',')) {
      cleanStr = str.split(',')[1];
    }
    const decoded = Buffer.from(cleanStr, 'base64').toString('utf8');
    return (
      decoded.startsWith('scanner-iris-') ||
      decoded.startsWith('iris-template-') ||
      decoded.startsWith('mock_captured_iris_')
    );
  } catch {
    return false;
  }
}

