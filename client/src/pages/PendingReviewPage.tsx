import { useState, useEffect } from 'react';
import { overrideService, type PendingCase } from '../services/overrideService';
import {
  User, Globe, Fingerprint, ScanEye, Cpu, ShieldCheck,
  CheckCircle2, XCircle, Clock, MessageSquare, ClipboardCheck, ArrowLeft,
  Loader2, AlertCircle
} from 'lucide-react';

export function PendingReviewPage() {
  const [cases, setCases] = useState<PendingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [decision, setDecision] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = () => {
    setLoading(true);
    overrideService
      .getPending()
      .then((data) => { setCases(data); setLoading(false); })
      .catch(() => { setError('Failed to load pending threshold overrides.'); setLoading(false); });
  };

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
      await overrideService.submitOverride(c.verificationId, { decision, reason: reason.trim() });
      setCases(cases.filter((_, i) => i !== selectedIdx));
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

  if (selectedIdx === null) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold text-navy-800">Pending Threshold Overrides</h2>
          <p className="text-sm text-navy-400 mt-0.5">Biometric verifications that fell below approval threshold requiring supervisor intervention.</p>
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
              <div className="py-12 text-center text-navy-400 text-sm">No pending threshold overrides.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-navy-50">
                  <tr>
                    <th className="table-header px-5 py-3">Verification ID</th>
                    <th className="table-header px-5 py-3">Traveler</th>
                    <th className="table-header px-5 py-3">Fiyda ID</th>
                    <th className="table-header px-5 py-3">Score</th>
                    <th className="table-header px-5 py-3">Officer</th>
                    <th className="table-header px-5 py-3 whitespace-nowrap">Timestamp</th>
                    <th className="table-header px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {cases.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-navy-50/60 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-navy-600">V-{c.verificationId}</td>
                      <td className="px-5 py-3 font-medium text-navy-800">{c.travelerName}</td>
                      <td className="px-5 py-3 font-mono text-xs text-navy-600">{c.fiydaId}</td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-accent-amber">{c.finalScore}%</span>
                      </td>
                      <td className="px-5 py-3 text-navy-600">{c.officer}</td>
                      <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{c.time}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openCase(idx)} className="btn-primary text-xs px-3 py-2">
                          <ClipboardCheck size={13} /> Override
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

  const c = cases[selectedIdx];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={backToList} className="btn-secondary">
          <ArrowLeft size={15} /> Back to Overrides
        </button>
        <div>
          <h2 className="text-base font-semibold text-navy-800">Threshold Override V-{c.verificationId}</h2>
          <p className="text-sm text-navy-400">Submitted by {c.officer} at {c.time}</p>
        </div>
        <span className="badge-pending ml-auto"><Clock size={12} /> Awaiting Decision</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Traveler Information */}
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
            <DetailRow icon={User} label="Gender" value={c.gender} />
            <DetailRow icon={User} label="Date of Birth" value={c.dob} />
            <DetailRow icon={ShieldCheck} label="Current Status" value={c.status.replace(/_/g, ' ')} />
          </div>
        </div>

        {/* Verification Scores */}
        <div className="card p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-4">Biometric Verification Scores</h3>
          <div className="space-y-3">
            <BigScore label="Fingerprint Match Score" value={c.fingerprintScore} icon={Fingerprint} />
            <BigScore label="Iris Match Score" value={c.irisScore} icon={ScanEye} />
            <BigScore label="Final Confidence Score" value={c.finalScore} icon={Cpu} highlight />
          </div>
        </div>

        {/* Supervisor Decision */}
        <div className="card p-5 lg:col-span-4">
          <h3 className="text-sm font-semibold text-navy-800 mb-4">Supervisor Action</h3>
          <div className="mb-4">
            <label className="label">Override Decision</label>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => setDecision('VERIFIED')} className={`btn-secondary ${decision === 'VERIFIED' ? 'bg-accent-green text-white hover:bg-green-600' : ''}`}>
                <CheckCircle2 size={16} /> Approve & Verify Traveler
              </button>
              <button onClick={() => setDecision('REJECTED')} className={`btn-secondary ${decision === 'REJECTED' ? 'bg-accent-red text-white hover:bg-red-600' : ''}`}>
                <XCircle size={16} /> Reject Traveler
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="label">Decision Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={6}
              className="input resize-none"
              placeholder="State rationale for overriding system decision (required)..."
              required
            />
          </div>

          {submitError && (
            <div className="mb-3 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {submitError}
            </div>
          )}

          <button
            onClick={submitDecision}
            disabled={!decision || !reason.trim() || submitting}
            className="w-full btn-primary py-3 text-sm font-semibold disabled:bg-navy-200 disabled:text-navy-400 disabled:cursor-not-allowed"
          >
            {submitting ? <><Loader2 size={15} className="animate-spin" /> Overriding...</> : <><MessageSquare size={15} /> Confirm Override</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="label flex items-center gap-1.5"><Icon size={12} /> {label}</div>
      <div className="text-sm font-medium text-navy-800 text-right">{value}</div>
    </div>
  );
}

function BigScore({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: typeof Fingerprint; highlight?: boolean }) {
  const color = value >= 95 ? '#16a34a' : value >= 90 ? '#d97706' : '#dc2626';
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-navy-300 bg-white shadow-card' : 'border-navy-100 bg-white'}`}>
      <div className="flex items-center gap-2 text-navy-500">
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-bold" style={{ color }}>{value}%</div>
    </div>
  );
}
