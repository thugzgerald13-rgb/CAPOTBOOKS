import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { LogIn, UserPlus, ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { PreselectedOnboardingCategory } from './LandingPage';

interface AuthContainerProps {
  initialMode?: 'login' | 'signup';
  selectedCategory?: PreselectedOnboardingCategory | null;
  onBackToLanding?: () => void;
}

export function AuthContainer({
  initialMode = 'login',
  selectedCategory = null,
  onBackToLanding,
}: AuthContainerProps) {
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    setIsLogin(initialMode !== 'signup');
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (isLogin) {
        let signInEmail = email.trim();
        // Staff use the managed Staff Login created by the account owner.
        // The lookup resolves that login to its hidden technical auth identity;
        // staff never need a separate CAPOT email/webapp account.
        if (!signInEmail.includes('@')) {
          const { data: managedEmail, error: lookupError } = await supabase.rpc('resolve_managed_staff_login', {
            p_login_name: signInEmail,
          });
          if (lookupError) throw lookupError;
          if (!managedEmail) throw new Error('Staff Login not found or disabled.');
          signInEmail = managedEmail;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email: signInEmail, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setInfo('Check your email to confirm your account before signing in.');
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Top Bar with Back to Category Tiles & Top-Right Login / Sign Up Words */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Category Selection</span>
              </button>
            )}
            <span className="font-black text-base tracking-tight text-slate-900 dark:text-white">
              CAPOTBOOKS
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm font-bold">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); setInfo(''); }}
              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                isLogin
                  ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:text-cyan-600'
              }`}
            >
              Login
            </button>
            <span className="text-slate-300 dark:text-slate-700 select-none">/</span>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); setInfo(''); }}
              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                !isLogin
                  ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:text-cyan-600'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 mb-4">
            {isLogin ? <LogIn className="w-8 h-8" /> : <UserPlus className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            {isLogin ? 'Sign in to access your accounting dashboard' : 'Sign up to get started with your tailored workflow'}
          </p>
        </div>

        {selectedCategory && (
          <div className="mb-6 p-3.5 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/80 flex items-start justify-between gap-3">
            <div className="text-xs space-y-0.5">
              <div className="font-extrabold text-cyan-900 dark:text-cyan-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span>Category: {selectedCategory.title}</span>
              </div>
              <div className="text-[11px] text-cyan-800/80 dark:text-cyan-300/80">
                {selectedCategory.taxpayerClassification} · {selectedCategory.vatRegistrationType.toUpperCase()} ·{' '}
                {selectedCategory.incomeTaxRegime.replace(/_/g, ' ').toUpperCase()} · {selectedCategory.industry}
              </div>
            </div>
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 hover:underline shrink-0 cursor-pointer"
              >
                Change
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {info && (
          <div className="mb-6 p-4 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800 rounded-xl text-sm text-cyan-700 dark:text-cyan-400">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Email or Staff Login</label>
            <input
              type={isLogin ? "text" : "email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="name@company.com or staff-login"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 flex items-center">
          <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-px"></div>
          <span className="px-4 text-sm text-slate-500 font-medium">OR</span>
          <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-px"></div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full relative py-3 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">Staff members do not create separate CAPOT webapp accounts. They sign in with the Staff Login and password provided by the account owner.</p>

        <div className="mt-8 text-center text-sm">
          <span className="text-slate-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-cyan-600 font-bold hover:underline"
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
