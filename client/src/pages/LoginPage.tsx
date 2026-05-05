import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OtpChannel, useAuthStore } from '../stores/authStore';
import { ArrowRight, KeyRound, Mail, RefreshCw, Shield, Smartphone, UserRound } from 'lucide-react';

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

const devModeLoginEnabled =
  String(import.meta.env.VITE_DEV_MODE_LOGIN_ENABLED || '').toLowerCase() === 'true' && !import.meta.env.PROD;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<LoginStep>('email');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [maskedDestination, setMaskedDestination] = useState('');
  const [expiresRemaining, setExpiresRemaining] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(0);
  const [error, setError] = useState('');
  const { requestOtp, verifyOtp, devModeLogin, isLoginLoading, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const isEmailStep = step === 'email';
  const panelFooterText =
    step === 'code' && channel === 'email'
      ? "We'll send a verification code to your email"
      : "We'll send a verification code to your phone";

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

  const handleDevModeLogin = async () => {
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);

    try {
      const signedInUser = await devModeLogin(normalizedEmail);
      navigate(getRedirectPath(signedInUser.role), { replace: true });
    } catch (err: any) {
      setError(parseOtpError(err, 'Dev mode login is not available'));
    }
  };

  return (
    <main className="scl-auth" aria-labelledby="scl-auth-title">
      {/* Animated border beam */}
      <div className="scl-auth__beam" aria-hidden="true" />
      {/* Corner accent brackets */}
      <div className="scl-auth__edge scl-auth__edge--tl" aria-hidden="true" />
      <div className="scl-auth__edge scl-auth__edge--tr" aria-hidden="true" />
      <div className="scl-auth__edge scl-auth__edge--bl" aria-hidden="true" />
      <div className="scl-auth__edge scl-auth__edge--br" aria-hidden="true" />
      <div className="scl-auth__ghost-mark" aria-hidden="true">
        SCL
      </div>

      <div className="scl-auth__shell">
        <header className="scl-auth__brand">
          <div className="scl-auth__wordmark" aria-label="SCL Sales Command Layer">
            <span>S</span>
            <span>C</span>
            <span>L</span>
          </div>
          <p className="scl-auth__brand-subtitle">Sales Command Layer</p>
          <h1 id="scl-auth-title" className="scl-auth__headline">
            <span>Command</span> your pipeline
          </h1>
          <p className="scl-auth__tagline">Execution. Focus. Results.</p>
        </header>

        <section className="scl-auth__panel" aria-label="Sign in to SCL">
          <div className="scl-auth__panel-title">
            {isEmailStep ? <UserRound aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
            <h2>{isEmailStep ? 'Sign in to SCL' : 'Enter verification code'}</h2>
          </div>

          {error && (
            <div id="login-error" aria-live="polite" className="scl-auth__error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="scl-auth__form">
            <div className="scl-auth__field">
              <label htmlFor="login-email">Email address</label>
              <div className="scl-auth__input-wrap">
                <Mail aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={!isEmailStep}
                  aria-invalid={!!error && isEmailStep}
                  aria-describedby={error && isEmailStep ? 'login-error' : undefined}
                />
              </div>
            </div>

            {step === 'code' && (
              <div className="scl-auth__field">
                <div className="scl-auth__field-row">
                  <label htmlFor="login-code">Verification code</label>
                  <span>{formatCountdown(expiresRemaining)}</span>
                </div>
                <div className="scl-auth__input-wrap scl-auth__input-wrap--code">
                  <KeyRound aria-hidden="true" />
                  <input
                    id="login-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-invalid={!!error && step === 'code'}
                    aria-describedby={error && step === 'code' ? 'login-error' : undefined}
                  />
                </div>
                <p className="scl-auth__hint">Sent to {maskedDestination}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoginLoading || !email || (step === 'code' && code.length !== 6)}
              className="scl-auth__primary"
            >
              {isLoginLoading ? (
                <span className="scl-auth__spinner" aria-label="Loading" />
              ) : (
                <>
                  <span>{isEmailStep ? 'Send code' : 'Verify code'}</span>
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>

            {isEmailStep && (
              <>
                {devModeLoginEnabled && (
                  <button
                    type="button"
                    onClick={handleDevModeLogin}
                    disabled={isLoginLoading || !email}
                    className="scl-auth__dev"
                  >
                    <KeyRound className="w-4 h-4" />
                    Dev mode login
                  </button>
                )}
              </>
            )}

            {step === 'code' && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => sendCode(channel)}
                  disabled={isLoginLoading || resendRemaining > 0}
                  className="scl-auth__link"
                >
                  <RefreshCw className="w-4 h-4" />
                  {resendRemaining > 0 ? `Resend in ${formatCountdown(resendRemaining)}` : 'Resend code'}
                </button>

                {channel === 'sms' && (
                  <button
                    type="button"
                    onClick={() => sendCode('email')}
                    disabled={isLoginLoading}
                    className="scl-auth__link"
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
                  className="scl-auth__subtle-link"
                >
                  Change email
                </button>
              </div>
            )}
          </form>

          <div className="scl-auth__panel-footer">
            <Smartphone aria-hidden="true" />
            <p>{panelFooterText}</p>
          </div>
        </section>

        <footer className="scl-auth__footer">
          <Shield className="scl-auth__footer-icon" aria-hidden="true" />
          <span>SCL Systems • Secure • Intelligent • Relentless</span>
        </footer>
      </div>
    </main>
  );
}
