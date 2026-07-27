import { useState, useEffect } from 'react';
import { overrideService, type PendingCase } from '../services/overrideService';
import {
  User, Globe, FileText, Fingerprint, ScanEye, Cpu, ShieldCheck,
  CheckCircle2, XCircle, Clock, MessageSquare, ClipboardCheck, ArrowLeft,
  Loader2, AlertCircle,
} from 'lucide-react';

const decisionThresholds = {
  approvalThreshold: 95,
  reviewRangeMin: 85,
  reviewRangeMax: 94,
  rejectBelow: 85,
};

export function PendingReviewPage() {
  const [cases, setCases] = useState<PendingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    overrideService
      .getPending()
      .then((data) => { setCases(data); setLoading(false); })
      .catch(() => { setError('Failed to load pending cases.'); setLoading(false); });
  }, []);

  const openCase = (idx: number) => {
    setSelectedIdx(idx);
    setDecision(null);
    setReason('');
    setSubmitError('');
  };

  const backToList = () => setSelectedIdx(null);

  const submitDecision = async () => {
    if (selectedIdx === null || !decision || !reason.trim()) return;
    const c = cases[selectedIdx];
    setSubmitting(true);
    setSubmitError('');
    try {
      await overrideService.submitOverride(c.verificationId, {
        decision: decision === 'approve' ? 'VERIFIED' : 'REJECTED',
        reason,
      });
      // Remove the case from the list
      const updated = cases.filter((_, i) => i !== selectedIdx);
      setCases(updated);
      setSelectedIdx(null);
      setDecision(null);
      setReason('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to submit decision.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // List view
  if (selectedIdx === null) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-navy-800">Pending Review Cases</h2>
          <p className="text-sm text-navy-400 mt-0.5">Borderline verifications awaiting a supervisor decision.</p>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-navy-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12 text-accent-red">
                <AlertCircle size={18} className="mr-2" /> {error}
              </div>
            ) : cases.length === 0 ? (
              <div className="py-12 text-center text-navy-400 text-sm">No pending cases.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-navy-50">
                  <tr>
                    <th className="table-header px-5 py-3">Case ID</th>
                    <th className="table-header px-5 py-3">Traveler</th>
                    <th className="table-header px-5 py-3">Fiyda ID</th>
                    <th className="table-header px-5 py-3">Nationality</th>
                    <th className="table-header px-5 py-3">Officer</th>
                    <th className="table-header px-5 py-3">Confidence</th>
                    <th className="table-header px-5 py-3">Submitted</th>
                    <th className="table-header px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {cases.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-navy-50/60 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-navy-600">{c.id}</td>
                      <td className="px-5 py-3 font-medium text-navy-800">{c.travelerName}</td>
                      <td className="px-5 py-3 font-mono text-xs text-navy-600">{c.fiydaId}</td>
                      <td className="px-5 py-3 text-navy-600">{c.nationality}</td>
                      <td className="px-5 py-3 text-navy-600">{c.officer}</td>
                      <td className="px-5 py-3">
                        <span className="text-sm font-bold text-accent-amber">{c.finalScore}%</span>
                      </td>
                      <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{c.time}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openCase(idx)} className="btn-primary text-xs px-3 py-2">
                          <ClipboardCheck size={13} /> Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  const c = cases[selectedIdx];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={backToList} className="btn-secondary">
          <ArrowLeft size={15} /> Back to Cases
        </button>
        <div>
          <h2 className="text-base font-semibold text-navy-800">Review Case {c.id}</h2>
          <p className="text-sm text-navy-400">Submitted by {c.officer} at {c.time}</p>
        </div>
        <span className="badge-pending ml-auto"><Clock size={12} /> Awaiting Decision</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1 — Traveler info */}
        <div className="card p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-4">Traveler Information</h3>
          <div className="flex flex-col items-center">
            <div className="h-36 w-28 rounded-xl border border-navy-200 bg-navy-50 flex items-center justify-center">
              <User size={40} className="text-navy-300" />
            </div>
            <div className="mt-3 text-center">
              <div className="text-sm font-semibold text-navy-800">{c.travelerName}</div>
              <div className="text-xs text-navy-400 font-mono mt-0.5">{c.fiydaId}</div>
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-navy-100 pt-4">
            <DetailRow icon={Globe} label="Nationality" value={c.nationality} />
            <DetailRow icon={FileText} label="Fiyda ID" value={c.fiydaId} mono />
            <DetailRow icon={User} label="Gender" value={c.gender} />
            <DetailRow icon={FileText} label="Passport No." value={c.passportNo} mono />
            <DetailRow icon={ShieldCheck} label="Record Status" value={c.status} />
            <DetailRow icon={User} label="Officer" value={c.officer} />
            <DetailRow icon={Clock} label="Submitted" value={c.time} />
          </div>
        </div>

        {/* Card 2 — AI scores */}
        <div className="card p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-4">AI Verification Scores</h3>

          <div className="space-y-3">
            <BigScore label="Fingerprint Score" value={c.fingerprintScore} icon={Fingerprint} />
            <BigScore label="Iris Score" value={c.irisScore} icon={ScanEye} />
            <BigScore label="Final Confidence" value={c.finalScore} icon={Cpu} highlight />
          </div>

          {/* Threshold visualization */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-navy-400 mb-2">
              <span>Confidence scale</span>
              <span>Threshold {decisionThresholds.approvalThreshold}%</span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden bg-navy-100">
              <div className="absolute inset-y-0 left-0 bg-accent-red" style={{ width: `${decisionThresholds.rejectBelow}%` }} />
              <div className="absolute inset-y-0 bg-accent-amber" style={{ left: `${decisionThresholds.rejectBelow}%`, width: `${decisionThresholds.approvalThreshold - decisionThresholds.rejectBelow}%` }} />
              <div className="absolute inset-y-0 bg-accent-green" style={{ left: `${decisionThresholds.approvalThreshold}%`, right: 0 }} />
              <div className="absolute top-1/2 -translate-y-1/2 h-5 w-1 bg-navy-800 rounded-full" style={{ left: `calc(${c.finalScore}% - 2px)` }} />
            </div>
            <div className="flex justify-between text-[10px] text-navy-400 mt-1.5 font-medium">
              <span>Reject &lt;{decisionThresholds.rejectBelow}%</span>
              <span>Review {decisionThresholds.reviewRangeMin}–{decisionThresholds.reviewRangeMax}%</span>
              <span>Approve ≥{decisionThresholds.approvalThreshold}%</span>
            </div>
          </div>
        </div>

        {/* Card 3 — Supervisor decision */}
        <div className="card p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-4">Supervisor Decision</h3>

          <div className="mb-4">
            <label className="label">Reason for Override <span className="text-accent-red normal-case">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={6}
              placeholder="Document the justification for approving or rejecting this verification (e.g. document quality, known travel history, secondary check)..."
              className="input resize-none"
            />
          </div>

          {submitError && (
            <div className="mb-3 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {submitError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDecision('approve')}
              className={`btn px-4 py-3 text-sm font-semibold ${decision === 'approve' ? 'bg-accent-green text-white' : 'btn-secondary'}`}
            >
              <CheckCircle2 size={16} /> Approve Override
            </button>
            <button
              onClick={() => setDecision('reject')}
              className={`btn px-4 py-3 text-sm font-semibold ${decision === 'reject' ? 'bg-accent-red text-white' : 'btn-secondary'}`}
            >
              <XCircle size={16} /> Reject
            </button>
          </div>

          {decision && (
            <div className="mt-4">
              <div className={`rounded-lg p-4 ${decision === 'approve' ? 'bg-accent-green-soft border border-green-200' : 'bg-accent-red-soft border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {decision === 'approve' ? <CheckCircle2 size={16} className="text-accent-green" /> : <XCircle size={16} className="text-accent-red" />}
                  <span className={`text-sm font-semibold ${decision === 'approve' ? 'text-accent-green' : 'text-accent-red'}`}>
                    {decision === 'approve' ? 'Ready to Approve Override' : 'Ready to Reject'}
                  </span>
                </div>
                <p className="text-xs text-navy-500 mt-1">
                  {reason ? `"${reason.slice(0, 80)}${reason.length > 80 ? '...' : ''}"` : 'Add a reason above before confirming.'}
                </p>
              </div>
              <button
                onClick={submitDecision}
                disabled={!reason.trim() || submitting}
                className={`mt-3 w-full btn py-3 text-sm font-semibold text-white disabled:bg-navy-200 disabled:text-navy-400 disabled:cursor-not-allowed ${decision === 'approve' ? 'bg-accent-green hover:bg-green-700' : 'bg-accent-red hover:bg-red-700'}`}
              >
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting...</> : <><MessageSquare size={15} /> Confirm &amp; Submit Decision</>}
              </button>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-navy-100 text-xs text-navy-400 flex items-center gap-1.5">
            <ShieldCheck size={12} /> Decision logged with supervisor ID, timestamp &amp; IP
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono }: { icon: typeof User; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-navy-500">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-sm font-medium ${mono ? 'font-mono text-xs' : ''} text-navy-800`}>{value}</span>
    </div>
  );
}

function BigScore({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: typeof Fingerprint; highlight?: boolean }) {
  const color = value >= 95 ? '#16a34a' : value >= 90 ? '#d97706' : '#dc2626';
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-navy-300 bg-white' : 'border-navy-100 bg-white'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-navy-500">
          <Icon size={14} />
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-xl font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-navy-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
