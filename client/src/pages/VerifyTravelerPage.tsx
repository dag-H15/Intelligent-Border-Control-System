import { useState, useRef } from 'react';
import { verificationService } from '../services/verificationService';
import { travelerService } from '../services/travelerService';
import { manualReviewService } from '../services/manualReviewService';
import { scannerService } from '../services/scannerService';
import type { Traveler, VerificationResult } from '../types';
import {
  Search, Fingerprint, ScanEye, Upload, CheckCircle2, XCircle, Clock, ShieldCheck,
  User, Globe, Calendar, FileText, AlertCircle, Loader2, RotateCcw, Cpu, ArrowRight, FileUp,
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

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFingerprintSelect = (file: File | null) => {
    if (!file) {
      setFingerprintSource(null);
      return;
    }
    const allowed = ['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed.includes(extension)) {
      setVerifyError(`Invalid fingerprint file format. Accepted formats: ${allowed.map(ext => ext.toUpperCase()).join(', ')}`);
      setFingerprintSource(null);
      if (fpInputRef.current) fpInputRef.current.value = '';
      return;
    }
    setVerifyError('');
    setFingerprintSource(file);
  };

  const handleIrisSelect = (file: File | null) => {
    if (!file) {
      setIrisSource(null);
      return;
    }
    const allowed = ['png', 'jpg', 'jpeg', 'bmp'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed.includes(extension)) {
      setVerifyError(`Invalid iris file format. Accepted formats: ${allowed.map(ext => ext.toUpperCase()).join(', ')}`);
      setIrisSource(null);
      if (irisInputRef.current) irisInputRef.current.value = '';
      return;
    }
    setVerifyError('');
    setIrisSource(file);
  };


  const captureFingerprint = async () => {
    if (captureMode === 'SCANNER') {
      setFingerprintSource(await scannerService.captureFingerprint());
      return;
    }

    fpInputRef.current?.click();
  };

  const captureIris = async () => {
    if (captureMode === 'SCANNER') {
      setIrisSource(await scannerService.captureIris());
      return;
    }

    irisInputRef.current?.click();
  };

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
            threshold: decisionThresholds.approvalThreshold,
          }
        : {
            travelerId: traveler.id,
            captureMode,
            fingerprintData: String(fingerprintSource),
            irisData: String(irisSource),
            threshold: decisionThresholds.approvalThreshold,
          };

      const data = await verificationService.verify(payload);
      setResult(data.result);
      setScores({
        fingerprint: data.fingerprintScore,
        iris: data.irisScore,
        final: data.finalScore,
      });
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

      {/* Section 1 — Lookup */}
      <div className="card p-6">
        <SectionHeader step={1} title="Traveler Lookup" subtitle="Retrieve traveler record from the Fiyda national database" />
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <input
              value={fiydaId}
              onChange={(e) => setFiydaId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Enter Fiyda ID"
              className="input pl-10 font-mono"
            />
          </div>
          <button onClick={handleLookup} disabled={lookupLoading} className="btn-primary px-6 disabled:opacity-60">
            {lookupLoading ? <><Loader2 size={16} className="animate-spin" /> Searching...</> : <><Search size={16} /> Search Fiyda</>}
          </button>
        </div>
        {lookupError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {lookupError}
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
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoField icon={User} label="Full Name" value={traveler.fullName} />
              <InfoField icon={Globe} label="Nationality" value={traveler.nationality} />
              <InfoField icon={FileText} label="FAN" value={traveler.fan} mono />
              <InfoField icon={Calendar} label="Date of Birth" value={traveler.dateOfBirth} />
              <InfoField icon={User} label="Gender" value={traveler.gender} />
              <div className="col-span-2 md:col-span-3">
                <InfoField icon={ShieldCheck} label="Record Status" value={traveler.enrollmentStatus} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3 — Biometric upload */}
      {traveler && stage !== 'lookup' && (
        <div className="card p-6">
          <SectionHeader step={3} title="Biometric Capture" subtitle="Capture biometrics before verification" />
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
            />
            <input
              ref={irisInputRef}
              type="file"
              accept="image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp"
              className="hidden"
              onChange={(e) => handleIrisSelect(e.target.files?.[0] ?? null)}
            />
          </div>
          {verifyError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {verifyError}
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

      {/* Section 4 — Verify button */}
      {traveler && stage !== 'lookup' && stage !== 'result' && (
        <div className="card p-6 flex flex-col items-center">
          <SectionHeader step={4} title="Run Verification" subtitle="Submit biometrics to the AI decision engine" centered />
          <button
            onClick={handleVerify}
            disabled={!fingerprintSource || !irisSource || stage === 'processing'}
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
          ) : (
            <p className="mt-3 text-xs text-navy-400">AI will compare against stored biometric templates (1:1 verification).</p>
          )}
        </div>
      )}


      {/* Section 5 — Result */}
      {stage === 'result' && (
        <ResultPanel result={result} scores={scores} onReset={reset} />
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

function UploadCard({ icon: Icon, title, hint, fileName, actionLabel, onAction }: { icon: typeof Fingerprint; title: string; hint: string; fileName?: string; actionLabel: string; onAction: () => void }) {
  const done = !!fileName;
  return (
    <div className={`rounded-xl border-2 border-dashed p-6 transition-colors ${done ? 'border-accent-green bg-accent-green-soft/40' : 'border-navy-200 hover:border-navy-300 bg-navy-50/40'}`}>
      <div className="flex items-start gap-4">
        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${done ? 'bg-accent-green text-white' : 'bg-navy-100 text-navy-500'}`}>
          {done ? <CheckCircle2 size={24} /> : <Icon size={24} />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-navy-800">{title}</div>
          <div className="text-xs text-navy-400 mt-0.5">{hint}</div>
          {done ? (
            <div className="mt-3 text-xs font-medium text-accent-green flex items-center gap-1.5">
              <CheckCircle2 size={13} /> {fileName}
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

function ResultPanel({ result, scores, onReset }: { result: VerificationResult; scores: { fingerprint: number; iris: number; final: number }; onReset: () => void }) {
  return (
    <div className="card p-6">
      <SectionHeader step={5} title="Verification Decision" subtitle="AI decision engine result" centered />

      {/* Decision banner */}
      <div className="mt-5 flex justify-center">
        {result === 'verified' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-green-soft border border-green-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-green text-white flex items-center justify-center mx-auto">
              <CheckCircle2 size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-green">VERIFIED</h3>
            <p className="text-sm text-green-700 mt-1">Identity confirmed · Confidence ≥ {decisionThresholds.approvalThreshold}% · Automatic approval</p>
          </div>
        )}
        {result === 'rejected' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-red-soft border border-red-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-red text-white flex items-center justify-center mx-auto">
              <XCircle size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-red">REJECTED</h3>
            <p className="text-sm text-red-700 mt-1">Biometric match below acceptance threshold · Automatic rejection</p>
          </div>
        )}
        {result === 'pending' && (
          <div className="w-full max-w-2xl rounded-xl bg-accent-amber-soft border border-amber-200 p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-accent-amber text-white flex items-center justify-center mx-auto">
              <Clock size={30} />
            </div>
            <h3 className="mt-3 text-xl font-bold text-accent-amber">PENDING SUPERVISOR REVIEW</h3>
            <p className="text-sm text-amber-700 mt-1">Confidence in review range ({decisionThresholds.reviewRangeMin}–{decisionThresholds.reviewRangeMax}%) · Awaiting Supervisor Decision</p>
          </div>
        )}
      </div>

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
