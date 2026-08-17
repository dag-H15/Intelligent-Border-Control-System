import { useState } from 'react';
import { travelerService } from '../services/travelerService';
import { manualReviewService } from '../services/manualReviewService';
import type { Traveler, ManualReviewReason } from '../types';
import {
  Search, Loader2, AlertCircle, CheckCircle2, User, Globe, Calendar, FileText,
  Upload, Paperclip, X, FileUp
} from 'lucide-react';

type InjuryReasonKey = 'FINGERPRINT_INJURY' | 'BURNED_FINGER' | 'MISSING_FINGER' | 'IRIS_INJURY' | 'BIOMETRIC_UNAVAILABLE';

const REASON_MAPPINGS: Record<InjuryReasonKey, { label: string; dbReason: ManualReviewReason }> = {
  FINGERPRINT_INJURY: { label: 'Fingerprint injury', dbReason: 'FINGERPRINT_INJURY' },
  BURNED_FINGER: { label: 'Burned finger', dbReason: 'FINGERPRINT_INJURY' },
  MISSING_FINGER: { label: 'Missing finger', dbReason: 'FINGERPRINT_INJURY' },
  IRIS_INJURY: { label: 'Iris injury', dbReason: 'IRIS_INJURY' },
  BIOMETRIC_UNAVAILABLE: { label: 'Biometric temporarily unavailable', dbReason: 'BIOMETRIC_UNAVAILABLE' },
};

export function OfficerManualReviewPage() {
  const [fiydaId, setFiydaId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [traveler, setTraveler] = useState<Traveler | null>(null);

  // Form State
  const [selectedReasonKey, setSelectedReasonKey] = useState<InjuryReasonKey>('BIOMETRIC_UNAVAILABLE');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLookup = async () => {
    if (!fiydaId.trim()) {
      setLookupError('Please enter a Fiyda ID.');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    setTraveler(null);
    setFormSuccess('');
    setFormError('');
    try {
      const data = await travelerService.lookup(fiydaId.trim());
      setTraveler(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Traveler not found.';
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selectedFiles = Array.from(e.target.files);
    
    // Validations: up to 5 files, max 10MB each, PDF/JPG/PNG only
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    
    const validated: File[] = [];
    let err = '';

    if (files.length + selectedFiles.length > 5) {
      setFormError('You can upload a maximum of 5 files.');
      return;
    }

    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(file.type)) {
        err = `Invalid file format for "${file.name}". Only PDF, JPG, and PNG are allowed.`;
        break;
      }
      if (file.size > maxSizeBytes) {
        err = `File "${file.name}" exceeds the 10 MB limit.`;
        break;
      }
      validated.push(file);
    }

    if (err) {
      setFormError(err);
    } else {
      setFormError('');
      setFiles((prev) => [...prev, ...validated]);
    }

    // Reset input
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!traveler) return;
    if (!notes.trim()) {
      setFormError('Officer notes are required.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const mapped = REASON_MAPPINGS[selectedReasonKey];
      await manualReviewService.create({
        travelerId: traveler.id,
        reason: mapped.dbReason,
        officerNotes: notes.trim(),
        attachments: files,
      });

      setFormSuccess('Manual review request successfully submitted to supervisor.');
      // Reset form
      setNotes('');
      setFiles([]);
      setTraveler(null);
      setFiydaId('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to submit manual review request.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Officer Manual Review</h2>
        <p className="text-sm text-navy-400 mt-0.5">Submit travelers with injuries or biometric issues for supervisor review.</p>
      </div>

      {/* Traveler Search Card */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Search size={18} className="text-navy-800" />
          <h3 className="text-sm font-semibold text-navy-800">Lookup Traveler</h3>
        </div>
        <p className="text-xs text-navy-400 mb-4">Enter Fiyda ID to retrieve traveler data before submitting review request.</p>
        
        <div className="flex flex-col sm:flex-row gap-3">
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
            {lookupLoading ? <><Loader2 size={16} className="animate-spin" /> Searching...</> : <><Search size={16} /> Search Traveler</>}
          </button>
        </div>
        
        {lookupError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {lookupError}
          </div>
        )}
      </div>

      {/* Manual Review Details Card & Demographics */}
      {traveler && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Demographic Card */}
          <div className="card p-6 lg:col-span-4 h-fit">
            <h3 className="text-sm font-semibold text-navy-800 mb-4">Traveler Information</h3>
            <div className="flex flex-col items-center">
              <div className="h-40 w-32 rounded-xl border border-navy-200 bg-navy-50 overflow-hidden flex items-center justify-center">
                {traveler.photo ? (
                  <img src={traveler.photo} alt={traveler.fullName} className="h-full w-full object-cover" />
                ) : (
                  <User size={40} className="text-navy-300" />
                )}
              </div>
              <div className="mt-3 text-center">
                <div className="text-sm font-semibold text-navy-800">{traveler.fullName}</div>
                <div className="text-xs text-navy-400 font-mono mt-0.5">{traveler.fan}</div>
              </div>
            </div>
            
            <div className="mt-5 space-y-3 border-t border-navy-100 pt-4">
              <InfoField icon={Globe} label="Nationality" value={traveler.nationality} />
              <InfoField icon={Calendar} label="Date of Birth" value={traveler.dateOfBirth} />
              <InfoField icon={User} label="Gender" value={traveler.gender} />
            </div>
          </div>

          {/* Form Card */}
          <div className="card p-6 lg:col-span-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-navy-800" />
              <h3 className="text-sm font-semibold text-navy-800">Submit Manual Review Request</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Manual Review Reason</label>
                <select
                  value={selectedReasonKey}
                  onChange={(e) => setSelectedReasonKey(e.target.value as InjuryReasonKey)}
                  className="input"
                >
                  {Object.entries(REASON_MAPPINGS).map(([key, item]) => (
                    <option key={key} value={key}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Officer Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe the biometric injury or exception details (required)..."
                  className="input resize-none"
                  required
                />
              </div>

              <div>
                <label className="label">Supporting Documents (PDF, JPG, PNG · Max 5 files · ≤ 10 MB per file)</label>
                <div className="mt-1 flex items-center justify-center rounded-xl border-2 border-dashed border-navy-200 px-6 py-6 hover:border-navy-300 transition-colors bg-navy-50/40">
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-navy-400" />
                    <div className="mt-2.5 flex text-xs text-navy-600 justify-center">
                      <label className="relative cursor-pointer rounded-md font-semibold text-accent-blue hover:text-accent-blue/80 focus-within:outline-none">
                        <span>Upload files</span>
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                  </div>
                </div>

                {/* Uploaded Files List */}
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-navy-100 px-3 py-2 text-sm bg-white">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip size={14} className="text-navy-400 shrink-0" />
                          <span className="truncate text-navy-700">{file.name}</span>
                          <span className="text-[10px] text-navy-400">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-navy-400 hover:text-accent-red transition-colors"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !notes.trim()}
                className="btn-primary w-full py-3 text-sm font-semibold disabled:bg-navy-200 disabled:text-navy-400 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting Request...</>
                ) : (
                  <><FileUp size={16} /> Submit to Supervisor</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {formSuccess && (
        <div className="flex items-center gap-2 text-sm text-accent-green bg-accent-green-soft rounded-lg px-3 py-2.5">
          <CheckCircle2 size={16} /> {formSuccess}
        </div>
      )}
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="label flex items-center gap-1.5"><Icon size={12} /> {label}</div>
      <div className="text-sm font-medium text-navy-800">{value}</div>
    </div>
  );
}
