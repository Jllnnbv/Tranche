"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserRequest } from "@/lib/browser-api";
import { authErrorText } from "@/lib/auth/client";
import { triggerPageTransition, stopPageTransition } from "./page-transition";
import "./signup.css";

export function SignupCard() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    browserRequest<{ username: string; email: string }>("/api/auth/me").then(
      (user) => setCurrentUser(user.username || user.email),
      () => setCurrentUser(null),
    );
  }, []);

  async function logInDemo() {
    setError(null);
    setBusy(true);
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/demo", {});
      window.location.href = "/dashboard";
    } catch (err) {
      setError(authErrorText(err));
      setBusy(false);
      stopPageTransition();
    }
  }

  async function signUp(form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/signup", {
        username: data.get("username"),
        email: data.get("email"),
        password: data.get("password"),
        phone: data.get("phone") || undefined,
      });
      router.replace("/verify");
      router.refresh();
    } catch (err) {
      setError(authErrorText(err));
      setBusy(false);
      stopPageTransition();
    }
  }

  return (
    <main
      className="su"
      style={
        {
          "--mono": "'Roboto Mono', monospace",
          "--anon": "'Anonymous Pro', monospace",
          fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
        } as React.CSSProperties
      }
    >
      <div className="su-bg" aria-hidden="true" />

      <section className="su-card" aria-label="Create Account">
        {/* Group 1 / Logo */}
        <div className="su-logo-group">
          <svg
            width="56"
            height="54"
            viewBox="0 0 82 82"
            aria-hidden="true"
            style={{ overflow: "visible" }}
          >
            <defs>
              <filter
                id="su-glow"
                x="0"
                y="0"
                width="82"
                height="82"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="12.7" />
              </filter>
            </defs>
            <g filter="url(#su-glow)">
              <ellipse
                cx="40.77"
                cy="40.77"
                rx="24.5"
                ry="24.5"
                fill="#B54880"
              />
            </g>
            <image
              href="/images/logo.svg"
              x="13"
              y="14"
              width="55.69"
              height="54.16"
              preserveAspectRatio="none"
            />
          </svg>
        </div>

        {/* Brand Header */}
        <header className="su-brand-header">
          {/* Frame 1: Back Button */}
          <div className="su-frame-1">
            <Link href="/login" className="su-back" aria-label="Back to login">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M7.5 2.5L4 6L7.5 9.5"
                  stroke="#045307"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          {/* Frame 2: Title + Subtitle */}
          <div className="su-frame-2">
            <h1 className="su-title">Create Account</h1>
            <p className="su-subtitle">
              Already have an account?{" "}
              <Link href="/login" className="su-login-link">
                Log in
              </Link>
            </p>
          </div>
        </header>

        {currentUser && (
          <div className="su-current-user-banner">
            Currently signed in as <strong>{currentUser}</strong>.{" "}
            <Link href="/dashboard">Go to Dashboard &rarr;</Link>
          </div>
        )}

        {/* Form */}
        <form
          className="su-form"
          onSubmit={(e) => {
            e.preventDefault();
            void signUp(e.currentTarget);
          }}
        >
          {/* Form Fields */}
          <div className="su-fields">
            <input
              type="text"
              name="username"
              placeholder="New Username"
              aria-label="New Username"
              autoComplete="username"
              required
              className="su-input"
            />
            <input
              type="password"
              name="password"
              placeholder="New Password"
              aria-label="New Password"
              autoComplete="new-password"
              required
              className="su-input"
            />
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm New Password"
              aria-label="Confirm New Password"
              autoComplete="new-password"
              required
              className="su-input"
            />
            <input
              type="email"
              name="email"
              placeholder="Confirm Email"
              aria-label="Confirm Email"
              autoComplete="email"
              required
              className="su-input"
            />
            <input
              type="tel"
              name="phone"
              placeholder="Confirm Number"
              aria-label="Confirm Number"
              autoComplete="tel"
              className="su-input"
            />
          </div>

          {/* Privacy Consent */}
          <label className="su-privacy">
            <input
              type="checkbox"
              name="privacyConsent"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              required
              className="su-checkbox-native"
            />
            <span
              className={`su-checkbox ${agreed ? "checked" : ""}`}
              aria-hidden="true"
            >
              {agreed && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1.5 4L3.8 6.3L8.5 1.5"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="su-privacy-text">
              I agree to the Data Privacy Policy
            </span>
          </label>

          {/* Action Block */}
          <div className="su-action">
            {error && <p className="su-error" role="alert">{error}</p>}
            <button type="submit" className="su-signup-btn" disabled={busy}>
              {busy ? "Creating account…" : "Sign Up"}
            </button>
            <p className="su-or">or sign up with</p>
            <button
              type="button"
              className="su-social"
              disabled={busy}
              onClick={() => void logInDemo()}
            >
              <div className="su-google-frame" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#1F3A19"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#1F3A19"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#1F3A19"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#1F3A19"
                  />
                </svg>
              </div>
              <span className="su-social-name">Google</span>
            </button>
          </div>

          {/* Agreement Footer */}
          <p className="su-footer">
            You acknowledge that you read, and agree, to our Terms of Service and
            our Privacy Policy.
          </p>
        </form>
      </section>
    </main>
  );
}
