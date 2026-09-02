/**
 * Suprema BioMini & RealScan Hardware Scanner Driver Module
 * Communicates with Suprema BioMini Web Agent / Suprema Web SDK Service
 * running locally on the Windows border terminal station.
 */

export interface SupremaScannerConfig {
  agentUrl?: string; // Default BioMini Web Agent HTTP endpoint
  wsUrl?: string;    // Default BioMini WebSocket endpoint
  timeoutMs?: number;
}

export interface SupremaCaptureResult {
  success: boolean;
  image?: string;       // Base64 encoded PNG/WSQ image
  template?: string;    // Suprema ISO 19794-2 / ANSI 378 binary minutiae template (base64)
  qualityScore?: number;// Suprema image quality score (0 - 100)
  error?: string;
}

const DEFAULT_HTTP_AGENT = 'http://127.0.0.1:8000/api/biomini';
const DEFAULT_WS_AGENT = 'ws://127.0.0.1:8282';

export const supremaScanner = {
  /**
   * Check if Suprema BioMini Web Agent service is running on Windows station
   */
  isAgentAvailable: async (agentUrl = DEFAULT_HTTP_AGENT): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(`${agentUrl}/status`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Capture fingerprint scan directly from Suprema BioMini USB Hardware Scanner
   */
  captureFingerprint: async (config?: SupremaScannerConfig): Promise<SupremaCaptureResult> => {
    const agentUrl = config?.agentUrl || DEFAULT_HTTP_AGENT;
    const timeoutMs = config?.timeoutMs || 10000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Send capture command to Suprema BioMini Web Agent
      const response = await fetch(`${agentUrl}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityLevel: 3,       // High security threshold
          timeout: 8000,          // 8 seconds sensor capture window
          templateType: 'ISO19794_2', // Standard ISO minutiae template
          imageFormat: 'PNG',     // High-res uncompressed image format
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Suprema Agent Error: ${errText}` };
      }

      const data = await response.json();
      return {
        success: true,
        image: data.image || data.bmpImage || data.pngBase64,
        template: data.template || data.isoTemplate,
        qualityScore: data.quality || data.nfiqScore || 85,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Suprema sensor capture timed out. Please place finger on sensor and retry.' };
      }
      return { success: false, error: `Failed to connect to Suprema scanner agent at ${agentUrl}.` };
    }
  },

  /**
   * WebSocket stream implementation for live Suprema BioMini finger placement feedback
   */
  connectLiveStream: (
    onFingerPlaced: () => void,
    onCaptured: (result: SupremaCaptureResult) => void,
    onError: (err: string) => void,
    wsUrl = DEFAULT_WS_AGENT
  ): (() => void) => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ command: 'START_CAPTURE', sensor: 'BioMini' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'FINGER_PLACED') {
            onFingerPlaced();
          } else if (msg.event === 'CAPTURE_SUCCESS') {
            onCaptured({
              success: true,
              image: msg.imageData,
              template: msg.templateData,
              qualityScore: msg.quality,
            });
            ws?.close();
          } else if (msg.event === 'CAPTURE_ERROR') {
            onError(msg.message || 'Suprema capture failed');
            ws?.close();
          }
        } catch (e: any) {
          onError('Failed to parse Suprema WebSocket response');
        }
      };

      ws.onerror = () => {
        onError('Suprema WebSocket connection error');
      };
    } catch (e: any) {
      onError('WebSocket error');
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  },
};
