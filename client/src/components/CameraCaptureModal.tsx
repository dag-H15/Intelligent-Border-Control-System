import { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  title?: string;
  subtitle?: string;
}

export function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = 'Live Camera Biometric Capture',
  subtitle = 'Align subject within the frame and capture a clear biometric photo',
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string>('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = async (deviceId?: string) => {
    setCameraError('');
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Enumerate camera devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
      setDevices(videoDevices);

      if (!deviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser.'
        : err.name === 'NotFoundError'
        ? 'No camera device found on this system.'
        : 'Failed to access Windows camera. Please check camera connection.';
      setCameraError(msg);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      startCamera(selectedDeviceId);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedImage(dataUrl);
    }
  };

  const handleConfirmCapture = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-navy-100 bg-navy-900 text-white">
          <div className="flex items-center gap-2.5">
            <Camera className="text-accent-blue" size={20} />
            <div>
              <h3 className="font-semibold text-sm">{title}</h3>
              <p className="text-[11px] text-navy-300">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera View / Preview */}
        <div className="relative bg-navy-950 flex items-center justify-center min-h-[360px]">
          {cameraError ? (
            <div className="p-6 text-center text-red-400 space-y-2">
              <AlertCircle size={36} className="mx-auto" />
              <p className="text-sm font-medium">{cameraError}</p>
              <button
                onClick={() => startCamera(selectedDeviceId)}
                className="btn-secondary text-xs mt-2"
              >
                Retry Camera Connection
              </button>
            </div>
          ) : capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={capturedImage}
                alt="Captured Snapshot"
                className="max-h-[380px] rounded-lg shadow-lg border-2 border-accent-green"
              />
              <span className="absolute top-6 left-6 badge badge-verified shadow">
                <CheckCircle2 size={12} /> Captured Frame
              </span>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-[380px] object-contain"
              />
              {/* Target Frame Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-dashed border-accent-blue/80 rounded-2xl flex items-center justify-center">
                  <div className="w-48 h-48 border border-white/40 rounded-full" />
                </div>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls / Footer */}
        <div className="p-4 border-t border-navy-100 bg-navy-50 flex items-center justify-between gap-3">
          {devices.length > 1 && !capturedImage && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-navy-500 font-medium">Camera:</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  startCamera(e.target.value);
                }}
                className="input py-1 text-xs max-w-[180px]"
              >
                {devices.map((d, idx) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="btn-secondary text-xs px-3 py-2">
              Cancel
            </button>

            {capturedImage ? (
              <>
                <button onClick={handleRetake} className="btn-secondary text-xs px-3 py-2">
                  <RefreshCw size={14} /> Retake Photo
                </button>
                <button onClick={handleConfirmCapture} className="btn-success text-xs px-4 py-2">
                  <CheckCircle2 size={14} /> Use Captured Photo
                </button>
              </>
            ) : (
              <button
                onClick={handleTakeSnapshot}
                disabled={!!cameraError}
                className="btn-primary text-xs px-4 py-2"
              >
                <Camera size={14} /> Capture Photo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
