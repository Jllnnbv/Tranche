"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserRequest } from "@/lib/browser-api";
import { authErrorText } from "@/lib/auth/client";
import { triggerPageTransition, stopPageTransition } from "./page-transition";
import "./login.css";

export function LoginCard() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    browserRequest<{ username: string; email: string }>("/api/auth/me").then(
      (user) => setCurrentUser(user.username || user.email),
      () => setCurrentUser(null),
    );
  }, []);

  function navigateNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    window.location.href = target;
  }

  async function logIn(form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    setSuccess(null);
    setBusy(true);
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/login", {
        email: data.get("email"),
        password: data.get("password"),
      });
      navigateNext();
    } catch (err) {
      setError(authErrorText(err));
      setBusy(false);
      stopPageTransition();
    }
  }

  async function reset(form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    setSuccess(null);
    setBusy(true);
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/reset", {
        email: data.get("email"),
        password: data.get("password"),
      });
      navigateNext();
    } catch (err) {
      setError(authErrorText(err));
      setBusy(false);
      stopPageTransition();
    }
  }

  async function logInDemo() {
    setError(null);
    setSuccess(null);
    setBusy(true);
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/demo", {});
      navigateNext();
    } catch (err) {
      setError(authErrorText(err));
      setBusy(false);
      stopPageTransition();
    }
  }

  return (
    <main
      className="lg"
      style={
        {
          "--mono": "'Roboto Mono', monospace",
          "--anon": "'Anonymous Pro', monospace",
          fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
        } as React.CSSProperties
      }
    >
      <div className="lg-bg" aria-hidden="true" />
      <section className="lg-card" aria-label={mode === "login" ? "Sign in" : "Reset Password"}>
        <header className="lg-head">
          <Link href="/" className="lg-brand">
            <svg width="56" height="54" viewBox="0 0 82 82" aria-hidden="true" style={{ overflow: "visible" }}>
              <defs>
                <filter id="lg-glow" x="0" y="0" width="82" height="82" filterUnits="userSpaceOnUse">
                  <feGaussianBlur stdDeviation="12.7" />
                </filter>
              </defs>
              <g filter="url(#lg-glow)">
                <ellipse cx="40.77" cy="40.77" rx="24.5" ry="24.5" fill="#B54880" />
              </g>
              <image href="/images/logo.svg" x="13" y="14" width="55.69" height="54.16" preserveAspectRatio="none" />
            </svg>
            <span>Ambagan</span>
          </Link>
          <h1>{mode === "login" ? "Welcome!" : "Reset Password"}</h1>
          <p>
            {mode === "login" ? (
              <>
                First time organizing? <Link href="/signup">Sign up for free</Link>
              </>
            ) : (
              <>
                Remember your password?{" "}
                <button
                  type="button"
                  className="lg-toggle-btn"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Back to log in
                </button>
              </>
            )}
          </p>
        </header>

        {currentUser && (
          <div className="lg-current-user-banner">
            Currently signed in as <strong>{currentUser}</strong>.{" "}
            <Link href="/dashboard">Go to Dashboard &rarr;</Link>
          </div>
        )}

        {mode === "login" ? (
          <form
            className="lg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void logIn(e.currentTarget);
            }}
          >
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              aria-label="Email address"
              autoComplete="email"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              required
            />
            <p className="lg-forgot">
              <button
                type="button"
                className="lg-toggle-btn"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                }}
              >
                Forgot Password?
              </button>
            </p>
            {error && <p className="lg-error" role="alert">{error}</p>}
            {success && <p className="lg-success" role="status">{success}</p>}
            <button type="submit" className="lg-login" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
        ) : (
          <form
            className="lg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void reset(e.currentTarget);
            }}
          >
            <input
              type="email"
              name="email"
              placeholder="Account Email"
              aria-label="Account email"
              autoComplete="email"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="New Password (min 8 characters)"
              aria-label="New password"
              autoComplete="new-password"
              required
            />
            {error && <p className="lg-error" role="alert">{error}</p>}
            {success && <p className="lg-success" role="status">{success}</p>}
            <button type="submit" className="lg-login" disabled={busy}>
              {busy ? "Updating…" : "Reset & Log in"}
            </button>
          </form>
        )}

        <p className="lg-or">or sign in with</p>
        <button
          type="button"
          className="lg-alt"
          disabled={busy}
          onClick={() => void logInDemo()}
        >
          <span className="lg-g" aria-hidden="true">G</span>
          Google
        </button>

        <p className="lg-terms">
          You acknowledge that you read, and agree, to our Terms of Service and our Privacy Policy.
        </p>
      </section>
    </main>
  );
}
