import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY;
const HCAPTCHA_REQUIRED = import.meta.env.VITE_REQUIRE_HCAPTCHA === 'true';

function CaptchaBox({ onToken, resetKey, required }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!HCAPTCHA_SITE_KEY || !containerRef.current) return undefined;

    let cancelled = false;

    const renderCaptcha = () => {
      if (cancelled || !containerRef.current || widgetIdRef.current !== null || !window.hcaptcha) return;
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: HCAPTCHA_SITE_KEY,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };

    if (window.hcaptcha) {
      renderCaptcha();
      return undefined;
    }

    let script = document.querySelector('script[data-hcaptcha="true"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.hcaptcha = 'true';
      document.head.appendChild(script);
    }

    script.addEventListener('load', renderCaptcha);
    return () => {
      cancelled = true;
      script.removeEventListener('load', renderCaptcha);
    };
  }, [onToken, resetKey]);

  useEffect(() => {
    if (window.hcaptcha && widgetIdRef.current !== null) {
      window.hcaptcha.reset(widgetIdRef.current);
      onToken('');
    }
  }, [resetKey, onToken]);

  if (!HCAPTCHA_SITE_KEY) {
    if (!required) return null;
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Sign-in protection is not configured. Contact support before continuing.
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center min-h-[78px]" />;
}

function AuthScreen() {
  const query = new URLSearchParams(window.location.search);
  const initialResetToken = query.get('resetPasswordToken') || '';
  const verificationToken = query.get('verifyEmailToken') || '';
  const initialReferralCode = query.get('ref') || '';

  const [mode, setMode] = useState(initialResetToken ? 'reset' : initialReferralCode ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [debugLink, setDebugLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const {
    login,
    register,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    resendVerification,
  } = useAuth();

  const resetFeedback = () => {
    setError('');
    setSuccess('');
    setDebugLink('');
    setCaptchaToken('');
    setCaptchaResetKey((key) => key + 1);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPassword('');
    setBirthDate('');
    setAcceptTerms(false);
    setAcceptPrivacy(false);
    resetFeedback();
  };

  useEffect(() => {
    if (!verificationToken) return;

    let active = true;
    setIsLoading(true);
    verifyEmail(verificationToken)
      .then(() => {
        if (!active) return;
        setSuccess('Email verified. Signing you in...');
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCaptchaToken = useCallback((token) => {
    setCaptchaToken(token);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setDebugLink('');
    setIsLoading(true);

    try {
      if (HCAPTCHA_REQUIRED && !captchaToken) {
        setError('Please complete the CAPTCHA before continuing.');
        return;
      }

      if (mode === 'login') {
        await login(email, password, captchaToken);
      } else if (mode === 'register') {
        const data = await register(email, username, password, {
          captchaToken,
          birthDate,
          acceptTerms,
          acceptPrivacy,
          referralCode,
        });
        if (data.emailVerificationRequired) {
          setSuccess(data.message || 'Check your email to verify your account.');
          setDebugLink(data.debugEmailVerificationUrl || '');
        }
      } else if (mode === 'forgot') {
        const data = await requestPasswordReset(email, captchaToken);
        setSuccess(data.message);
        setDebugLink(data.debugPasswordResetUrl || '');
      } else if (mode === 'reset') {
        const data = await resetPassword(resetToken, password, captchaToken);
        setSuccess(data.message);
        setPassword('');
        setResetToken('');
        setMode('login');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (mode === 'resend') {
        const data = await resendVerification(email, captchaToken);
        setSuccess(data.message);
        setDebugLink(data.debugEmailVerificationUrl || '');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    }
  };

  const title = {
    login: 'Welcome Back',
    register: 'Join the Cafe',
    forgot: 'Reset Password',
    reset: 'Choose New Password',
    resend: 'Verify Email',
  }[mode];

  const subtitle = {
    login: 'Pull up a chair and continue chatting',
    register: 'Grab a seat and join the conversation',
    forgot: 'Enter your email and we will send a reset link',
    reset: 'Set a fresh password for your account',
    resend: 'Send a fresh verification link',
  }[mode];

  const buttonText = {
    login: 'Sign In',
    register: 'Create Account',
    forgot: 'Send Reset Link',
    reset: 'Reset Password',
    resend: 'Send Verification Link',
  }[mode];

  return (
    <div className="min-h-screen bg-cafe-50 cafe-texture flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-warm-lg p-8 w-full max-w-md border border-cafe-200/50">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">Cafe</div>
          <h1 className="text-3xl font-serif font-bold text-cafe-900">{title}</h1>
          <p className="text-cafe-500 mt-2 text-sm">{subtitle}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-6 text-sm">
            <p>{success}</p>
            {debugLink && (
              <a href={debugLink} className="block mt-2 text-green-800 underline break-all">
                Development link
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'reset' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-cafe-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                required
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-cafe-700 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="coffeelover42"
                  className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                  minLength={3}
                  maxLength={20}
                  required
                />
              </div>

              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-cafe-700 mb-1.5">
                  Birth date
                </label>
                <input
                  type="date"
                  id="birthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                  required
                />
              </div>

              <div>
                <label htmlFor="referralCode" className="block text-sm font-medium text-cafe-700 mb-1.5">
                  Invite code
                </label>
                <input
                  type="text"
                  id="referralCode"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                  maxLength={24}
                />
              </div>
            </>
          )}

          {mode === 'reset' && (
            <div>
              <label htmlFor="resetToken" className="block text-sm font-medium text-cafe-700 mb-1.5">
                Reset Token
              </label>
              <input
                type="text"
                id="resetToken"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                required
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-cafe-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3 pr-11 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300 transition-colors"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cafe-400 hover:text-cafe-700 transition-colors p-0.5"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <CaptchaBox onToken={handleCaptchaToken} resetKey={captchaResetKey} required={HCAPTCHA_REQUIRED} />

          {mode === 'register' && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-cafe-600">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5"
                  required
                />
                <span>
                  I am at least 13 years old and agree to the{' '}
                  <a href="/legal/terms.html" target="_blank" rel="noreferrer" className="underline hover:text-cafe-800">
                    Terms of Service
                  </a>.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-cafe-600">
                <input
                  type="checkbox"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                  className="mt-0.5"
                  required
                />
                <span>
                  I have read and agree to the{' '}
                  <a href="/legal/privacy.html" target="_blank" rel="noreferrer" className="underline hover:text-cafe-800">
                    Privacy Policy
                  </a>.
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-warm hover:shadow-warm-lg flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Working...
              </>
            ) : (
              buttonText
            )}
          </button>
        </form>

        <div className="mt-6 text-center flex flex-col gap-2">
          {mode === 'login' && (
            <>
              <button onClick={() => changeMode('register')} className="text-cafe-600 hover:text-cafe-800 text-sm transition-colors font-medium">
                Don't have an account? Sign up
              </button>
              <button onClick={() => changeMode('forgot')} className="text-cafe-500 hover:text-cafe-800 text-xs transition-colors">
                Forgot password?
              </button>
              <button onClick={() => changeMode('resend')} className="text-cafe-500 hover:text-cafe-800 text-xs transition-colors">
                Resend verification email
              </button>
            </>
          )}

          {mode !== 'login' && (
            <button onClick={() => changeMode('login')} className="text-cafe-600 hover:text-cafe-800 text-sm transition-colors font-medium">
              Back to sign in
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <div className="flex-1 h-px bg-cafe-200" />
          <span className="text-cafe-300 text-sm">Cafe</span>
          <div className="flex-1 h-px bg-cafe-200" />
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
