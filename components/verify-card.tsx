"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { triggerPageTransition } from "./page-transition";
import "./verify.css";

export function VerifyCard() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(59);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const handleResend = useCallback(() => {
    setResending(true);
    setSecondsRemaining(60);
    setTimeout(() => {
      setResending(false);
    }, 400);
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only accept numeric inputs
    const lastChar = value.slice(-1);
    if (lastChar && !/^\d$/.test(lastChar)) return;

    const nextDigits = [...digits];
    nextDigits[index] = lastChar;
    setDigits(nextDigits);

    // Auto-advance
    if (lastChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const nextDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] || "";
    }
    setDigits(nextDigits);

    const nextFocus = Math.min(pasted.length, 5);
    inputRefs.current[nextFocus]?.focus();
  };

  const handleQuickFill = () => {
    setDigits(["1", "2", "3", "4", "5", "6"]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerPageTransition();
    router.push("/dashboard");
  };

  const isComplete = digits.every((d) => d.length === 1);

  return (
    <main
      className="vf"
      style={
        {
          "--mono": "'Roboto Mono', monospace",
          "--anon": "'Anonymous Pro', monospace",
          fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
        } as React.CSSProperties
      }
    >
      <div className="vf-bg" aria-hidden="true" />

      <section className="vf-card" aria-label="Verification Code">
        {/* Back navigation */}
        <div className="vf-back-nav">
          <Link href="/signup" className="vf-back-btn" aria-label="Back to sign up">
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

        {/* Group 1 / Logo */}
        <div className="vf-logo-group">
          <svg
            width="56"
            height="54"
            viewBox="0 0 82 82"
            aria-hidden="true"
            style={{ overflow: "visible" }}
          >
            <defs>
              <filter
                id="vf-glow"
                x="0"
                y="0"
                width="82"
                height="82"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="12.7" />
              </filter>
            </defs>
            <g filter="url(#vf-glow)">
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

        {/* Header Branding */}
        <header className="vf-header">
          <Link href="/" className="vf-branding">
            <span className="vf-brand-name">Ambagan</span>
          </Link>
          <h1 className="vf-title">Verification Code</h1>
        </header>

        {/* Note on Terms / Subtitles */}
        <p className="vf-instruction">
          We send a 6-digit code to your device.
        </p>
        <div className="vf-resend-row">
          <span>
            {secondsRemaining > 0 ? `${secondsRemaining}s Remaining.` : "Code expired."}
          </span>
          <button
            type="button"
            className="vf-resend-btn"
            onClick={handleResend}
            disabled={secondsRemaining > 0 || resending}
          >
            Resend code.
          </button>
          <span style={{ color: "#CBD5E1" }}>•</span>
          <button
            type="button"
            className="vf-resend-btn"
            onClick={handleQuickFill}
            style={{ color: "#045307", fontWeight: 600 }}
          >
            Demo OTP (123456)
          </button>
        </div>

        {/* Verification Form */}
        <form className="vf-form" onSubmit={handleSubmit}>
          <div className="vf-code-row" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`vf-digit-input ${digit ? "filled" : ""}`}
                aria-label={`Digit ${idx + 1}`}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <button
            type="submit"
            className="vf-verify-btn"
            disabled={!isComplete}
          >
            Verify Account
          </button>

          {/* Terms Footer */}
          <p className="vf-terms">
            You acknowledge that you read, and agree, to our Terms of Service and
            our Privacy Policy.
          </p>
        </form>
      </section>
    </main>
  );
}
