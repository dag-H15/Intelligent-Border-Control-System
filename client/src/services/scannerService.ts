export const scannerService = {
  captureFingerprint: async (): Promise<never> => {
    throw new Error('No scanner detected. Please connect a fingerprint scanner or upload a print file.');
  },
  captureIris: async (): Promise<never> => {
    throw new Error('No scanner detected. Please connect an iris scanner.');
  },
};

