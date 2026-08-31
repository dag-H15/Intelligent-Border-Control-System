/**
 * Scanner Service - Hardware Fingerprint Sensor & Biometric Device Integration
 * Connects to Windows Hello (WebAuthn), WebUSB hardware devices, local SDK agent bridges,
 * or device simulation stubs.
 */

export const scannerService = {
  /**
   * Capture fingerprint template from connected hardware fingerprint reader or Windows Hello
   */
  captureFingerprint: async (): Promise<string> => {
    // 1. Try Windows Hello / WebAuthn Biometric Authenticator if supported
    if (window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // Request Windows Hello / Biometric verification prompt
        const credential = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials: [],
          },
        }) as PublicKeyCredential | null;

        if (credential) {
          const rawId = new Uint8Array(credential.rawId);
          const base64Id = btoa(String.fromCharCode(...rawId));
          return `scanner-fingerprint-winhello-${base64Id.slice(0, 24)}`;
        }
      } catch (err: any) {
        console.warn('Windows Hello / WebAuthn biometric capture bypassed:', err.message);
      }
    }

    // 2. Try Local Hardware SDK Bridge Service (e.g. SecuGen, DigitalPersona, Suprema, Futronic)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch('http://127.0.0.1:8080/api/scanner/fingerprint', {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.template || data.image) {
          return data.template || data.image;
        }
      }
    } catch {
      // Local agent bridge not active — fallback to hardware simulation
    }

    // 3. Fallback: Hardware Device Simulation Stub
    await new Promise((resolve) => setTimeout(resolve, 600));
    return `scanner-fingerprint-${Date.now()}`;
  },

  /**
   * Capture iris biometric scan from hardware scanner device or camera
   */
  captureIris: async (): Promise<string> => {
    // 1. Try Local Iris Hardware Bridge Service
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch('http://127.0.0.1:8080/api/scanner/iris', {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.template || data.image) {
          return data.template || data.image;
        }
      }
    } catch {
      // Local agent bridge not active — fallback to simulation
    }

    // 2. Fallback: Hardware Device Simulation Stub
    await new Promise((resolve) => setTimeout(resolve, 600));
    return `scanner-iris-${Date.now()}`;
  },
};
