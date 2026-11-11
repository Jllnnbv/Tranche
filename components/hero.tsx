"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./hero.css";
import "./start-modal.css";

const facts = [
  ["100%", "Transparent"],
  ["Secure", "By Design"],
  ["Next-Gen", "Integrated with Paiflow"],
];

export function Hero() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div
      className="lp"
      style={
        {
          "--serif": "'Playfair Display', Georgia, serif",
          "--chivo": "'Chivo', sans-serif",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        } as React.CSSProperties
      }
    >
      <div className="lp-blob lp-blob-top" aria-hidden="true" />
      <div className="lp-blob lp-blob-bottom" aria-hidden="true" />
      <div className="lp-orb" aria-hidden="true" />

      <div className="lp-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero.svg"
          alt="Ambagan savings illustration"
          className="lp-photo"
        />

        <nav className="lp-nav" aria-label="Primary">
          <a href="#top" className="lp-brand">
            <svg className="lp-mark" width="82" height="82" viewBox="0 0 82 82" fill="none" aria-hidden="true">
              <defs>
                <filter id="lp-glow" x="0" y="0" width="82" height="82" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation="10.3842" />
                </filter>
              </defs>
              <g filter="url(#lp-glow)">
                <ellipse cx="40.77" cy="40.77" rx="20" ry="20" fill="#B54880" />
              </g>
              <image
                href="/images/logo.svg"
                x="18.05"
                y="18.53"
                width="45.41"
                height="44.16"
                preserveAspectRatio="none"
              />
            </svg>
            <span className="lp-wordmark">Ambagan</span>
          </a>
          <button type="button" className="lp-nav-cta" onClick={() => setOpen(true)}>
            Start Saving
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
                stroke="#0E241C"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </nav>

        <div className="lp-copy">
          <p className="lp-kicker">
            Secure the Split, Scale the Synergy:
          </p>
          <h1 className="lp-title">
            <span className="lp-title-line">Blockchain-Powered</span>
            <span className="lp-title-line">Infrastructure for</span>
            <span className="lp-title-line">Shared Value</span>
          </h1>
          <p className="lp-sub">
            Deconstruct pools of value into secure programmable portions with
            next-generation blockchain infrastructure.
          </p>
          <div className="lp-actions">
            <button type="button" className="lp-primary" onClick={() => setOpen(true)}>
              Start Saving
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <a
              href="#how"
              className="lp-secondary"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              See How It Works
              <svg width="21" height="16" viewBox="0 0 21 16" fill="none" aria-hidden="true">
                <path
                  d="M1 8h18M12 1l7 7-7 7"
                  stroke="#12291C"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>

        <dl className="lp-facts">
          {facts.map(([big, small]) => (
            <div key={big}>
              <dt>{big}</dt>
              <dd>{small}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Seamless "How Ambagan Works" Section */}
      <section id="how" className="lp-how" aria-label="How Ambagan Works">
        <div className="lp-how-container">
          <div className="lp-how-header">
            <span className="lp-how-tag">Non-Custodial Ambagan Engine</span>
            <h2 className="lp-how-title">How Ambagan Works</h2>
            <p className="lp-how-desc">
              No single person holds or controls the pot. Every contribution is automatically governed on the blockchain by programmable smart rules.
            </p>
          </div>

          <div className="lp-how-visual-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/how-it-works.png"
              alt="How Ambagan Works diagram: The Deposit Pool, The Smart Split, Immediate Allocation, Ambagan Vault, and Safety Fund"
              className="lp-how-img"
              width={1024}
              height={423}
            />
          </div>

          <div className="lp-how-steps">
            <div className="lp-how-step-card">
              <div className="lp-how-step-num">1</div>
              <h3 className="lp-how-step-title">The Deposit Pool</h3>
              <p className="lp-how-step-body">
                A single, transparent pool where all group members safely send their contributions together on Stellar testnet.
              </p>
            </div>

            <div className="lp-how-step-card">
              <div className="lp-how-step-num">2</div>
              <h3 className="lp-how-step-title">The Automated Split</h3>
              <p className="lp-how-step-body">
                The smart contract instantly separates the funds according to predetermined rules: Immediate Allocation (e.g., 77%), Ambagan Vault (e.g., 20%), and Safety Fund (e.g., 3%).
              </p>
            </div>

            <div className="lp-how-step-card">
              <div className="lp-how-step-num">3</div>
              <h3 className="lp-how-step-title">Collaborative Release</h3>
              <p className="lp-how-step-body">
                Locked funds in the vault and safety fund are only released with group approval (Multisig sign-off), preventing anyone from running away with the money.
              </p>
            </div>
          </div>

          <div className="lp-how-actions">
            <button type="button" className="lp-primary" onClick={() => setOpen(true)}>
              Start Saving Now
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Link href="/contract" className="lp-secondary">
              Review Group E-Contract
              <svg width="21" height="16" viewBox="0 0 21 16" fill="none" aria-hidden="true">
                <path d="M1 8h18M12 1l7 7-7 7" stroke="#12291C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {open && (
        <div className="sm-overlay" onClick={() => setOpen(false)}>
          <div className="sm-card" role="dialog" aria-modal="true" aria-label="Start saving" onClick={(e) => e.stopPropagation()}>
            <svg
              className="sm-circle-svg"
              width="604"
              height="338"
              viewBox="0 0 604 338"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <g filter="url(#filter0_f_48_301)">
                <circle cx="301.607" cy="301.607" r="257.155" fill="white" />
              </g>
              <defs>
                <filter
                  id="filter0_f_48_301"
                  x="0.000141144"
                  y="1.90735e-05"
                  width="603.214"
                  height="603.214"
                  filterUnits="userSpaceOnUse"
                  colorInterpolationFilters="sRGB"
                >
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feGaussianBlur stdDeviation="0.88904" result="effect1_foregroundBlur_48_301" />
                </filter>
              </defs>
            </svg>
            <button type="button" className="sm-close" aria-label="Close" onClick={() => setOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" stroke="#BD4683" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            </button>
            <p className="sm-heading">Start Saving Here</p>
            <svg className="sm-logo" width="96" height="93" viewBox="0 0 96 93" aria-hidden="true" style={{ overflow: "visible" }}>
              <defs>
                <filter id="sm-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="21.9" />
                </filter>
              </defs>
              <g filter="url(#sm-glow)">
                <ellipse cx="47" cy="46.5" rx="42" ry="42" fill="#B54880" />
              </g>
              <image href="/images/logo.svg" width="95.78" height="93.15" preserveAspectRatio="none" />
            </svg>
            <p className="sm-title">Ambagan</p>
            <p className="sm-text">
              Ambagan is an ambagan app. No person holds the pot. Each splits on the blockchain to the receiver, the Ambagan Vault, and the Safety Fund.
            </p>
            <button
              type="button"
              className="sm-learn-link"
              onClick={() => {
                setOpen(false);
                document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              See how the automated split works ↓
            </button>
            <div className="sm-actions">
              <Link href="/signup" className="sm-signup">
                Sign up
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="9" cy="8" r="4" stroke="#fff" strokeWidth="2" />
                  <path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </Link>
              <Link href="/login" className="sm-login">
                Log in
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" stroke="#1A2E1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
