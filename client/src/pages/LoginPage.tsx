import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Shield, LogIn, Eye, EyeOff, Lock } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoginLoading, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Invalid credentials';
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" style={{ backgroundColor: '#060d1b' }}>
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary gradient orb */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-scl-600/8 rounded-full blur-[150px]" />
        {/* Secondary accent */}
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-scl-800/10 rounded-full blur-[120px]" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-scl-700/8 rounded-full blur-[100px]" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(76, 99, 230, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(76, 99, 230, 0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-scl-500 to-scl-700 mb-5 shadow-scl-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#dce4ef' }}>
            Secure Credit Lines
          </h1>
          <p className="text-sm mt-2 font-medium tracking-wide uppercase" style={{ color: '#4e6a8a' }}>
            SMS Management Platform
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border p-8 backdrop-blur-sm" style={{
          backgroundColor: 'rgba(20, 32, 56, 0.8)',
          borderColor: 'rgba(40, 59, 82, 0.5)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 80px rgba(76, 99, 230, 0.06)',
        }}>
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-4 h-4" style={{ color: '#4e6a8a' }} />
            <h2 className="text-lg font-semibold" style={{ color: '#b8c9df' }}>Sign in to your account</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#6b87a8' }}>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@securecreditlines.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#6b87a8' }}>Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoginLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #4c63e6 0%, #2f3fb3 100%)',
                boxShadow: '0 4px 14px rgba(76, 99, 230, 0.35)',
              }}
            >
              {isLoginLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(40, 59, 82, 0.5)' }}>
            <p className="text-xs text-center" style={{ color: '#3a526d' }}>
              Contact your administrator if you need access
            </p>
          </div>
        </div>

        <p className="text-xs text-center mt-8" style={{ color: '#283b52' }}>
          &copy; {new Date().getFullYear()} Secure Credit Lines. All rights reserved.
        </p>
      </div>
    </div>
  );
}
