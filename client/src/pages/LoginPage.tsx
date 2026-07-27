import { useState } from 'react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, Loader2, AlertCircle, Clock } from 'lucide-react';

export function LoginPage() {
  const { login, loading, error, sessionExpiredMessage, clearError, clearSessionExpiredMessage } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, pw);
    } catch {
      /* error is set in context */
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo + system name */}
        <div className="flex flex-col items-center text-center mb-8">
          <Logo size="lg" />
          <div className="mt-4">
            <div className="text-lg font-semibold tracking-wide">IABC SYSTEM</div>
            <div className="text-navy-300 text-xs mt-0.5">Intelligent Automated Border Control</div>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="card bg-white p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-navy-800">Secure Sign-In</h1>
            <p className="text-sm text-navy-400 mt-1">Enter your government credentials to continue.</p>
          </div>

          {sessionExpiredMessage && (
            <div className="mb-4 flex items-center gap-2 text-sm text-accent-amber bg-accent-amber-soft rounded-lg px-3 py-2 border border-amber-200">
              <Clock size={16} /> {sessionExpiredMessage}
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2 border border-red-200">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Official Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                    clearSessionExpiredMessage();
                  }}
                  className="input pl-10"
                  placeholder="name@border.gov"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Password</label>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => {
                    setPw(e.target.value);
                    clearError();
                    clearSessionExpiredMessage();
                  }}
                  className="input pl-10 pr-10"
                  placeholder="••••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-500"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Authenticate &amp; Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-navy-400 text-xs mt-6">
          Unauthorized access is prohibited under Federal Cybersecurity Regulation §4.12.
          <br />All authentication attempts are recorded and monitored.
        </p>
      </div>
    </div>
  );
}
