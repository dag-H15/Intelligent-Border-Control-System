import type { VerificationResult } from '../types';
import { CheckCircle2, XCircle, Clock, Info } from 'lucide-react';

const config = {
  verified: { cls: 'badge-verified', icon: CheckCircle2, label: 'Verified' },
  rejected: { cls: 'badge-rejected', icon: XCircle, label: 'Rejected' },
  pending: { cls: 'badge-pending', icon: Clock, label: 'Pending Review' },
  info: { cls: 'badge-info', icon: Info, label: 'Info' },
};

export function StatusBadge({ status }: { status: VerificationResult | 'info' }) {
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={c.cls}>
      <Icon size={12} strokeWidth={2.5} />
      {c.label}
    </span>
  );
}
