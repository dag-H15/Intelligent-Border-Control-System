import { Fingerprint } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' };
  const icon = { sm: 16, md: 20, lg: 28 };
  return (
    <div
      className={`${dims[size]} rounded-lg flex items-center justify-center text-white shrink-0`}
      style={{ backgroundColor: '#006341' }}
    >
      <Fingerprint size={icon[size]} />
    </div>
  );
}

export function SystemMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={compact ? 'sm' : 'md'} />
      <div className="leading-tight">
        <div className="text-white font-bold text-sm tracking-wide">AeroControl Sentinel</div>
        <div className="text-[11px] tracking-wide" style={{ color: '#7aa892' }}>Border Control · AI Biometrics</div>
      </div>
    </div>
  );
}

