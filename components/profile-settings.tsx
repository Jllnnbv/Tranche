"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserRequest } from "@/lib/browser-api";
import { triggerPageTransition } from "./page-transition";
import "./profile-settings.css";

type TabKey = "personal" | "wallets" | "security" | "notifications" | "preferences";

interface UserProfile {
  fullName: string;
  email: string;
  mobile: string;
  walletAddress: string;
  walletBalance: string;
  isVerified: boolean;
  isWalletConnected: boolean;
  avatarUrl: string | null;
}

const DEFAULT_PROFILE: UserProfile = {
  fullName: "Jullianna.villaluna",
  email: "jullianna.villaluna12@gmail.com",
  mobile: "+63 995 346 9717",
  walletAddress: "GB2B...3K7Y",
  walletBalance: "145.25 XLM",
  isVerified: true,
  isWalletConnected: true,
  avatarUrl: null,
};

export function ProfileSettings() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [formState, setFormState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [copiedToast, setCopiedToast] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Security tab states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);

  // Notifications tab states
  const [emailNotify, setEmailNotify] = useState(true);
  const [smsNotify, setSmsNotify] = useState(true);
  const [payoutNotify, setPayoutNotify] = useState(true);

  // Preferences tab states
  const [currency, setCurrency] = useState("PHP");
  const [language, setLanguage] = useState("en");

  // Load from localStorage & connect with auth session (/api/auth/me)
  useEffect(() => {
    let savedProfile: UserProfile | null = null;
    try {
      const saved = localStorage.getItem("ambagan_user_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          savedProfile = parsed;
          setProfile(parsed);
          setFormState(parsed);
        }
      }
    } catch {
      // ignore
    }

    // Connect with signed-in user session
    browserRequest<{ id?: string; username?: string; email?: string; phone?: string }>("/api/auth/me")
      .then((user) => {
        if (!user) return;
        const currentName = user.username?.trim() || user.email?.split("@")[0] || "";
        
        setFormState((prev) => {
          // If the saved profile was the legacy hardcoded "Villaluna Jomari", or empty, upgrade it to the authenticated user
          const isLegacyOrEmpty =
            !savedProfile ||
            !savedProfile.fullName?.trim() ||
            savedProfile.fullName === "Villaluna Jomari";

          const effectiveName = isLegacyOrEmpty && currentName ? currentName : prev.fullName;
          const effectiveEmail = isLegacyOrEmpty && user.email ? user.email : prev.email;
          const effectiveMobile = isLegacyOrEmpty && user.phone ? user.phone : prev.mobile;

          const updated: UserProfile = {
            ...prev,
            fullName: effectiveName || prev.fullName,
            email: effectiveEmail || prev.email,
            mobile: effectiveMobile || prev.mobile,
          };

          if (isLegacyOrEmpty) {
            try {
              localStorage.setItem("ambagan_user_profile", JSON.stringify(updated));
              window.dispatchEvent(new Event("ambagan_profile_updated"));
            } catch {}
          }
          return updated;
        });

        setProfile((prev) => {
          const isLegacyOrEmpty =
            !savedProfile ||
            !savedProfile.fullName?.trim() ||
            savedProfile.fullName === "Villaluna Jomari";

          return {
            ...prev,
            fullName: isLegacyOrEmpty && currentName ? currentName : prev.fullName,
            email: isLegacyOrEmpty && user.email ? user.email : prev.email,
            mobile: isLegacyOrEmpty && user.phone ? user.phone : prev.mobile,
          };
        });
      })
      .catch(() => {});
  }, []);

  const handleBackToDashboard = () => {
    triggerPageTransition();
    router.push("/dashboard");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFormState((prev) => ({ ...prev, avatarUrl: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormState((prev) => ({ ...prev, avatarUrl: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCopyAddress = () => {
    const fullAddr =
      formState.walletAddress === "GB2B...3K7Y"
        ? "GB2BQQWZE25M27N7A43BLLJ62G4U5S6ZEXX7H34O53X7L4QY3K7Y"
        : formState.walletAddress;
    navigator.clipboard?.writeText?.(fullAddr);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2200);
  };

  const handleToggleWallet = () => {
    setFormState((prev) => ({
      ...prev,
      isWalletConnected: !prev.isWalletConnected,
    }));
  };

  const handleSave = async () => {
    setProfile(formState);
    try {
      // 1. Persist locally and notify dashboard greeting immediately
      localStorage.setItem("ambagan_user_profile", JSON.stringify(formState));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ambagan_profile_updated"));
      }

      // 2. Persist to backend database for session consistency
      await browserRequest("/api/auth/profile", {
        fullName: formState.fullName,
        username: formState.fullName,
        email: formState.email,
        mobile: formState.mobile,
        avatarUrl: formState.avatarUrl,
      });
    } catch {}
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2400);
  };

  const handleCancel = () => {
    setFormState(profile);
  };

  const initialLetter = formState.fullName ? formState.fullName.charAt(0).toUpperCase() : "J";

  return (
    <div className="ps-root">
      {/* Ambient background decoration */}
      <div className="ps-ambient-bg" aria-hidden="true" />

      {/* Main viewport frame */}
      <div className="ps-container">
        {/* Top brand header */}
        <header className="ps-brand-bar">
          <Link href="/dashboard" className="ps-brand-logo-link">
            <div className="ps-brand-logo-glow">
              <svg width="38" height="38" viewBox="0 0 45.41 44.16" aria-hidden="true">
                <defs>
                  <filter id="ps-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="8" />
                  </filter>
                </defs>
                <g filter="url(#ps-glow)">
                  <ellipse cx="22.7" cy="22.1" rx="19" ry="19" fill="#B54880" />
                </g>
                <image href="/images/logo.svg" width="45.41" height="44.16" preserveAspectRatio="none" />
              </svg>
            </div>
            <span className="ps-brand-name">Ambagan</span>
          </Link>

          <button
            type="button"
            className="ps-back-btn"
            onClick={handleBackToDashboard}
            aria-label="Back to Dashboard"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 12L6 8L10 4"
                stroke="#176B45"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Back to Dashboard</span>
          </button>
        </header>

        {/* Profile Settings Top Banner */}
        <section className="ps-header-banner" aria-label="Profile Banner">
          <div className="ps-banner-avatar">
            {formState.avatarUrl ? (
              <img src={formState.avatarUrl} alt="User Avatar" className="ps-avatar-img" />
            ) : (
              <span className="ps-avatar-initial">{initialLetter}</span>
            )}
          </div>

          <div className="ps-banner-divider" aria-hidden="true" />

          <div className="ps-banner-info">
            <h1 className="ps-banner-title">Profile Settings</h1>
            <p className="ps-banner-sub">
              Manage your personal information, wallet, and security for Ambagan
            </p>
          </div>
        </section>

        {/* Two-Column Layout: Sidebar Nav & Main Card */}
        <div className="ps-body-grid">
          {/* Left Navigation Sidebar */}
          <nav className="ps-nav-card" aria-label="Profile navigation">
            <button
              type="button"
              className={`ps-nav-item ${activeTab === "personal" ? "ps-nav-active" : ""}`}
              onClick={() => setActiveTab("personal")}
            >
              <span className="ps-nav-label">Personal Info</span>
            </button>

            <button
              type="button"
              className={`ps-nav-item ${activeTab === "wallets" ? "ps-nav-active" : ""}`}
              onClick={() => setActiveTab("wallets")}
            >
              <span className="ps-nav-label">Connected Wallets</span>
            </button>

            <button
              type="button"
              className={`ps-nav-item ${activeTab === "security" ? "ps-nav-active" : ""}`}
              onClick={() => setActiveTab("security")}
            >
              <span className="ps-nav-label">Security</span>
            </button>

            <button
              type="button"
              className={`ps-nav-item ${activeTab === "notifications" ? "ps-nav-active" : ""}`}
              onClick={() => setActiveTab("notifications")}
            >
              <span className="ps-nav-label">Notifications</span>
            </button>

            <button
              type="button"
              className={`ps-nav-item ${activeTab === "preferences" ? "ps-nav-active" : ""}`}
              onClick={() => setActiveTab("preferences")}
            >
              <span className="ps-nav-label">Preferences</span>
            </button>
          </nav>

          {/* Right Main Content Card */}
          <main className="ps-content-card">
            {/* TAB 1: PERSONAL INFO (Exact Replica of Screenshot) */}
            {activeTab === "personal" && (
              <div className="ps-tab-personal">
                {/* Two-column top row: Profile Picture & Personal Details */}
                <div className="ps-row-top">
                  {/* Left Column: Profile Picture */}
                  <div className="ps-col-pic">
                    <h2 className="ps-section-heading">Profile Picture</h2>
                    <div className="ps-pic-row">
                      <div className="ps-pic-circle">
                        {formState.avatarUrl ? (
                          <img
                            src={formState.avatarUrl}
                            alt="Profile"
                            className="ps-avatar-img"
                          />
                        ) : (
                          <span className="ps-pic-initial">{initialLetter}</span>
                        )}
                      </div>

                      <div className="ps-pic-actions">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          style={{ display: "none" }}
                          aria-label="Upload profile image"
                        />
                        <button
                          type="button"
                          className="ps-btn-upload"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Upload Image
                        </button>
                        <button
                          type="button"
                          className="ps-btn-remove"
                          onClick={handleRemoveImage}
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Personal Details */}
                  <div className="ps-col-details">
                    <h2 className="ps-section-heading">Personal Details</h2>

                    <div className="ps-field-group">
                      <label htmlFor="ps-full-name" className="ps-field-label">
                        Full Name
                      </label>
                      <input
                        id="ps-full-name"
                        type="text"
                        className="ps-input"
                        value={formState.fullName}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, fullName: e.target.value }))
                        }
                        placeholder="Full Name"
                      />
                    </div>

                    <div className="ps-field-group">
                      <label htmlFor="ps-email" className="ps-field-label">
                        Email Address
                      </label>
                      <input
                        id="ps-email"
                        type="email"
                        className="ps-input"
                        value={formState.email}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="Email Address"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Mobile Number */}
                <div className="ps-section-block">
                  <label htmlFor="ps-mobile" className="ps-section-label">
                    Mobile Number
                  </label>
                  <div className="ps-input-with-badge">
                    <input
                      id="ps-mobile"
                      type="text"
                      className="ps-input-bare"
                      value={formState.mobile}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, mobile: e.target.value }))
                      }
                      placeholder="+63 917 123 4567"
                    />
                    {formState.isVerified && (
                      <div className="ps-badge-verified">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <circle cx="8" cy="8" r="7" fill="#6B7280" />
                          <path
                            d="M5 8.2L7 10.2L11 6.2"
                            stroke="#FFFFFF"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>Verified</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Stellar Wallet (Testnet) */}
                <div className="ps-section-block">
                  <label className="ps-section-label">Stellar Wallet (Testnet)</label>
                  <div className="ps-wallet-row">
                    <div className="ps-wallet-address-box">
                      <span className="ps-wallet-address-text">
                        {formState.isWalletConnected
                          ? formState.walletAddress
                          : "Wallet Disconnected"}
                      </span>

                      <div className="ps-wallet-btn-group">
                        <button
                          type="button"
                          className={
                            formState.isWalletConnected
                              ? "ps-btn-disconnect"
                              : "ps-btn-connect"
                          }
                          onClick={handleToggleWallet}
                        >
                          {formState.isWalletConnected ? "Disconnect" : "Connect"}
                        </button>
                        <button
                          type="button"
                          className="ps-btn-copy"
                          onClick={handleCopyAddress}
                          disabled={!formState.isWalletConnected}
                        >
                          {copiedToast ? "Copied!" : "Copy Address"}
                        </button>
                      </div>
                    </div>

                    <div className="ps-balance-pill">
                      <span>
                        Balance:{" "}
                        {formState.isWalletConnected ? formState.walletBalance : "0.00 XLM"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider Line */}
                <hr className="ps-card-divider" />

                {/* Bottom Actions */}
                <div className="ps-bottom-actions">
                  <button
                    type="button"
                    className="ps-btn-save"
                    onClick={handleSave}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="ps-btn-cancel"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: CONNECTED WALLETS */}
            {activeTab === "wallets" && (
              <div className="ps-tab-secondary">
                <h2 className="ps-subtab-title">Connected Wallets & Networks</h2>
                <p className="ps-subtab-desc">
                  Manage your on-chain identities and automated micro-distribution wallets.
                </p>

                <div className="ps-wallet-card">
                  <div className="ps-wallet-card-header">
                    <div className="ps-network-tag">
                      <span className="ps-network-dot" />
                      <span>Stellar Testnet</span>
                    </div>
                    <span className="ps-active-status">Active</span>
                  </div>
                  <div className="ps-wallet-card-body">
                    <div className="ps-wallet-info-item">
                      <span className="ps-wallet-info-label">Public Key</span>
                      <span className="ps-wallet-info-val">
                        GB2BQQWZE25M27N7A43BLLJ62G4U5S6ZEXX7H34O53X7L4QY3K7Y
                      </span>
                    </div>
                    <div className="ps-wallet-info-item">
                      <span className="ps-wallet-info-label">Available Balance</span>
                      <span className="ps-wallet-info-val font-bold">145.25 XLM</span>
                    </div>
                  </div>
                </div>

                <div className="ps-bottom-actions mt-6">
                  <button type="button" className="ps-btn-save" onClick={handleSave}>
                    Add New Wallet
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: SECURITY */}
            {activeTab === "security" && (
              <div className="ps-tab-secondary">
                <h2 className="ps-subtab-title">Security & Authentication</h2>
                <p className="ps-subtab-desc">
                  Update your authentication credentials and cryptographic signing methods.
                </p>

                <div className="ps-field-group">
                  <label className="ps-field-label">Current Password</label>
                  <input
                    type="password"
                    className="ps-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="ps-field-group">
                  <label className="ps-field-label">New Password</label>
                  <input
                    type="password"
                    className="ps-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                  />
                </div>

                <div className="ps-toggle-row">
                  <div>
                    <div className="ps-toggle-title">Two-Factor Authentication (2FA)</div>
                    <div className="ps-toggle-sub">
                      Require OTP verification for smart-contract distributions
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`ps-toggle-btn ${twoFactorEnabled ? "ps-toggle-on" : ""}`}
                    onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                  >
                    <span className="ps-toggle-knob" />
                  </button>
                </div>

                <hr className="ps-card-divider" />
                <div className="ps-bottom-actions">
                  <button type="button" className="ps-btn-save" onClick={handleSave}>
                    Update Security
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: NOTIFICATIONS */}
            {activeTab === "notifications" && (
              <div className="ps-tab-secondary">
                <h2 className="ps-subtab-title">Notification Preferences</h2>
                <p className="ps-subtab-desc">
                  Choose how and when you receive Ambagan distribution alerts and payment receipts.
                </p>

                <div className="ps-toggle-row">
                  <div>
                    <div className="ps-toggle-title">Email Notifications</div>
                    <div className="ps-toggle-sub">
                      Receive weekly summaries and transaction confirmations
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`ps-toggle-btn ${emailNotify ? "ps-toggle-on" : ""}`}
                    onClick={() => setEmailNotify(!emailNotify)}
                  >
                    <span className="ps-toggle-knob" />
                  </button>
                </div>

                <div className="ps-toggle-row">
                  <div>
                    <div className="ps-toggle-title">SMS & Mobile Alerts</div>
                    <div className="ps-toggle-sub">Instant SMS when a contribution cycle matures</div>
                  </div>
                  <button
                    type="button"
                    className={`ps-toggle-btn ${smsNotify ? "ps-toggle-on" : ""}`}
                    onClick={() => setSmsNotify(!smsNotify)}
                  >
                    <span className="ps-toggle-knob" />
                  </button>
                </div>

                <div className="ps-toggle-row">
                  <div>
                    <div className="ps-toggle-title">Payout Cycle Reminders</div>
                    <div className="ps-toggle-sub">48-hour advance notice before payout draw</div>
                  </div>
                  <button
                    type="button"
                    className={`ps-toggle-btn ${payoutNotify ? "ps-toggle-on" : ""}`}
                    onClick={() => setPayoutNotify(!payoutNotify)}
                  >
                    <span className="ps-toggle-knob" />
                  </button>
                </div>

                <hr className="ps-card-divider" />
                <div className="ps-bottom-actions">
                  <button type="button" className="ps-btn-save" onClick={handleSave}>
                    Save Preferences
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: PREFERENCES */}
            {activeTab === "preferences" && (
              <div className="ps-tab-secondary">
                <h2 className="ps-subtab-title">System & Regional Preferences</h2>
                <p className="ps-subtab-desc">Configure your preferred currency and display language.</p>

                <div className="ps-field-group">
                  <label className="ps-field-label">Display Currency</label>
                  <select
                    className="ps-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="PHP">Philippine Peso (PHP ₱)</option>
                    <option value="XLM">Stellar Lumens (XLM)</option>
                    <option value="USD">US Dollar ($)</option>
                  </select>
                </div>

                <div className="ps-field-group">
                  <label className="ps-field-label">Preferred Language</label>
                  <select
                    className="ps-input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="en">English (US)</option>
                    <option value="tl">Filipino / Tagalog</option>
                  </select>
                </div>

                <hr className="ps-card-divider" />
                <div className="ps-bottom-actions">
                  <button type="button" className="ps-btn-save" onClick={handleSave}>
                    Save Preferences
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating Save Toast */}
      {savedToast && (
        <div className="ps-toast-notification" role="status">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="#176B45" />
            <path
              d="M6 10.2L8.5 12.7L14 7.2"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Profile changes saved successfully!</span>
        </div>
      )}
    </div>
  );
}
