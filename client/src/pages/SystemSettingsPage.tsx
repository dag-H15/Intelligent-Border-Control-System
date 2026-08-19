import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getApiErrorMessage } from '../services/api';
import { checkpointService, type Checkpoint } from '../services/checkpointService';
import { Save, ShieldCheck, Lock, Clock, AlertCircle, CheckCircle2, Loader2, MapPin, Plus, Edit2, Trash2, X } from 'lucide-react';

export function SystemSettingsPage() {
  const [approval, setApproval] = useState(95);
  const [reviewMin, setReviewMin] = useState(85);
  const [reviewMax, setReviewMax] = useState(94);
  const [timeout, setSessionTimeout] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(5);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checkpoint Management State
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(true);
  const [checkpointsError, setCheckpointsError] = useState('');
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [editingCheckpoint, setEditingCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointLocation, setCheckpointLocation] = useState('');
  const [checkpointSubmitting, setCheckpointSubmitting] = useState(false);
  const [checkpointModalError, setCheckpointModalError] = useState('');

  const computedReject = reviewMin;

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        const data = res.data;
        if (data) {
          if (data.approvalThreshold) setApproval(Number(data.approvalThreshold));
          if (data.reviewRangeMin) setReviewMin(Number(data.reviewRangeMin));
          if (data.reviewRangeMax) setReviewMax(Number(data.reviewRangeMax));
          if (data.sessionTimeout) setSessionTimeout(Number(data.sessionTimeout));
          if (data.maxLoginAttempts) setMaxAttempts(Number(data.maxLoginAttempts));
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, 'Failed to load system settings from server.'));
        setLoading(false);
      });

    // Load checkpoints
    loadCheckpoints();
  }, []);

  const loadCheckpoints = async () => {
    setCheckpointsLoading(true);
    setCheckpointsError('');
    try {
      const data = await checkpointService.getAll();
      setCheckpoints(data);
    } catch (err) {
      setCheckpointsError('Failed to load checkpoints.');
    } finally {
      setCheckpointsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const payload = {
        approvalThreshold: approval,
        reviewRangeMin: reviewMin,
        reviewRangeMax: reviewMax,
        sessionTimeout: timeout,
        maxLoginAttempts: maxAttempts,
      };

      const res = await api.put('/settings', payload);
      if (res.data?.sessionTimeout) {
        localStorage.setItem('iabc_session_timeout', String(res.data.sessionTimeout));
      }

      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save settings to server.'));
    } finally {
      setSaving(false);
    }
  };

  const openCheckpointModal = (checkpoint?: Checkpoint) => {
    if (checkpoint) {
      setEditingCheckpoint(checkpoint);
      setCheckpointName(checkpoint.name);
      setCheckpointLocation(checkpoint.location);
    } else {
      setEditingCheckpoint(null);
      setCheckpointName('');
      setCheckpointLocation('');
    }
    setCheckpointModalError('');
    setShowCheckpointModal(true);
  };

  const closeCheckpointModal = () => {
    setShowCheckpointModal(false);
    setEditingCheckpoint(null);
    setCheckpointName('');
    setCheckpointLocation('');
    setCheckpointModalError('');
  };

  const handleCheckpointSubmit = async () => {
    if (!checkpointName.trim() || !checkpointLocation.trim()) {
      setCheckpointModalError('Name and location are required.');
      return;
    }

    setCheckpointSubmitting(true);
    setCheckpointModalError('');

    try {
      if (editingCheckpoint) {
        await checkpointService.update(editingCheckpoint.id, {
          name: checkpointName.trim(),
          location: checkpointLocation.trim(),
        });
      } else {
        await checkpointService.create({
          name: checkpointName.trim(),
          location: checkpointLocation.trim(),
        });
      }
      await loadCheckpoints();
      closeCheckpointModal();
    } catch (err) {
      setCheckpointModalError(getApiErrorMessage(err, 'Failed to save checkpoint.'));
    } finally {
      setCheckpointSubmitting(false);
    }
  };

  const handleToggleCheckpointStatus = async (checkpoint: Checkpoint) => {
    try {
      await checkpointService.update(checkpoint.id, {
        isActive: !checkpoint.isActive,
      });
      await loadCheckpoints();
    } catch (err) {
      setCheckpointsError(getApiErrorMessage(err, 'Failed to update checkpoint status.'));
    }
  };

  const handleDeactivateCheckpoint = async (checkpoint: Checkpoint) => {
    if (!confirm(`Deactivate checkpoint "${checkpoint.name}"? This will mark it as inactive.`)) {
      return;
    }
    try {
      await checkpointService.deactivate(checkpoint.id);
      await loadCheckpoints();
    } catch (err) {
      setCheckpointsError(getApiErrorMessage(err, 'Failed to deactivate checkpoint.'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-navy-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading system settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy-800">System Settings</h2>
          <p className="text-sm text-navy-400">Configure decision thresholds and security parameters</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save size={16} /> Save Settings
            </>
          )}
        </button>
      </div>

      {saved && (
        <div className="card bg-accent-green-soft border-green-200 p-4 flex items-center gap-2 text-sm text-accent-green">
          <CheckCircle2 size={16} /> Settings saved successfully. Changes are persisted in database and logged in audit trail.
        </div>
      )}

      {error && (
        <div className="card bg-accent-red-soft border-red-200 p-4 flex items-center gap-2 text-sm text-accent-red">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Threshold settings */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-navy-800">Decision Engine Thresholds</h3>
        </div>
        <p className="text-xs text-navy-400 mb-5">Confidence score ranges that determine automatic decisions and supervisor escalation.</p>

        {/* Visual threshold bar */}
        <div className="mb-6">
          <div className="relative h-4 rounded-full overflow-hidden bg-navy-100">
            <div className="absolute inset-y-0 left-0 bg-accent-red" style={{ width: `${Math.min(100, Math.max(0, computedReject))}%` }} />
            <div
              className="absolute inset-y-0 bg-accent-amber"
              style={{
                left: `${Math.min(100, Math.max(0, computedReject))}%`,
                width: `${Math.min(100, Math.max(0, approval - computedReject))}%`,
              }}
            />
            <div
              className="absolute inset-y-0 bg-accent-green"
              style={{ left: `${Math.min(100, Math.max(0, approval))}%`, right: 0 }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-navy-500 font-medium mt-1.5">
            <span>0% · Auto Reject</span>
            <span>Review Range ({reviewMin}%–{reviewMax}%)</span>
            <span>100% · Auto Approve (≥ {approval}%)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ThresholdInput
            label="Automatic Approval"
            value={approval}
            onChange={setApproval}
            min={reviewMax}
            max={100}
            suffix="%"
            tone="green"
            hint={`Confidence ≥ ${approval}% auto-approves`}
          />
          <div className="rounded-lg border border-navy-200 p-4">
            <div className="label">Supervisor Review Range</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={reviewMin}
                onChange={(e) => setReviewMin(Number(e.target.value))}
                min={0}
                max={reviewMax}
                className="input text-center font-semibold"
              />
              <span className="text-navy-400 font-medium">to</span>
              <input
                type="number"
                value={reviewMax}
                onChange={(e) => setReviewMax(Number(e.target.value))}
                min={reviewMin}
                max={approval}
                className="input text-center font-semibold"
              />
            </div>
            <p className="text-xs text-accent-amber mt-2 flex items-center gap-1">
              <AlertCircle size={11} /> Scores in this range escalate to supervisor
            </p>
          </div>
          <div className="rounded-lg border border-navy-200 p-4 bg-accent-red-soft/30">
            <div className="label">Automatic Rejection</div>
            <div className="text-2xl font-bold text-accent-red">&lt; {computedReject}%</div>
            <p className="text-xs text-navy-500 mt-2">Derived from review range minimum. Scores below this value are auto-rejected.</p>
          </div>
        </div>
      </div>

      {/* Security settings */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-navy-800">Security Settings</h3>
        </div>
        <p className="text-xs text-navy-400 mb-5">Authentication and session security policies.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ThresholdInput
            label="Session Timeout (minutes)"
            value={timeout}
            onChange={setSessionTimeout}
            min={1}
            max={1440}
            tone="navy"
            icon={Clock}
            hint="Auto-logout after inactivity"
          />
          <ThresholdInput
            label="Max Login Attempts"
            value={maxAttempts}
            onChange={setMaxAttempts}
            min={1}
            max={20}
            tone="navy"
            icon={Lock}
            hint="Account lockout threshold"
          />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-navy-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-navy-800">Two-Factor Authentication</div>
            <div className="text-xs text-navy-400">Required for all admin &amp; supervisor accounts</div>
          </div>
          <span className="badge-verified"><CheckCircle2 size={12} /> Enforced Policy</span>
        </div>
      </div>

      {/* Checkpoint Management */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={18} className="text-navy-700" />
              <h3 className="text-sm font-semibold text-navy-800">Border Checkpoint Management</h3>
            </div>
            <p className="text-xs text-navy-400">Configure and manage border crossing checkpoints.</p>
          </div>
          <button onClick={() => openCheckpointModal()} className="btn-primary text-sm">
            <Plus size={15} /> Add Checkpoint
          </button>
        </div>

        {checkpointsError && (
          <div className="mb-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {checkpointsError}
          </div>
        )}

        {checkpointsLoading ? (
          <div className="flex items-center justify-center py-8 text-navy-400">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading checkpoints...
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="text-center py-8 text-navy-400 text-sm">
            No checkpoints configured. Add your first checkpoint to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checkpoints.map((cp) => (
              <div
                key={cp.id}
                className={`rounded-lg border p-4 ${
                  cp.isActive ? 'border-navy-200 bg-white' : 'border-navy-100 bg-navy-50/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-semibold ${cp.isActive ? 'text-navy-800' : 'text-navy-400'}`}>
                        {cp.name}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          cp.isActive
                            ? 'bg-accent-green-soft text-accent-green'
                            : 'bg-navy-100 text-navy-500'
                        }`}
                      >
                        {cp.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${cp.isActive ? 'text-navy-500' : 'text-navy-400'}`}>
                      {cp.location}
                    </p>
                    <p className="text-[11px] text-navy-400 mt-1.5">
                      Created: {new Date(cp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => openCheckpointModal(cp)}
                      className="h-7 w-7 rounded flex items-center justify-center text-navy-500 hover:bg-navy-100 transition-colors"
                      title="Edit checkpoint"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleCheckpointStatus(cp)}
                      className={`h-7 px-2 rounded text-xs font-semibold transition-colors ${
                        cp.isActive
                          ? 'text-accent-amber hover:bg-accent-amber-soft'
                          : 'text-accent-green hover:bg-accent-green-soft'
                      }`}
                      title={cp.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {cp.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {!cp.isActive && (
                      <button
                        onClick={() => handleDeactivateCheckpoint(cp)}
                        className="h-7 w-7 rounded flex items-center justify-center text-accent-red hover:bg-accent-red-soft transition-colors"
                        title="Delete checkpoint"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Checkpoint Modal */}
      {showCheckpointModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-navy-800">
                {editingCheckpoint ? 'Edit Checkpoint' : 'Add New Checkpoint'}
              </h3>
              <button
                onClick={closeCheckpointModal}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-navy-400 hover:bg-navy-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Checkpoint Name</label>
                <input
                  type="text"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  placeholder="e.g., Bole International Airport"
                  className="input mt-1"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  value={checkpointLocation}
                  onChange={(e) => setCheckpointLocation(e.target.value)}
                  placeholder="e.g., Addis Ababa, Ethiopia"
                  className="input mt-1"
                />
              </div>

              {checkpointModalError && (
                <div className="flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
                  <AlertCircle size={15} /> {checkpointModalError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeCheckpointModal}
                  className="flex-1 btn-secondary"
                  disabled={checkpointSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckpointSubmit}
                  className="flex-1 btn-primary"
                  disabled={checkpointSubmitting || !checkpointName.trim() || !checkpointLocation.trim()}
                >
                  {checkpointSubmitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save size={15} /> {editingCheckpoint ? 'Update' : 'Create'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  tone,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  tone: 'green' | 'navy';
  icon?: typeof Clock;
  hint?: string;
}) {
  const border = tone === 'green' ? 'border-green-200 bg-accent-green-soft/30' : 'border-navy-200';
  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className="text-navy-400" />}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="input text-lg font-bold"
        />
        {suffix && <span className="text-lg font-bold text-navy-700">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-navy-400 mt-2">{hint}</p>}
    </div>
  );
}
