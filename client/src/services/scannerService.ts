export const scannerService = {
  captureFingerprint: async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return `scanner-fingerprint-${Date.now()}`;
  },
  captureIris: async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return `scanner-iris-${Date.now()}`;
  },
};
