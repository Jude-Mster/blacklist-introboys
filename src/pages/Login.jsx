import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // Same-origin path to return to after login (defaults to "/").
  const returnTo = safeReturnTo();
  const afterLogin = returnTo === "/" ? "/dashboard" : returnTo;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = afterLogin;
    } catch (err) {
      setError(err.message || "That email and password don't match. Try again or reset your password.");
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", afterLogin);
  };

  return (
    <AuthLayout
      title="Enter the guild hall"
      subtitle="Log in, then link your Discord to see your points."
      footer={
        <>
          New here?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="font-medium text-gold underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <button type="button" onClick={handleGoogle} className="btn-bronze h-12 w-full text-[15px]">
        <GoogleIcon className="h-5 w-5" />
        Continue with Google
      </button>

      <div className="divider-knot my-5 text-xs">or</div>

      {!showEmail ? (
        <button type="button" onClick={() => setShowEmail(true)} className="w-full text-center text-sm text-mist hover:text-gold">
          Log in with email instead
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md border border-ember/40 bg-ember/10 p-3 text-sm text-ember">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="label">Password</label>
              <Link to="/forgot-password" className="mb-1.5 text-xs text-gold hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              required
            />
          </div>
          <button type="submit" className="btn-seal h-12 w-full text-base" disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Logging in</> : "Log in"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}