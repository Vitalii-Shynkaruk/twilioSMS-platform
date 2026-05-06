import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, RefreshCw, UserRound } from 'lucide-react';
import { OtpChannel, useAuthStore } from '../stores/authStore';
import '../styles/login-page.css';

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
    const status = err?.response?.status;
    const serviceError = typeof response?.error === 'string' ? response.error : '';
    if (response?.retryAfterSeconds) {
      setResendRemaining(Math.max(1, Number(response.retryAfterSeconds)));
    }

    if (serviceError === 'Email sign-in fallback is not configured') {
      return 'Email login code is not configured yet. Please use SMS or contact your admin.';
    }

    if (serviceError === 'Email sign-in fallback failed') {
      return "We couldn't send the email login code. Please check spam or use SMS instead.";
    }

    if (serviceError === 'SMS sign-in is not configured') {
      return 'SMS login code is not configured yet. Please contact your admin.';
    }

    if (serviceError) {
      return serviceError;
    }

    if (status >= 500) {
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
    <main className="scl-login" aria-labelledby="scl-login-title">
      <h1 id="scl-login-title" className="scl-login__sr-only">
        Sign in to SCL
      </h1>

      <div className="scl-login__stage">
        <img className="scl-login__bg" src="/scl-login/SCL-Login-BG.png" alt="" aria-hidden="true" />

        <div className="scl-login__overlay">
          {error && (
            <div id="login-error" aria-live="polite" className="scl-login__error-banner">
              {error}
            </div>
          )}

          {isEmailStep ? (
            <>
              <form onSubmit={handleSubmit} className="scl-login__hotspots" noValidate>
                <label className="scl-login__sr-only" htmlFor="login-email">
                  Email address
                </label>
                <div className="scl-login__email-shell">
                  <Mail aria-hidden="true" />
                  <input
                    id="login-email"
                    className="scl-login__email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
                <button
                  type="submit"
                  className="scl-login__send-button"
                  disabled={isLoginLoading || !email.trim()}
                  aria-label={isLoginLoading ? 'Sending code' : 'Send code'}
                >
                  <span className="scl-login__sr-only">Send code</span>
                </button>
              </form>

              {devModeLoginEnabled && (
                <button
                  type="button"
                  onClick={handleDevModeLogin}
                  disabled={isLoginLoading || !email.trim()}
                  className="scl-login__dev-button"
                >
                  <KeyRound aria-hidden="true" />
                  Dev mode login
                </button>
              )}
            </>
          ) : (
            <section className="scl-login__otp-card" aria-label="Verify sign-in code">
              <div className="scl-login__otp-title">
                {channel === 'email' ? <Mail aria-hidden="true" /> : <UserRound aria-hidden="true" />}
                <h2>Enter verification code</h2>
              </div>

              <p className="scl-login__otp-copy">
                We sent a 6-digit code to <strong>{maskedDestination}</strong>.
              </p>

              <form onSubmit={handleSubmit} className="scl-login__otp-form">
                <div className="scl-login__otp-row">
                  <label htmlFor="login-code">Verification code</label>
                  <span>{formatCountdown(expiresRemaining)}</span>
                </div>

                <div className="scl-login__otp-input-wrap">
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
                    autoFocus
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>

                <button type="submit" disabled={isLoginLoading || code.length !== 6} className="scl-login__otp-primary">
                  {isLoginLoading ? (
                    <span className="scl-login__spinner" aria-label="Loading" />
                  ) : (
                    <>
                      <span>Verify code</span>
                      <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </button>

                <div className="scl-login__otp-actions">
                  <button
                    type="button"
                    onClick={() => sendCode(channel)}
                    disabled={isLoginLoading || resendRemaining > 0}
                    className="scl-login__otp-link"
                  >
                    <RefreshCw aria-hidden="true" />
                    {resendRemaining > 0 ? `Resend in ${formatCountdown(resendRemaining)}` : 'Resend code'}
                  </button>

                  {channel === 'sms' && (
                    <button
                      type="button"
                      onClick={() => sendCode('email')}
                      disabled={isLoginLoading}
                      className="scl-login__otp-link"
                    >
                      <Mail aria-hidden="true" />
                      Use email instead
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError('');
                      setMaskedDestination('');
                      setExpiresRemaining(0);
                      setResendRemaining(0);
                    }}
                    className="scl-login__otp-link scl-login__otp-link--subtle"
                  >
                    Change email
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
