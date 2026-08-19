import { useState, useEffect } from 'react';
import { manualReviewService } from '../services/manualReviewService';
import type { ManualReviewRecord } from '../types';
import {
  User, Globe, FileText, Fingerprint, ScanEye, Cpu, ShieldCheck,
  CheckCircle2, XCircle, Clock, MessageSquare, ClipboardCheck, ArrowLeft,
  Loader2, AlertCircle, Paperclip, Download, Search, Filter, Calendar
} from 'lucide-react';

export function SupervisorManualReviewPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Pending State
  const [pendingCases, setPendingCases] = useState<ManualReviewRecord[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Decision State
  const [decision, setDecision] = useState<'APPROVED_OVERRIDE' | 'REJECTED' | 'REQUEST_RE_ENROLLMENT' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // History State
  const [historyCases, setHistoryCases] = useState<ManualReviewRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'APPROVED' | 'REJECTED' | 'RE_ENROLLMENT_REQUESTED'>('all');

  useEffect(() => {
    loadPending();
    loadHistory();
  }, []);

  const loadPending = () => {
    setPendingLoading(true);
    manualReviewService
      .getPending()
      .then((data) => {
        setPendingCases(data);
        setPendingLoading(false);
      })
      .catch(() => {
        setPendingError('Failed to load pending manual reviews.');
        setPendingLoading(false);
      });
  };

  const loadHistory = () => {
    setHistoryLoading(true);
    manualReviewService
      .getHistory()
      .then((data) => {
        setHistoryCases(data);
        setHistoryLoading(false);
      })
      .catch(() => {
        setHistoryError('Failed to load manual review history.');
        setHistoryLoading(false);
      });
  };

  const openCase = (idx: number) => {
    setSelectedIdx(idx);
    setDecision(null);
    setNotes('');
    setSubmitError('');
  };

  const backToList = () => setSelectedIdx(null);

  const downloadAttachment = (attachment: ManualReviewRecord['attachments'][number]) => {
    const byteCharacters = atob(attachment.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let index = 0; index < byteCharacters.length; index += 1) {
      byteNumbers[index] = byteCharacters.charCodeAt(index);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: attachment.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.originalName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitDecision = async () => {
    if (selectedIdx === null || !decision || !notes.trim()) return;
    const c = pendingCases[selectedIdx];
    setSubmitting(true);
    setSubmitError('');
    try {
      await manualReviewService.decide(c.id, { decision, notes });
      setPendingCases(pendingCases.filter((_, i) => i !== selectedIdx));
      setSelectedIdx(null);
      setDecision(null);
      setNotes('');
      // Reload history to reflect the new decision
      loadHistory();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to submit decision.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered History
  const filteredHistory = historyCases.filter((c) => {
    const travelerName = c.traveler?.fullName ?? '';
    const fan = c.traveler?.fan ?? '';
    const officerName = c.officer?.name ?? '';
    const matchesSearch =
      travelerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      officerName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Injury Manual Review Center</h2>
        <p className="text-sm text-navy-400 mt-0.5">Manage exception cases, view supporting documents, and track review histories.</p>
      </div>

      {selectedIdx === null ? (
        <>
          {/* Tabs Navigation */}
          <div className="flex border-b border-navy-100">
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-3 text-sm font-semibold px-4 border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-navy-800 text-navy-800'
                  : 'border-transparent text-navy-400 hover:text-navy-600'
              }`}
            >
              Pending Requests ({pendingCases.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3 text-sm font-semibold px-4 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-navy-800 text-navy-800'
                  : 'border-transparent text-navy-400 hover:text-navy-600'
              }`}
            >
              Decision History ({historyCases.length})
            </button>
          </div>

          {/* Pending Requests Tab */}
          {activeTab === 'pending' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                {pendingLoading ? (
                  <div className="flex items-center justify-center py-12 text-navy-400">
                    <Loader2 size={20} className="animate-spin mr-2" /> Loading...
                  </div>
                ) : pendingError ? (
                  <div className="flex items-center justify-center py-12 text-accent-red">
                    <AlertCircle size={18} className="mr-2" /> {pendingError}
                  </div>
                ) : pendingCases.length === 0 ? (
                  <div className="py-12 text-center text-navy-400 text-sm">No pending injury manual reviews.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-navy-50">
                      <tr>
                        <th className="table-header px-5 py-3">Request ID</th>
                        <th className="table-header px-5 py-3">Traveler</th>
                        <th className="table-header px-5 py-3">Reason</th>
                        <th className="table-header px-5 py-3">Officer</th>
                        <th className="table-header px-5 py-3">Submitted</th>
                        <th className="table-header px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-100">
                      {pendingCases.map((c, idx) => (
                        <tr key={c.id} className="hover:bg-navy-50/60 transition-colors">
                          <td className="px-5 py-3 font-mono text-xs text-navy-600">MR-{c.id}</td>
                          <td className="px-5 py-3 font-medium text-navy-800">{c.traveler?.fullName ?? 'Unknown traveler'}</td>
                          <td className="px-5 py-3 text-navy-600">{c.reason.replace(/_/g, ' ')}</td>
                          <td className="px-5 py-3 text-navy-600">{c.officer?.name ?? 'Unknown officer'}</td>
                          <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{new Date(c.createdAt).toLocaleString()}</td>
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
          )}

          {/* Decision History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* History Search & Filter Toolbar */}
              <div className="card px-5 py-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
                <div className="relative md:w-80">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search traveler, FAN, or officer..."
                    className="input pl-10"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter size={15} className="text-navy-400" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
                    >
                      <option value="all">All Decisions</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="RE_ENROLLMENT_REQUESTED">Re-enrollment Requested</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* History Table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-12 text-navy-400">
                      <Loader2 size={20} className="animate-spin mr-2" /> Loading...
                    </div>
                  ) : historyError ? (
                    <div className="flex items-center justify-center py-12 text-accent-red">
                      <AlertCircle size={18} className="mr-2" /> {historyError}
                    </div>
                  ) : filteredHistory.length === 0 ? (
                    <div className="py-12 text-center text-navy-400 text-sm">No decisions found.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-navy-50">
                        <tr>
                          <th className="table-header px-5 py-3">Request ID</th>
                          <th className="table-header px-5 py-3">Traveler</th>
                          <th className="table-header px-5 py-3">Officer</th>
                          <th className="table-header px-5 py-3">Supervisor Notes</th>
                          <th className="table-header px-5 py-3">Submitted</th>
                          <th className="table-header px-5 py-3">Reviewed</th>
                          <th className="table-header px-5 py-3">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-100">
                        {filteredHistory.map((c) => (
                          <tr key={c.id} className="hover:bg-navy-50/60 transition-colors">
                            <td className="px-5 py-3 font-mono text-xs text-navy-600">MR-{c.id}</td>
                            <td className="px-5 py-3">
                              <div className="font-medium text-navy-800">{c.traveler?.fullName ?? 'Unknown traveler'}</div>
                              <div className="text-xs text-navy-400 font-mono">{c.traveler?.fan ?? '—'}</div>
                            </td>
                            <td className="px-5 py-3 text-navy-600">{c.officer?.name ?? 'Unknown officer'}</td>
                            <td className="px-5 py-3 text-navy-600 max-w-[200px] truncate" title={c.supervisorNotes ?? ''}>
                              {c.supervisorNotes ?? '—'}
                            </td>
                            <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString()}</td>
                            <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{new Date(c.updatedAt).toLocaleDateString()}</td>
                            <td className="px-5 py-3">
                              <span className={
                                c.status === 'APPROVED'
                                  ? 'badge-verified'
                                  : c.status === 'REJECTED'
                                  ? 'badge-rejected'
                                  : 'badge-pending'
                              }>
                                {c.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Detailed View for Pending Request */
        (() => {
          const c = pendingCases[selectedIdx];
          const attachments = c.attachments ?? [];
          return (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={backToList} className="btn-secondary">
                  <ArrowLeft size={15} /> Back to Requests
                </button>
                <div>
                  <h2 className="text-base font-semibold text-navy-800">Manual Review MR-{c.id}</h2>
                  <p className="text-sm text-navy-400">Submitted by {c.officer?.name ?? 'Unknown officer'} at {new Date(c.createdAt).toLocaleString()}</p>
                </div>
                <span className="badge-pending ml-auto"><Clock size={12} /> Awaiting Decision</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Traveler Info */}
                <div className="card p-5 lg:col-span-4">
                  <h3 className="text-sm font-semibold text-navy-800 mb-4">Traveler Information</h3>
                  <div className="flex flex-col items-center">
                    <div className="h-36 w-28 rounded-xl border border-navy-200 bg-navy-50 flex items-center justify-center">
                      <User size={40} className="text-navy-300" />
                    </div>
                    <div className="mt-3 text-center">
                      <div className="text-sm font-semibold text-navy-800">{c.traveler?.fullName ?? 'Unknown traveler'}</div>
                      <div className="text-xs text-navy-400 font-mono mt-0.5">{c.traveler?.fan ?? '—'}</div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 border-t border-navy-100 pt-4">
                    <DetailRow icon={Globe} label="Enrollment Status" value={c.traveler?.enrollmentStatus ?? '—'} />
                    <DetailRow icon={ShieldCheck} label="Reason" value={c.reason.replace(/_/g, ' ')} />
                    <DetailRow icon={FileText} label="Officer Notes" value={c.officerNotes} />
                  </div>
                </div>

                {/* Verification Context & Scores */}
                <div className="card p-5 lg:col-span-4 space-y-6">
                  {c.verification && (
                    <>
                      <div>
                        <h3 className="text-sm font-semibold text-navy-800 mb-3">Verification Context</h3>
                        <div className="space-y-2.5 bg-navy-50/50 rounded-xl p-3.5 border border-navy-100">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Direction</span>
                            <span className="font-bold text-navy-800">{c.verification.direction || '—'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Checkpoint</span>
                            <span className="font-bold text-navy-800">{c.verification.checkpoint?.name || '—'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Alert Status</span>
                            <span className={`font-bold ${
                              c.verification.alertStatusAtVerification === 'CRITICAL' 
                                ? 'text-accent-red' 
                                : c.verification.alertStatusAtVerification === 'WARNING' 
                                ? 'text-accent-amber' 
                                : 'text-accent-green'
                            }`}>
                              {c.verification.alertStatusAtVerification || 'NONE'}
                            </span>
                          </div>
                          {c.verification.alertReasonAtVerification && (
                            <div className="flex flex-col gap-1 text-xs pt-1 border-t border-navy-200">
                              <span className="text-navy-500 uppercase tracking-wider font-semibold">Alert Reason</span>
                              <span className="font-medium text-navy-700 text-[11px]">{c.verification.alertReasonAtVerification}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs pt-1 border-t border-navy-200">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Threshold Used</span>
                            <span className="font-bold text-navy-800">{c.verification.threshold || 95}%</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-navy-800 mb-3">AI Biometric Match Scores</h3>
                        <div className="space-y-2.5 bg-navy-50/50 rounded-xl p-3.5 border border-navy-100">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Fingerprint Score</span>
                            <span className="font-bold text-navy-800">{c.verification.fingerprintScore}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-500 uppercase tracking-wider font-semibold">Iris Score</span>
                            <span className="font-bold text-navy-800">{c.verification.irisScore}%</span>
                          </div>
                          <div className="h-px bg-navy-200 my-1" />
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-800 font-bold uppercase tracking-wider">Overall Score</span>
                            <span className="font-bold text-accent-amber">{c.verification.finalScore}%</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-navy-800 mb-3 font-sans">Supporting Documents</h3>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-navy-400 mb-2">Uploaded Attachments</h4>
                    {attachments.length === 0 ? (
                      <div className="text-sm text-navy-400">No attachments uploaded.</div>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map((attachment, index) => (
                          <div key={`${attachment.originalName}-${index}`} className="flex items-center justify-between rounded-lg border border-navy-100 px-3 py-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip size={14} className="text-navy-400 shrink-0" />
                              <span className="truncate text-navy-700">{attachment.originalName}</span>
                            </div>
                            <button onClick={() => downloadAttachment(attachment)} className="text-xs text-accent-blue flex items-center gap-1">
                              <Download size={12} /> Download
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision Panel */}
                <div className="card p-5 lg:col-span-4">
                  <h3 className="text-sm font-semibold text-navy-800 mb-4">Supervisor Decision</h3>
                  <div className="mb-4">
                    <label className="label">Decision</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button onClick={() => setDecision('APPROVED_OVERRIDE')} className={`btn-secondary ${decision === 'APPROVED_OVERRIDE' ? 'bg-accent-green text-white hover:bg-green-600' : ''}`}>
                        <CheckCircle2 size={16} /> Approve
                      </button>
                      <button onClick={() => setDecision('REJECTED')} className={`btn-secondary ${decision === 'REJECTED' ? 'bg-accent-red text-white hover:bg-red-600' : ''}`}>
                        <XCircle size={16} /> Reject
                      </button>
                      <button onClick={() => setDecision('REQUEST_RE_ENROLLMENT')} className={`btn-secondary ${decision === 'REQUEST_RE_ENROLLMENT' ? 'bg-navy-800 text-white hover:bg-navy-700' : ''}`}>
                        <MessageSquare size={16} /> Request Re-enrollment
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="label">Review Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={6}
                      className="input resize-none"
                      placeholder="Add supervisor review notes and rationale (required)."
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
                    disabled={!decision || !notes.trim() || submitting}
                    className="w-full btn-primary py-3 text-sm font-semibold disabled:bg-navy-200 disabled:text-navy-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting...</> : <><MessageSquare size={15} /> Submit Decision</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="label flex items-center gap-1.5"><Icon size={12} /> {label}</div>
      <div className="text-sm font-medium text-navy-800 bg-navy-50/50 rounded-lg p-2 border border-navy-100">{value}</div>
    </div>
  );
}
