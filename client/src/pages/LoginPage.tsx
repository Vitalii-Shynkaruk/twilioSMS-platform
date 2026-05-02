import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpChannel, useAuthStore } from '../stores/authStore';
import { KeyRound, Mail, RefreshCw, Send, Shield, Smartphone } from 'lucide-react';

type LoginStep = 'email' | 'code';

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function getRedirectPath(role?: string) {
  return role === 'REP' ? '/pipeline' : '/command-center';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<LoginStep>('email');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [maskedDestination, setMaskedDestination] = useState('');
  const [expiresRemaining, setExpiresRemaining] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(0);
  const [error, setError] = useState('');
  const { requestOtp, verifyOtp, isLoginLoading, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getRedirectPath(user?.role), { replace: true });
    }
  }, [isAuthenticated, navigate, user?.role]);

  useEffect(() => {
    if (expiresRemaining <= 0 && resendRemaining <= 0) return;
    const intervalId = window.setInterval(() => {
      setExpiresRemaining((value) => Math.max(0, value - 1));
      setResendRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [expiresRemaining, resendRemaining]);

  const parseOtpError = (err: any, fallback: string) => {
    const response = err?.response?.data;
    if (response?.retryAfterSeconds) {
      setResendRemaining(Math.max(1, Number(response.retryAfterSeconds)));
    }
    if (err?.response?.status >= 500) {
      return 'Sign-in service is temporarily unavailable. Please try again.';
    }
    return response?.error || err.message || fallback;
  };

  const sendCode = async (nextChannel: OtpChannel = 'sms') => {
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);

    try {
      const response = await requestOtp(normalizedEmail, nextChannel);
      setChannel(nextChannel);
      setMaskedDestination(response.maskedDestination);
      setExpiresRemaining(response.expiresInSeconds || 300);
      setResendRemaining(60);
      setCode('');
      setStep('code');
    } catch (err: any) {
      setError(parseOtpError(err, 'Unable to send sign-in code'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 'email') {
      await sendCode('sms');
      return;
    }

    try {
      const signedInUser = await verifyOtp(email.trim().toLowerCase(), code);
      navigate(getRedirectPath(signedInUser.role), { replace: true });
    } catch (err: any) {
      setError(parseOtpError(err, 'Invalid or expired sign-in code'));
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ backgroundColor: '#070b14' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(184, 150, 62, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(184, 150, 62, 0.4) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-lg mb-5"
            style={{ backgroundColor: '#b8963e' }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#dce4ef' }}>
            Secure Credit Lines
          </h1>
          <p className="text-sm mt-2 font-medium tracking-wide uppercase" style={{ color: '#4e6a8a' }}>
            SMS Management Platform
          </p>
        </div>

        <section
          className="rounded-lg border p-8 backdrop-blur-sm"
          style={{
            backgroundColor: 'rgba(20, 32, 56, 0.8)',
            borderColor: 'rgba(40, 59, 82, 0.5)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="flex items-center gap-2 mb-6">
            {step === 'email' ? (
              <Smartphone className="w-4 h-4" style={{ color: '#b8963e' }} />
            ) : (
              <KeyRound className="w-4 h-4" style={{ color: '#b8963e' }} />
            )}
            <h2 className="text-lg font-semibold" style={{ color: '#b8c9df' }}>
              {step === 'email' ? 'Sign in with a code' : 'Enter your sign-in code'}
            </h2>
          </div>

          {error && (
            <div
              id="login-error"
              aria-live="polite"
              className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1.5" style={{ color: '#6b87a8' }}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@securecreditlines.com"
                required
                autoFocus
                autoComplete="email"
                disabled={step === 'code'}
                aria-invalid={!!error && step === 'email'}
                aria-describedby={error && step === 'email' ? 'login-error' : undefined}
              />
            </div>

            {step === 'code' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-code" className="block text-sm font-medium" style={{ color: '#6b87a8' }}>
                    6-digit code
                  </label>
                  <span className="text-xs" style={{ color: '#6b87a8' }}>
                    {formatCountdown(expiresRemaining)}
                  </span>
                </div>
                <input
                  id="login-code"
                  type="text"
                  className="input text-center tracking-[0.4em] font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-invalid={!!error && step === 'code'}
                  aria-describedby={error && step === 'code' ? 'login-error' : undefined}
                />
                <p className="text-xs mt-2" style={{ color: '#4e6a8a' }}>
                  Sent to {maskedDestination}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoginLoading || !email || (step === 'code' && code.length !== 6)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#b8963e',
                boxShadow: '0 4px 14px rgba(184, 150, 62, 0.25)',
              }}
            >
              {isLoginLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {step === 'email' ? <Send className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                  {step === 'email' ? 'Send code' : 'Verify code'}
                </>
              )}
            </button>

            {step === 'email' && (
              <button
                type="button"
                onClick={() => sendCode('email')}
                disabled={isLoginLoading || !email}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: '#8ea6c4' }}
              >
                <Mail className="w-4 h-4" />
                Lost access to your phone? Use email instead
              </button>
            )}

            {step === 'code' && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => sendCode(channel)}
                  disabled={isLoginLoading || resendRemaining > 0}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#8ea6c4' }}
                >
                  <RefreshCw className="w-4 h-4" />
                  {resendRemaining > 0 ? `Resend in ${formatCountdown(resendRemaining)}` : 'Resend code'}
                </button>

                {channel === 'sms' && (
                  <button
                    type="button"
                    onClick={() => sendCode('email')}
                    disabled={isLoginLoading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: '#8ea6c4' }}
                  >
                    <Mail className="w-4 h-4" />
                    Lost access to your phone? Use email instead
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError('');
                    setMaskedDestination('');
                  }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#4e6a8a' }}
                >
                  Change email
                </button>
              </div>
            )}
          </form>

          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(40, 59, 82, 0.5)' }}>
            <p className="text-xs text-center" style={{ color: '#3a526d' }}>
              Contact your administrator if you need access
            </p>
          </div>
        </section>

        <p className="text-xs text-center mt-8" style={{ color: '#283b52' }}>
          &copy; {new Date().getFullYear()} Secure Credit Lines. All rights reserved.
        </p>
      </div>
    </main>
  );
}
