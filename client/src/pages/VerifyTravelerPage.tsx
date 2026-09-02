import { useState, useRef, useEffect } from 'react';
import { verificationService } from '../services/verificationService';
import { travelerService } from '../services/travelerService';
import { manualReviewService } from '../services/manualReviewService';
import { scannerService } from '../services/scannerService';
import { supremaScanner } from '../services/supremaScanner';
import type { Traveler, VerificationResult } from '../types';
import api from '../services/api';
import {
  Search, Fingerprint, ScanEye, Upload, CheckCircle2, XCircle, Clock, ShieldCheck,
  User, Globe, Calendar, FileText, AlertCircle, Loader2, RotateCcw, Cpu, ArrowRight, FileUp, ShieldAlert, Paperclip,
} from 'lucide-react';

const decisionThresholds = {
  approvalThreshold: 95,
  reviewRangeMin: 85,
  reviewRangeMax: 94,
  rejectBelow: 85,
};

type Stage = 'lookup' | 'found' | 'uploading' | 'processing' | 'result';
type CaptureMode = 'SIMULATION' | 'SCANNER';
type InjuryReason = 'FINGERPRINT_INJURY' | 'IRIS_INJURY' | 'BIOMETRIC_UNAVAILABLE';

export function VerifyTravelerPage() {
  const [stage, setStage] = useState<Stage>('lookup');
  const [fiydaId, setFiydaId] = useState('');
  const [traveler, setTraveler] = useState<Traveler | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('SIMULATION');
  const [fingerprintSource, setFingerprintSource] = useState<File | string | null>(null);
  const [irisSource, setIrisSource] = useState<File | string | null>(null);
  const [result, setResult] = useState<VerificationResult>('verified');
  const [scores, setScores] = useState({ fingerprint: 0, iris: 0, final: 0 });
  const [verifyError, setVerifyError] = useState('');
  const [manualReviewReason, setManualReviewReason] = useState<InjuryReason>('BIOMETRIC_UNAVAILABLE');
  const [manualReviewNotes, setManualReviewNotes] = useState('');
  const [manualReviewFiles, setManualReviewFiles] = useState<File[]>([]);
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
  const [manualReviewError, setManualReviewError] = useState('');
  const [manualReviewSuccess, setManualReviewSuccess] = useState('');
  const fpInputRef = useRef<HTMLInputElement>(null);
  const irisInputRef = useRef<HTMLInputElement>(null);
  const lookupFpInputRef = useRef<HTMLInputElement>(null);
  const [lookupTab, setLookupTab] = useState<'FINGERPRINT' | 'FAN'>('FINGERPRINT');
  const [identifyLoading, setIdentifyLoading] = useState(false);

  const [checkpoints, setCheckpoints] = useState<{ id: number; name: string }[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>('');
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const [fpQuality, setFpQuality] = useState<{ score: number; acceptable: boolean } | null>(null);
  const [irisQuality, setIrisQuality] = useState<{ score: number; acceptable: boolean } | null>(null);
  const [fpAttempts, setFpAttempts] = useState(0);
  const [irisAttempts, setIrisAttempts] = useState(0);
  const [qualityChecking, setQualityChecking] = useState(false);

  useEffect(() => {
    api.get('/checkpoints')
      .then((res) => {
        if (res.data?.checkpoints) {
          setCheckpoints(res.data.checkpoints);
          if (res.data.checkpoints.length > 0) {
            setSelectedCheckpoint(String(res.data.checkpoints[0].id));
          }
        }
      })
      .catch((err) => console.error('Failed to load checkpoints:', err));
  }, []);

  const handleLookup = async () => {
    if (!fiydaId.trim()) {
      setLookupError('Please enter a Fiyda ID.');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    try {
      const data = await travelerService.lookup(fiydaId.trim());
      setTraveler(data);
      setFingerprintSource(null);
      setIrisSource(null);
      setStage('found');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Traveler not found.';
      setTraveler(null);
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleFingerprintIdentify = async (source: File | string) => {
    setIdentifyLoading(true);
    setLookupError('');
    try {
      const data = await travelerService.identifyByFingerprint(source);
      setTraveler(data);
      setFingerprintSource(source);
      setIrisSource(null);
      setFiydaId(data.fan);
      setStage('found');
      checkFpQuality(source);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'No enrolled traveler matches the scanned fingerprint.';
      setTraveler(null);
      setLookupError(msg);
    } finally {
      setIdentifyLoading(false);
    }
  };

  const handleTouchSensorScan = async () => {
    setIdentifyLoading(true);
    setLookupError('');
    try {
      if (captureMode === 'SCANNER') {
        const supRes = await supremaScanner.captureFingerprint();
        if (supRes.success && (supRes.image || supRes.template)) {
          await handleFingerprintIdentify(supRes.image || supRes.template!);
          return;
        }
      }
      const mockData = await scannerService.captureFingerprint();
      await handleFingerprintIdentify(mockData);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to capture fingerprint from sensor.';
      setLookupError(msg);
      setIdentifyLoading(false);
    }
  };


  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const checkFpQuality = async (source: File | string) => {
    setQualityChecking(true);
    setVerifyError('');
    try {
      let imagePayload = "";
      if (typeof source === 'string') {
        imagePayload = source;
      } else {
        imagePayload = await fileToBase64(source);
      }

      const res = await verificationService.checkQuality({
        biometricType: 'fingerprint',
        imageData: imagePayload,
      });

      setFpQuality(res);
      if (!res.acceptable) {
        setFpAttempts((prev) => prev + 1);
        setVerifyError(`Fingerprint quality is poor (${res.score}%). Please retry with a clearer image.`);
      } else {
        setVerifyError('');
      }
    } catch (err: any) {
      console.error('Fingerprint quality check error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to run quality check on fingerprint.';
      setVerifyError(`Fingerprint Quality Check Error: ${errorMessage}. Please check if the AI service is running.`);
      setFpQuality(null); // Don't set as acceptable on error
      setFingerprintSource(null); // Clear the bad upload
      if (fpInputRef.current) fpInputRef.current.value = '';
    } finally {
      setQualityChecking(false);
    }
  };

  const checkIrisQuality = async (source: File | string) => {
    setQualityChecking(true);
    setVerifyError('');
    try {
      let imagePayload = "";
      if (typeof source === 'string') {
        imagePayload = source;
      } else {
        imagePayload = await fileToBase64(source);
      }

      const res = await verificationService.checkQuality({
        biometricType: 'iris',
        imageData: imagePayload,
      });

      setIrisQuality(res);
      if (!res.acceptable) {
        setIrisAttempts((prev) => prev + 1);
        setVerifyError(`Iris quality is poor (${res.score}%). Please retry with a clearer image.`);
      } else {
        setVerifyError('');
      }
    } catch (err: any) {
      console.error('Iris quality check error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to run quality check on iris.';
      setVerifyError(`Iris Quality Check Error: ${errorMessage}. Please check if the AI service is running.`);
      setIrisQuality(null); // Don't set as acceptable on error
      setIrisSource(null); // Clear the bad upload
      if (irisInputRef.current) irisInputRef.current.value = '';
    } finally {
      setQualityChecking(false);
    }
  };

  const handleFingerprintSelect = (file: File | null) => {
    if (!file) {
      setFingerprintSource(null);
      setFpQuality(null);
      return;
    }
    const allowed = ['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed.includes(extension)) {
      setVerifyError(`Invalid fingerprint file format. Accepted formats: ${allowed.map(ext => ext.toUpperCase()).join(', ')}`);
      setFingerprintSource(null);
      setFpQuality(null);
      if (fpInputRef.current) fpInputRef.current.value = '';
      return;
    }
    setVerifyError('');
    setFingerprintSource(file);
    checkFpQuality(file);
  };

  const handleIrisSelect = (file: File | null) => {
    if (!file) {
      setIrisSource(null);
      setIrisQuality(null);
      return;
    }
    const allowed = ['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed.includes(extension)) {
      setVerifyError(`Invalid iris file format. Accepted formats: ${allowed.map(ext => ext.toUpperCase()).join(', ')}`);
      setIrisSource(null);
      setIrisQuality(null);
      if (irisInputRef.current) irisInputRef.current.value = '';
      return;
    }
    setVerifyError('');
    setIrisSource(file);
    checkIrisQuality(file);
  };


  const clearFingerprint = () => {
    setFingerprintSource(null);
    setFpQuality(null);
    setFpAttempts(0);
    if (fpInputRef.current) fpInputRef.current.value = '';
  };

  const clearIris = () => {
    setIrisSource(null);
    setIrisQuality(null);
    setIrisAttempts(0);
    if (irisInputRef.current) irisInputRef.current.value = '';
  };

  const captureFingerprint = async () => {
    if (captureMode === 'SCANNER') {
      const data = await scannerService.captureFingerprint();
      setFingerprintSource(data);
      if (data) checkFpQuality(data);
      return;
    }
    fpInputRef.current?.click();
  };

  const captureIris = async () => {
    if (captureMode === 'SCANNER') {
      const data = await scannerService.captureIris();
      setIrisSource(data);
      if (data) checkIrisQuality(data);
      return;
    }
    irisInputRef.current?.click();
  };

  const [usedThreshold, setUsedThreshold] = useState(95);
  const [decisionReason, setDecisionReason] = useState<string | undefined>(undefined);

  const handleVerify = async () => {
    if (!traveler || !fingerprintSource || !irisSource) return;
    setStage('processing');
    setVerifyError('');
    try {
      const payload = captureMode === 'SIMULATION'
        ? {
            travelerId: traveler.id,
            captureMode,
            fingerprintImage: await fileToBase64(fingerprintSource as File),
            irisImage: await fileToBase64(irisSource as File),
            direction,
            checkpointId: selectedCheckpoint ? Number(selectedCheckpoint) : undefined,
          }
        : {
            travelerId: traveler.id,
            captureMode,
            fingerprintData: String(fingerprintSource),
            irisData: String(irisSource),
            direction,
            checkpointId: selectedCheckpoint ? Number(selectedCheckpoint) : undefined,
          };

      const data = await verificationService.verify(payload);
      setResult(data.result);
      setScores({
        fingerprint: data.fingerprintScore,
        iris: data.irisScore,
        final: data.finalScore,
      });
      if (data.threshold !== undefined) {
        setUsedThreshold(data.threshold);
      }
      setDecisionReason(data.decisionReason ?? undefined);
      setStage('result');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Verification failed. Please try again.';
      setVerifyError(msg);
      setStage('found');
    }
  };

  const handleManualReviewFiles = (files: FileList | null) => {
    if (!files) {
      setManualReviewFiles([]);
      return;
    }

    const selected = Array.from(files).slice(0, 5).filter((file) => {
      const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      return allowedMimeTypes.includes(file.type) && allowedExtensions.includes(extension);
    });

    setManualReviewFiles(selected);
  };

  const submitManualReview = async () => {
    if (!traveler || !manualReviewNotes.trim()) return;
    setManualReviewSubmitting(true);
    setManualReviewError('');
    setManualReviewSuccess('');

    try {
      await manualReviewService.create({
        travelerId: traveler.id,
        verificationId: undefined,
        reason: manualReviewReason,
        officerNotes: manualReviewNotes.trim(),
        attachments: manualReviewFiles,
      });
      setManualReviewSuccess('Manual review request submitted.');
      setManualReviewNotes('');
      setManualReviewFiles([]);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create manual review request.';
      setManualReviewError(msg);
    } finally {
      setManualReviewSubmitting(false);
    }
  };

  const reset = () => {
    setStage('lookup');
    setFiydaId('');
    setTraveler(null);
    setCaptureMode('SIMULATION');
    setFingerprintSource(null);
    setIrisSource(null);
    setLookupError('');
    setVerifyError('');
    setScores({ fingerprint: 0, iris: 0, final: 0 });
  };

  return (
    <div className="space-y-6">
      {/* Workflow steps */}
      <WorkflowSteps stage={stage} />

      {/* Section 1 — Traveler Identification & Lookup */}
      <div className="card p-6">
        <SectionHeader
          step={1}
          title="Traveler Identification"
          subtitle="Place finger on sensor to identify traveler or lookup by FAN"
        />

        {/* Tab selection */}
        <div className="mt-4 flex border-b border-navy-200">
          <button
            type="button"
            onClick={() => { setLookupTab('FINGERPRINT'); setLookupError(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
              lookupTab === 'FINGERPRINT'
                ? 'border-navy-800 text-navy-800 bg-navy-50/50'
                : 'border-transparent text-navy-400 hover:text-navy-700'
            }`}
          >
            <Fingerprint size={18} />
            Fingerprint Sensor Authentication
          </button>
          <button
            type="button"
            onClick={() => { setLookupTab('FAN'); setLookupError(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm border-b-2 transition-colors ${
              lookupTab === 'FAN'
                ? 'border-navy-800 text-navy-800 bg-navy-50/50'
                : 'border-transparent text-navy-400 hover:text-navy-700'
            }`}
          >
            <Search size={18} />
            Manual FAN Lookup
          </button>
        </div>

        {lookupTab === 'FINGERPRINT' ? (
          <div className="mt-6 flex flex-col items-center justify-center p-6 border-2 border-dashed border-navy-200 rounded-2xl bg-navy-50/30">
            <div className="relative mb-4">
              <div
                className={`p-5 rounded-full ${identifyLoading ? 'bg-navy-100 animate-pulse' : 'bg-navy-100 text-navy-800 hover:bg-navy-200'} transition-all cursor-pointer shadow-sm`}
                onClick={handleTouchSensorScan}
              >
                <Fingerprint size={48} className={identifyLoading ? 'text-navy-800 animate-spin' : 'text-navy-800'} />
              </div>
            </div>

            <h3 className="text-base font-bold text-navy-900 mb-1">
              {identifyLoading ? 'Identifying Traveler from Fingerprint...' : 'Touch Sensor to Identify Traveler'}
            </h3>
            <p className="text-xs text-navy-500 max-w-md text-center mb-5">
              Place traveler's finger on the Suprema hardware sensor or upload a test fingerprint file to automatically authenticate and fetch record.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleTouchSensorScan}
                disabled={identifyLoading}
                className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 shadow-sm disabled:opacity-60"
              >
                {identifyLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> Scanning Sensor...</>
                ) : (
                  <><Fingerprint size={16} /> Scan Fingerprint Sensor</>
                )}
              </button>

              <button
                type="button"
                onClick={() => lookupFpInputRef.current?.click()}
                disabled={identifyLoading}
                className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60"
              >
                <Upload size={16} /> Upload Print File
              </button>
              <input
                ref={lookupFpInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.bmp,.tif,.tiff"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFingerprintIdentify(file);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
              <input
                value={fiydaId}
                onChange={(e) => setFiydaId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="Enter Fiyda ID / FAN"
                className="input pl-10 font-mono"
              />
            </div>
            <button onClick={handleLookup} disabled={lookupLoading} className="btn-primary px-6 disabled:opacity-60">
              {lookupLoading ? <><Loader2 size={16} className="animate-spin" /> Searching...</> : <><Search size={16} /> Search Fiyda</>}
            </button>
          </div>
        )}

        {lookupError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {lookupError}
          </div>
        )}
      </div>

      {/* Section 2 — Traveler info */}
      {traveler && stage !== 'lookup' && (
        <div className="card p-6">
          <SectionHeader step={2} title="Traveler Information" subtitle="Record retrieved from Fiyda database" />
          <div className="mt-4 flex flex-col md:flex-row gap-6">
            <div className="shrink-0">
              <div className="h-40 w-32 rounded-xl border border-navy-200 bg-navy-50 overflow-hidden flex items-center justify-center">
                {traveler.photo ? (
                  <img src={traveler.photo} alt={traveler.fullName} className="h-full w-full object-cover" />
                ) : (
                  <User size={40} className="text-navy-300" />
                )}
              </div>
              <div className="mt-2 flex justify-center">
                <span className={traveler.enrollmentStatus === 'COMPLETED' ? 'badge-verified' : 'badge-pending'}>
                  {traveler.enrollmentStatus}
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoField icon={User} label="Full Name" value={traveler.fullName} />
                <InfoField icon={Globe} label="Nationality" value={traveler.nationality} />
                <InfoField icon={FileText} label="FAN" value={traveler.fan} mono />
                <InfoField icon={Calendar} label="Date of Birth" value={traveler.dateOfBirth} />
                <InfoField icon={User} label="Gender" value={traveler.gender} />
                <div className="col-span-2 md:col-span-3">
                  <InfoField icon={ShieldCheck} label="Record Status" value={traveler.enrollmentStatus} />
                </div>
              </div>

              {traveler.alertStatus && traveler.alertStatus !== 'NONE' && (
                <div className={`flex items-start gap-3 rounded-xl border p-4 ${
                  traveler.alertStatus === 'CRITICAL'
                    ? 'border-accent-red bg-accent-red-soft/40 text-accent-red'
                    : 'border-accent-amber bg-accent-amber-soft/40 text-accent-amber'
                }`}>
                  <ShieldAlert size={20} className="shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold uppercase">{traveler.alertStatus} ALERT ACTIVE</h4>
                    <p className="text-xs font-medium mt-1">{traveler.alertReason || 'Requires additional manual inspection.'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 3 — Checkpoint and Direction */}
      {traveler && stage !== 'lookup' && stage !== 'result' && (
        <div className="card p-6">
          <SectionHeader step={3} title="Checkpoint & Direction" subtitle="Select terminal location and entry/exit direction" />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Border Checkpoint</label>
              <select
                value={selectedCheckpoint}
                onChange={(e) => setSelectedCheckpoint(e.target.value)}
                className="input mt-1"
                required
              >
                {checkpoints.length === 0 ? (
                  <option value="">Loading checkpoints...</option>
                ) : (
                  checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>{cp.name}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="label">Direction</label>
              <div className="flex gap-6 mt-3">
                <label className="inline-flex items-center text-sm font-semibold text-navy-800 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    value="ENTRY"
                    checked={direction === 'ENTRY'}
                    onChange={() => setDirection('ENTRY')}
                    className="mr-2 h-4 w-4 border-navy-300 text-navy-800 focus:ring-navy-500"
                  />
                  ENTRY
                </label>
                <label className="inline-flex items-center text-sm font-semibold text-navy-800 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    value="EXIT"
                    checked={direction === 'EXIT'}
                    onChange={() => setDirection('EXIT')}
                    className="mr-2 h-4 w-4 border-navy-300 text-navy-800 focus:ring-navy-500"
                  />
                  EXIT
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 4 — Biometric upload */}
      {traveler && stage !== 'lookup' && (
        <div className="card p-6">
          <SectionHeader step={4} title="Biometric Capture" subtitle="Capture biometrics before verification" />
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => { setCaptureMode('SCANNER'); setFingerprintSource(null); setIrisSource(null); }}
              className={`btn-secondary ${captureMode === 'SCANNER' ? 'bg-navy-800 text-white' : ''}`}
            >
              Scanner Device
            </button>
            <button
              type="button"
              onClick={() => { setCaptureMode('SIMULATION'); setFingerprintSource(null); setIrisSource(null); }}
              className={`btn-secondary ${captureMode === 'SIMULATION' ? 'bg-navy-800 text-white' : ''}`}
            >
              Simulation Dataset
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <UploadCard
              icon={Fingerprint}
              title={captureMode === 'SCANNER' ? 'Fingerprint Capture' : 'Fingerprint Image'}
              hint={captureMode === 'SCANNER' ? 'Capture fingerprint from scanner device' : 'Upload right index finger scan (PNG/JPG/JPEG/BMP/TIF/TIFF, ≤5MB)'}
              fileName={typeof fingerprintSource === 'string' ? 'Scanner fingerprint captured' : fingerprintSource?.name}
              actionLabel={captureMode === 'SCANNER' ? 'Capture Fingerprint' : 'Choose Image'}
              onAction={captureFingerprint}
              onClear={clearFingerprint}
              quality={fpQuality}
              attempts={fpAttempts}
            />
            <input
              ref={fpInputRef}
              type="file"
              accept="image/png,image/jpeg,image/bmp,image/tiff,image/x-tiff,.png,.jpg,.jpeg,.bmp,.tif,.tiff"
              className="hidden"
              onChange={(e) => handleFingerprintSelect(e.target.files?.[0] ?? null)}
            />
            <UploadCard
              icon={ScanEye}
              title={captureMode === 'SCANNER' ? 'Iris Capture' : 'Iris Image'}
              hint={captureMode === 'SCANNER' ? 'Capture iris data from scanner device' : 'Upload iris scan of either eye (PNG/JPG/JPEG/BMP, ≤5MB)'}
              fileName={typeof irisSource === 'string' ? 'Scanner iris captured' : irisSource?.name}
              actionLabel={captureMode === 'SCANNER' ? 'Capture Iris' : 'Choose Image'}
              onAction={captureIris}
              onClear={clearIris}
              quality={irisQuality}
              attempts={irisAttempts}
            />
            <input
              ref={irisInputRef}
              type="file"
              accept="image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp"
              className="hidden"
              onChange={(e) => handleIrisSelect(e.target.files?.[0] ?? null)}
            />
          </div>
          {qualityChecking && (
            <div className="mt-3 text-xs text-accent-blue font-semibold animate-pulse flex items-center gap-1.5 justify-center">
              <Loader2 size={12} className="animate-spin" /> Evaluating image capture quality...
            </div>
          )}
          {verifyError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {verifyError}
            </div>
          )}
          {(fpAttempts >= 3 || irisAttempts >= 3) && (
            <div className="mt-4 rounded-xl border border-accent-amber bg-accent-amber-soft/40 p-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="text-accent-amber shrink-0 mt-0.5" size={16} />
                <div>
                  <h4 className="text-xs font-bold text-navy-800">Biometric Quality Check Repeated Failures</h4>
                  <p className="text-xs text-navy-600 mt-1">Biometric quality checks have failed 3 times. You should bypass standard verification and submit a manual review request to the supervisor via the <strong>Manual Review Request</strong> tab in the sidebar.</p>
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent-blue-soft px-3 py-2.5 text-xs text-accent-blue">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Future Enhancement:</strong> These upload zones will be replaced by live
              fingerprint and iris scanner hardware integration once biometric capture devices are deployed to border terminals.
            </span>
          </div>
        </div>
      )}

      {/* Section 5 — Verify button */}
      {traveler && stage !== 'lookup' && stage !== 'result' && (
        <div className="card p-6 flex flex-col items-center">
          <SectionHeader step={5} title="Run Verification" subtitle="Submit biometrics to the AI decision engine" centered />
          <button
            onClick={handleVerify}
            disabled={
              !fingerprintSource ||
              !irisSource ||
              stage === 'processing' ||
              qualityChecking ||
              !fpQuality ||
              !irisQuality ||
              !fpQuality.acceptable ||
              !irisQuality.acceptable
            }
            className="mt-4 btn bg-accent-green text-white hover:bg-green-700 disabled:bg-navy-200 disabled:text-navy-400 disabled:cursor-not-allowed px-10 py-4 text-base font-semibold tracking-wide"
          >
            {stage === 'processing' ? (
              <><Loader2 size={20} className="animate-spin" /> Processing Biometrics...</>
            ) : (
              <><Fingerprint size={20} /> VERIFY TRAVELER</>
            )}
          </button>
          {!fingerprintSource || !irisSource ? (
            <p className="mt-3 text-xs text-navy-400">Upload both biometric images to enable verification.</p>
          ) : qualityChecking ? (
            <p className="mt-3 text-xs text-accent-blue animate-pulse">Waiting for biometric quality checks to complete...</p>
          ) : !fpQuality || !irisQuality ? (
            <p className="mt-3 text-xs text-accent-red font-semibold">Quality check must complete successfully before verification.</p>
          ) : !fpQuality.acceptable || !irisQuality.acceptable ? (
            <p className="mt-3 text-xs text-accent-red font-semibold">Biometric scans do not meet quality standards. Please re-upload clearer images.</p>
          ) : (
            <p className="mt-3 text-xs text-navy-400">✓ Quality checks passed. AI will compare against stored biometric templates (1:1 verification).</p>
          )}
        </div>
      )}


      {/* Section 6 — Result */}
      {stage === 'result' && (
        <ResultPanel 
          result={result} 
          scores={scores} 
          onReset={reset} 
          usedThreshold={usedThreshold}
          decisionReason={decisionReason}
          traveler={traveler}
          direction={direction}
          checkpoint={checkpoints.find(c => c.id === Number(selectedCheckpoint))}
        />
      )}
    </div>
  );
}

function WorkflowSteps({ stage }: { stage: Stage }) {
  const steps = [
    { key: 'lookup', label: 'Lookup', n: 1 },
    { key: 'found', label: 'Traveler', n: 2 },
    { key: 'uploading', label: 'Biometrics', n: 3 },
    { key: 'processing', label: 'AI Verify', n: 4 },
    { key: 'result', label: 'Decision', n: 5 },
  ];
  const order = ['lookup', 'found', 'uploading', 'processing', 'result'];
  const activeIdx = order.indexOf(stage);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        {steps.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  done ? 'bg-accent-green text-white' : active ? 'bg-navy-800 text-white' : 'bg-navy-100 text-navy-400'
                }`}>
                  {done ? <CheckCircle2 size={16} /> : s.n}
                </div>
                <span className={`text-sm font-medium ${active ? 'text-navy-800' : done ? 'text-navy-600' : 'text-navy-400'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px mx-3 ${i < activeIdx ? 'bg-accent-green' : 'bg-navy-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ step, title, subtitle, centered }: { step: number; title: string; subtitle: string; centered?: boolean }) {
  return (
    <div className={centered ? 'text-center' : ''}>
      <div className="flex items-center gap-2 justify-center">
        <span className="h-6 w-6 rounded-full bg-navy-800 text-white text-xs font-semibold flex items-center justify-center">{step}</span>
        <h3 className="text-base font-semibold text-navy-800">{title}</h3>
      </div>
      <p className="text-xs text-navy-400 mt-1">{subtitle}</p>
    </div>
  );
}

function InfoField({ icon: Icon, label, value, mono }: { icon: typeof User; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label flex items-center gap-1.5"><Icon size={12} /> {label}</div>
      <div className={`text-sm font-medium text-navy-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function UploadCard({
  icon: Icon,
  title,
  hint,
  fileName,
  actionLabel,
  onAction,
  onClear,
  quality,
  attempts,
}: {
  icon: typeof Fingerprint;
  title: string;
  hint: string;
  fileName?: string;
  actionLabel: string;
  onAction: () => void;
  onClear: () => void;
  quality?: { score: number; acceptable: boolean } | null;
  attempts?: number;
}) {
  const done = !!fileName;
  return (
    <div className={`rounded-xl border-2 border-dashed p-6 transition-colors ${done ? (quality?.acceptable ? 'border-accent-green bg-accent-green-soft/40' : 'border-accent-amber bg-accent-amber-soft/40') : 'border-navy-200 hover:border-navy-300 bg-navy-50/40'}`}>
      <div className="flex items-start gap-4">
        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${done ? (quality?.acceptable ? 'bg-accent-green text-white' : 'bg-accent-amber text-white') : 'bg-navy-100 text-navy-500'}`}>
          {done ? (quality?.acceptable ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />) : <Icon size={24} />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-navy-800">{title}</div>
          <div className="text-xs text-navy-400 mt-0.5">{hint}</div>
          {done ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-medium text-navy-700 flex items-center gap-1.5">
                <Paperclip size={13} /> {fileName}
              </div>
              {quality && (
                <div className={`text-[11px] font-bold flex items-center gap-1 ${quality.acceptable ? 'text-accent-green' : 'text-accent-red'}`}>
                  Quality: {quality.score}% · {quality.acceptable ? 'ACCEPTABLE' : `POOR QUALITY (${attempts}/3 attempts)`}
                </div>
              )}
              {quality && !quality.acceptable && (
                <div className="text-[10px] text-accent-red font-medium">
                  ⚠ Image quality check failed. Upload a clearer image with better lighting and focus.
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={onAction} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                  <RotateCcw size={12} /> Re-upload
                </button>
                <button onClick={onClear} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                  <XCircle size={12} /> Clear
                </button>
              </div>
            </div>
          ) : (
            <button onClick={onAction} className="mt-3 btn-secondary text-xs px-3 py-2">
              <Upload size={13} /> {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ 
  result, 
  scores, 
  onReset, 
  usedThreshold,
  decisionReason,
  traveler,
  direction,
  checkpoint
}: { 
  result: VerificationResult; 
  scores: { fingerprint: number; iris: number; final: number }; 
  onReset: () => void; 
  usedThreshold: number;
  decisionReason?: string;
  traveler: Traveler | null;
  direction: 'ENTRY' | 'EXIT';
  checkpoint?: { id: number; name: string };
}) {
  return (
    <div className="card p-6">
      <SectionHeader step={6} title="Verification Decision" subtitle="AI decision engine result" centered />

      {/* Decision banner */}
      <div className="mt-5 flex justify-center">
        {result === 'verified' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-green-soft border border-green-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-green text-white flex items-center justify-center mx-auto">
              <CheckCircle2 size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-green">VERIFIED</h3>
            <p className="text-sm text-green-700 mt-1">Identity confirmed · Confidence ≥ {usedThreshold}% · Automatic approval</p>
            {decisionReason && (
              <p className="text-xs text-green-600 mt-2 font-medium">Reason: {decisionReason}</p>
            )}
          </div>
        )}
        {result === 'rejected' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-red-soft border border-red-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-red text-white flex items-center justify-center mx-auto">
              <XCircle size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-red">
              {traveler?.alertStatus === 'CRITICAL' ? 'BLOCKED' : 'REJECTED'}
            </h3>
            <p className="text-sm text-red-700 mt-1">
              {traveler?.alertStatus === 'CRITICAL' 
                ? 'Traveler has CRITICAL alert status · Border crossing not permitted'
                : `Biometric match below acceptance threshold (${usedThreshold}%) · Automatic rejection`
              }
            </p>
            {decisionReason && (
              <p className="text-xs text-red-600 mt-2 font-medium">Reason: {decisionReason}</p>
            )}
          </div>
        )}
        {result === 'pending' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-amber-soft border border-amber-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-amber text-white flex items-center justify-center mx-auto">
              <Clock size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-amber">PENDING SUPERVISOR REVIEW</h3>
            <p className="text-sm text-amber-700 mt-1">
              {traveler?.alertStatus === 'WARNING' 
                ? `Biometric passed but traveler has WARNING alert status · Requires supervisor authorization`
                : `Confidence in review range (${usedThreshold - 10}%–${usedThreshold - 1}%) · Awaiting Supervisor Decision`
              }
            </p>
            {decisionReason && (
              <p className="text-xs text-amber-600 mt-2 font-medium">Reason: {decisionReason}</p>
            )}
          </div>
        )}
      </div>

      {/* Verification context details */}
      {traveler && (
        <div className="mt-6 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-navy-50 rounded-lg border border-navy-200">
          <div>
            <div className="text-xs text-navy-500 font-medium">Traveler</div>
            <div className="text-sm font-semibold text-navy-800 mt-0.5">{traveler.fullName}</div>
          </div>
          <div>
            <div className="text-xs text-navy-500 font-medium">Alert Status</div>
            <div className={`text-sm font-semibold mt-0.5 ${
              traveler.alertStatus === 'CRITICAL' 
                ? 'text-accent-red' 
                : traveler.alertStatus === 'WARNING' 
                ? 'text-accent-amber' 
                : 'text-accent-green'
            }`}>
              {traveler.alertStatus || 'NONE'}
            </div>
          </div>
          <div>
            <div className="text-xs text-navy-500 font-medium">Direction</div>
            <div className="text-sm font-semibold text-navy-800 mt-0.5">{direction}</div>
          </div>
          <div>
            <div className="text-xs text-navy-500 font-medium">Checkpoint</div>
            <div className="text-sm font-semibold text-navy-800 mt-0.5">{checkpoint?.name || 'N/A'}</div>
          </div>
        </div>
      )}

      {/* Scores */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
        <ScoreCard label="Fingerprint Score" value={scores.fingerprint} icon={Fingerprint} />
        <ScoreCard label="Iris Score" value={scores.iris} icon={ScanEye} />
        <ScoreCard label="Final Confidence" value={scores.final} icon={Cpu} highlight />
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <button onClick={onReset} className="btn-secondary">
          <RotateCcw size={15} /> New Verification
        </button>
        {result === 'pending' && (
          <button className="btn-warning">
            <ArrowRight size={15} /> Notify Supervisor
          </button>
        )}
      </div>
    </div>
  );
}

function ScoreCard({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: typeof Fingerprint; highlight?: boolean }) {
  const color = value >= 95 ? '#16a34a' : value >= 90 ? '#d97706' : '#dc2626';
  return (
    <div className={`rounded-xl border p-5 ${highlight ? 'border-navy-300 bg-white shadow-card' : 'border-navy-100 bg-white'}`}>
      <div className="flex items-center gap-2 text-navy-500">
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-3xl font-bold" style={{ color }}>{value}%</span>
        <div className="h-2 w-20 rounded-full bg-navy-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}
