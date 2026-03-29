import { useState } from "react";
import { supabase } from "./supabaseClient";
import { t } from "./i18n";

export default function Auth({ onAuth }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  async function handleAuth(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setSuccessMessage(t("authCheckEmail"));
        setEmail("");
        setPassword("");
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        if (data?.session) {
          onAuth(data.session);
        }
      }
    } catch (err) {
      setError(err.message || t("authError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || t("authError"));
      setLoading(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-8">
          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-2 text-center">
            {t("appTitle")}
          </h1>
          <p className="text-slate-400 text-center mb-8 text-sm">
            {isSignUp ? t("authSignUp") : t("authSignIn")}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-green-400 text-sm">{successMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                {t("authEmail")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                placeholder="you@example.com"
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                {t("authPassword")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? "..." : isSignUp ? t("authSignUpBtn") : t("authSignInBtn")}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 border-t border-slate-600"></div>
            <span className="text-slate-400 text-sm">{t("authOr")}</span>
            <div className="flex-1 border-t border-slate-600"></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full mt-6 px-4 py-2 bg-white hover:bg-slate-100 disabled:bg-slate-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t("authGoogleBtn")}
          </button>

          {/* Toggle Sign In / Sign Up */}
          <p className="mt-6 text-center text-slate-400 text-sm">
            {isSignUp ? t("authToggleSignIn") : t("authToggleSignUp")}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setSuccessMessage("");
              }}
              className="ml-2 text-blue-400 hover:text-blue-300 font-semibold transition-colors"
            >
              {isSignUp ? t("authSignIn") : t("authSignUp")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
