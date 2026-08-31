import { Fingerprint } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' };
  const icon = { sm: 16, md: 20, lg: 28 };
  return (
    <div className={`${dims[size]} rounded-lg bg-navy-800 flex items-center justify-center text-white shrink-0`}>
      <Fingerprint size={icon[size]} />
    </div>
  );
}

export function SystemMark({ compact = false, collapsed = false }: { compact?: boolean; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex items-center justify-center w-full" title="IABC SYSTEM - Border Control">
        <Logo size="md" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Logo size={compact ? 'sm' : 'md'} />
      <div className="leading-tight">
        <div className="text-white font-semibold text-sm tracking-wide">IABC SYSTEM</div>
        <div className="text-navy-300 text-[11px] tracking-wide">Border Control · AI Biometrics</div>
      </div>
    </div>
  );
}
