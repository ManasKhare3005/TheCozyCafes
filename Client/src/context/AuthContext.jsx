import React, { createContext, useContext, useState, useEffect } from 'react';
import { identifyAnalytics, resetAnalytics, track } from '../lib/analytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        identifyAnalytics(data.user);
      } else {
        // Token invalid, clear it
        sessionStorage.removeItem('token');
        setToken(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const storeSession = (data) => {
    if (!data.token || !data.user) return;
    sessionStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    identifyAnalytics(data.user);
  };

  const register = async (email, username, password, options = {}) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        username,
        password,
        captchaToken: options.captchaToken,
        birthDate: options.birthDate,
        acceptTerms: options.acceptTerms,
        acceptPrivacy: options.acceptPrivacy,
        referralCode: options.referralCode,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    storeSession(data);
    track('signup_completed', {
      requires_email_verification: !data.user?.emailVerifiedAt,
    });

    return data;
  };

  const login = async (email, password, captchaToken) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, captchaToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    storeSession(data);
    track('login_completed');

    return data;
  };

  const requestPasswordReset = async (email, captchaToken) => {
    const res = await fetch(`${API_URL}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, captchaToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Password reset request failed');
    }
    return data;
  };

  const resetPassword = async (resetToken, password, captchaToken) => {
    const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password, captchaToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Password reset failed');
    }
    return data;
  };

  const verifyEmail = async (verificationToken) => {
    const res = await fetch(`${API_URL}/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Email verification failed');
    }

    storeSession(data);
    track('email_verified');
    return data;
  };

  const resendVerification = async (email, captchaToken) => {
    const res = await fetch(`${API_URL}/auth/email/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, captchaToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Verification resend failed');
    }
    return data;
  };

  const logout = () => {
    track('logout');
    sessionStorage.removeItem('token');
    setToken(null);
    setUser(null);
    resetAnalytics();
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      register,
      login,
      logout,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerification,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
