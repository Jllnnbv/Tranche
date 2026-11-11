"use client";

import { memberNameFromEmail } from "./member-names";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserRequest } from "@/lib/browser-api";
import { LedgerModal, type LedgerData } from "./ledger-modal";
import { DashboardLoading } from "./dashboard-loading";
import { GroupDashboard } from "./group-dashboard";
import { triggerPageTransition, stopPageTransition } from "./page-transition";
import "./dashboard.css";

export type AmbaganItem = {
  id: string;
  purpose: string;
  goal: string;
  start: string;
  deadline: string;
  frequency?: string;
  payments?: number;
  perPayment?: string;
  recipients?: { email: string; share: string }[];
  signature?: string;
  createdAt?: string;
  hasProgress?: boolean;
};
export type PaluwaganItem = AmbaganItem;

export const DEFAULT_SCHOOL_PROJECT: AmbaganItem = {
  id: "school-project",
  purpose: "School Project",
  goal: "756",
  start: "2026-10-14",
  deadline: "2026-11-15",
  frequency: "Bi-weekly",
  payments: 6,
  perPayment: "₱21",
  hasProgress: false,
  recipients: [
    { email: "jullianna.villaluna12@gmail.com", share: "21" },
    { email: "jomari@ambagan.ph", share: "21" },
    { email: "keith@ambagan.ph", share: "21" },
    { email: "matt@ambagan.ph", share: "21" },
    { email: "rivera@ambagan.ph", share: "21" },
    { email: "aniog@ambagan.ph", share: "21" },
  ],
  createdAt: "2026-10-14T00:00:00Z",
};

export const DEFAULT_ANTIPOLO: AmbaganItem = {
  id: "antipolo-trip",
  purpose: "ANTIPOLO TRIP",
  goal: "12000",
  start: "2026-10-14",
  deadline: "2026-11-25",
  frequency: "Bi-weekly",
  payments: 6,
  perPayment: "₱500",
  hasProgress: false,
  recipients: [
    { email: "yana@ambagan.ph", share: "2000" },
    { email: "jomari@ambagan.ph", share: "2000" },
    { email: "keith@ambagan.ph", share: "2000" },
    { email: "matt@ambagan.ph", share: "2000" },
    { email: "rivera@ambagan.ph", share: "2000" },
    { email: "aniog@ambagan.ph", share: "2000" },
  ],
  createdAt: "2026-10-14T00:00:00Z",
};

export const DEFAULT_AMBAGANS: AmbaganItem[] = [DEFAULT_SCHOOL_PROJECT, DEFAULT_ANTIPOLO];

export function calculateDaysLeft(deadlineStr?: string, fallbackDays = 27): string {
  if (!deadlineStr) return `${fallbackDays} days left`;
  try {
    const parts = deadlineStr.split("-");
    const p0 = parts[0];
    const p1 = parts[1];
    const p2 = parts[2];
    if (p0 && p1 && p2) {
      const year = parseInt(p0, 10);
      const month = parseInt(p1, 10) - 1;
      const day = parseInt(p2, 10);
      const target = new Date(Date.UTC(year, month, day));
      const now = new Date();
      const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const diffMs = target.getTime() - todayUtc.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return "Due past deadline";
      if (diffDays === 0) return "Due today";
      if (diffDays === 1) return "1 day left";
      return `${diffDays} days left`;
    }
  } catch {}
  return `${fallbackDays} days left`;
}

// Display name for the signed-in account: its username, else the name part of its email.
function displayName(user: { username?: string; email?: string } | null): string {
  const raw = user?.username?.trim() || user?.email?.split("@")[0]?.split(/[._\d-]/)[0] || "";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

function formatCardDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  const p0 = parts[0];
  const p1 = parts[1];
  const p2 = parts[2];
  if (p0 && p1 && p2) {
    const month = parseInt(p1, 10);
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthName = monthNames[month - 1] || p1;
    return `${monthName} ${p2}, ${p0}`;
  }
  return iso;
}

function formatCardGoal(goal: string): string {
  if (!goal || !goal.trim()) return "";
  const num = parseFloat(goal.replace(/,/g, ""));
  if (isNaN(num)) return `₱ ${goal}`;
  return `₱ ${num.toLocaleString("en-US")}`;
}

export function Dashboard() {
  const [activePlanForDashboard, setActivePlanForDashboard] = useState<AmbaganItem | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "wallet" | "create" | "user">("home");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [ambagans, setAmbagans] = useState<AmbaganItem[]>(DEFAULT_AMBAGANS);
  const [selectedAmbagan, setSelectedAmbagan] = useState<AmbaganItem | null>(null);
  const [isNavigatingContract, setIsNavigatingContract] = useState(false);
  const router = useRouter();
  const [userName, setUserName] = useState("Villaluna Jomari");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const navigateToContract = (url: string) => {
    setIsNavigatingContract(true);
    triggerPageTransition();
    router.push(url);
  };

  const handleOpenGroup = (p: AmbaganItem) => {
    triggerPageTransition();
    setTimeout(() => {
      setActivePlanForDashboard(p);
      stopPageTransition();
    }, 120);
  };

  const handleBackToDashboard = () => {
    triggerPageTransition();
    setTimeout(() => {
      setActivePlanForDashboard(null);
      stopPageTransition();
    }, 120);
  };

  useEffect(() => {
    let mounted = true;
    const loadProfile = () => {
      try {
        const saved = localStorage.getItem("ambagan_user_profile");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.fullName?.trim()) {
            setUserName(parsed.fullName.trim());
          }
          if (parsed?.avatarUrl !== undefined) {
            setAvatarUrl(parsed.avatarUrl);
          }
          return true;
        }
      } catch {}
      return false;
    };

    const hasCustomProfile = loadProfile();

    browserRequest<{ username: string; email: string }>("/api/auth/me").then(
      (user) => {
        if (!mounted) return;
        if (!hasCustomProfile) {
          const dn = displayName(user);
          if (dn) setUserName(dn);
        }
      },
      () => {
        if (mounted) router.replace("/login");
      },
    );

    const handleProfileUpdate = () => {
      loadProfile();
    };

    window.addEventListener("storage", handleProfileUpdate);
    window.addEventListener("ambagan_profile_updated", handleProfileUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleProfileUpdate);
      window.removeEventListener("ambagan_profile_updated", handleProfileUpdate);
    };
  }, [router]);

  async function logOut() {
    triggerPageTransition();
    try {
      await browserRequest("/api/auth/logout", {});
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ambagan_groups") ?? localStorage.getItem("tranche_paluwagans");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter((item: AmbaganItem) => item.id !== "pal-default" && item.id !== "amb-default");
          const hasSchool = filtered.some((item) => item.id === "school-project" || item.purpose?.toLowerCase().includes("school"));
          const list = hasSchool ? filtered : [DEFAULT_SCHOOL_PROJECT, ...filtered];
          setAmbagans(list.length > 0 ? list : DEFAULT_AMBAGANS);
          return;
        }
      }
      setAmbagans(DEFAULT_AMBAGANS);
    } catch {
      setAmbagans(DEFAULT_AMBAGANS);
    }
  }, []);

  // Check URL query parameters for openPlan/plan (e.g., returning from /pay)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("openPlan") || params.get("group") || params.get("plan");
    if (openId) {
      const found =
        ambagans.find((p) => p.id === openId) ||
        (openId === "school-project" ? DEFAULT_SCHOOL_PROJECT : null) ||
        (openId === "antipolo-trip" ? DEFAULT_ANTIPOLO : null);
      if (found) {
        setActivePlanForDashboard(found);
      }
    }
  }, [ambagans]);

  const handleCreateAmbagan = (data: LedgerData) => {
    const newItem: AmbaganItem = {
      id: "amb-" + Date.now(),
      purpose: data.purpose.trim(),
      goal: data.goal.trim(),
      start: data.start,
      deadline: data.deadline,
      frequency: data.frequency,
      payments: data.payments,
      perPayment: data.perPayment,
      recipients: data.recipients,
      signature: data.signature,
      hasProgress: false, // New plans start with 0 paid (first member unpaid)
      createdAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`ambagan_settled_${newItem.id}`, "0");
      localStorage.removeItem(`ambagan_paid_${newItem.id}`);
      if (data.signature) {
        const today = new Date();
        const displayDate = today.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const orgSig = {
          organizer: {
            signatoryId: "organizer",
            name: "Organizer (Ambagan Lead)",
            email: "organizer@ambagan.ph",
            role: "Organizer & Custody Lead",
            type: data.signature.startsWith("data:image/") ? "drawn" : "typed",
            signatureData: data.signature,
            displayDate,
            signedAt: today.toISOString(),
          },
        };
        localStorage.setItem(`ambagan_signatures_${newItem.id}`, JSON.stringify(orgSig));
      }
    } catch {}

    setAmbagans((prev) => {
      const updated = [newItem, ...prev];
      try {
        localStorage.setItem("ambagan_groups", JSON.stringify(updated));
        localStorage.setItem("tranche_paluwagans", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setIsCreateModalOpen(false);
    navigateToContract(`/contract?plan=${encodeURIComponent(newItem.id)}`);
  };

  const handleDeleteAmbagan = (id: string) => {
    setAmbagans((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem("ambagan_groups", JSON.stringify(updated));
        localStorage.setItem("tranche_paluwagans", JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setSelectedAmbagan(null);
  };

  // If a specific purpose card is opened, render its Group Dashboard!
  if (activePlanForDashboard) {
    const isPlanPaid =
      typeof window !== "undefined" &&
      (localStorage.getItem(`ambagan_paid_${activePlanForDashboard.id}`) === "true" ||
        activePlanForDashboard.hasProgress === true);

    return (
      <GroupDashboard
        plan={{
          ...activePlanForDashboard,
          hasProgress: isPlanPaid,
        }}
        onBack={handleBackToDashboard}
        initialMode={isPlanPaid ? "one_paid" : "empty"}
      />
    );
  }

  // Purpose Cards Main View
  return (
    <div className="db">
      {isNavigatingContract && <DashboardLoading />}
      <div className="db-bg" aria-hidden="true" />

      {/* Top Header: Ambagan Logo + Wordmark */}
      <header className="db-header">
        <Link href="/" className="db-brand">
          <div className="db-logo-group">
            <svg
              width="45.41"
              height="44.16"
              viewBox="0 0 45.41 44.16"
              aria-hidden="true"
              style={{ overflow: "visible" }}
            >
              <defs>
                <filter id="db-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="10.38" />
                </filter>
              </defs>
              <g filter="url(#db-glow)">
                <ellipse cx="22.7" cy="22.1" rx="20" ry="20" fill="#B54880" />
              </g>
              <image href="/images/logo.svg" width="45.41" height="44.16" preserveAspectRatio="none" />
            </svg>
          </div>
          <span className="db-brand-name">Ambagan</span>
        </Link>
      </header>

      {/* Frame 51: Left Navigation Sidebar */}
      <aside className="db-sidebar" aria-label="Navigation Sidebar">
        <button
          type="button"
          className={`db-sidebar-btn db-btn-home ${activeTab === "home" ? "db-btn-active" : ""}`}
          onClick={() => setActiveTab("home")}
          aria-label="Home"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#B54880" aria-hidden="true">
            <path d="M12 2.5 2.5 11h2.7V21h5.6v-6h2.4v6h5.6V11h2.7z" />
          </svg>
        </button>

        <button
          type="button"
          className={`db-sidebar-btn db-btn-wallet ${activeTab === "wallet" ? "db-btn-active" : ""}`}
          onClick={() => router.push("/pay")}
          aria-label="Payments"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#E1EDA0" aria-hidden="true">
            <path
              d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v6h3.5l1 2h7l1-2H20V6zm0 8v4h16v-4h-2.4l-1 2H7.400l-1-2z"
              fillRule="evenodd"
            />
          </svg>
        </button>

        <button
          type="button"
          className={`db-sidebar-btn db-btn-plus ${activeTab === "create" ? "db-btn-active" : ""}`}
          onClick={() => setIsCreateModalOpen(true)}
          aria-label="Create Ambagan"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3v18M3 12h18" stroke="#E1EDA0" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          className={`db-sidebar-btn db-btn-user ${activeTab === "user" ? "db-btn-active" : ""}`}
          onClick={() => {
            triggerPageTransition();
            router.push("/profile");
          }}
          aria-label="User profile"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#E1EDA0" aria-hidden="true">
            <circle cx="12" cy="8" r="4.5" />
            <path d="M3.500 21c0-4.500 3.800-7 8.500-7s8.500 2.500 8.500 7z" />
          </svg>
        </button>
      </aside>

      {/* Frame 27: Main Purpose Cards View */}
      <main className="db-main-card">
        {/* Card Header Row */}
        <header className="db-card-header">
          <div className="db-greeting">
            <div
              className="db-greeting-link"
              role="button"
              tabIndex={0}
              onClick={() => {
                triggerPageTransition();
                router.push("/profile");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  triggerPageTransition();
                  router.push("/profile");
                }
              }}
              title="Open User Profile Settings"
            >
              <h1 className="db-greeting-title">{userName ? `Good day, ${userName}!` : "Good day!"}</h1>
              <span className="db-greeting-pill">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>Profile</span>
              </span>
            </div>
            <p className="db-greeting-sub">Select a purpose card below to view its live rotating savings dashboard.</p>
          </div>

          <div className="db-header-controls">
            <div className="db-date-pill">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#176B45" strokeWidth="2" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>October 14, 2026</span>
            </div>

            <div
              className="db-avatar"
              title={`${userName || "User"} (Profile Settings)`}
              role="button"
              tabIndex={0}
              onClick={() => {
                triggerPageTransition();
                router.push("/profile");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  triggerPageTransition();
                  router.push("/profile");
                }
              }}
              style={{ cursor: "pointer", overflow: "hidden" }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || "Profile"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : (
                <span>{userName ? userName.charAt(0).toUpperCase() : "U"}</span>
              )}
            </div>
            <button type="button" className="db-logout" onClick={() => void logOut()}>
              Log out
            </button>

            <button
              type="button"
              className="db-btn-create-paluwagan db-btn-create-ambagan"
              onClick={() => setIsCreateModalOpen(true)}
            >
              + Create Ambagan
            </button>
          </div>
        </header>

        {/* Purpose Cards Container */}
        <div className="db-cards-container">
          {ambagans.map((p) => {
            const displayTitle = p.purpose?.startsWith("<<") ? "" : (p.purpose ?? "");
            const displayStart = p.start ? `Started: ${formatCardDate(p.start)}` : "";
            const displayDeadline = p.deadline ? `Deadline: ${formatCardDate(p.deadline)}` : "";
            const displayGoal = formatCardGoal(p.goal);
            const daysLeft = calculateDaysLeft(p.deadline, p.id === "antipolo-trip" ? 27 : 17);
            const memberCount = p.recipients?.length || p.payments || 6;
            const extraMembers = Math.max(0, memberCount - 3);
            const totalRounds = p.payments || memberCount || 6;
            let settledNow = p.id === "antipolo-trip" ? 2 : 0;
            try {
              const st = localStorage.getItem(`ambagan_settled_${p.id}`);
              if (st !== null) settledNow = Number(st);
              else if (localStorage.getItem(`ambagan_paid_${p.id}`) === "true") settledNow = 1;
            } catch {}
            const nextRecipient = p.recipients?.length ? p.recipients[settledNow % p.recipients.length] : undefined;
            const nextPayerLabel = nextRecipient ? memberNameFromEmail(nextRecipient.email, settledNow) : "Next member";
            const currentRound = p.hasProgress ? 3 : 1;

            return (
              <div key={p.id} className="db-purpose-card">
                <div className="db-card-content">
                  <div className="db-card-illu-glow" aria-hidden="true" />

                  <img
                    src="/images/image-14.svg"
                    alt=""
                    width={90}
                    height={88}
                    className="db-card-illu-img"
                    onClick={() => handleOpenGroup(p)}
                    style={{ cursor: "pointer" }}
                  />

                  {/* Badges: Round & Days Left (from the group status) */}
                  <div className="db-card-badges">
                    <span className="db-badge-pill db-badge-green" title={`Round ${currentRound} of ${totalRounds}`}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M11 14v-1.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3V14" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="6.5" cy="4.5" r="2.5" stroke="#176B45" strokeWidth="2" />
                        <path d="M14 14v-1a2.5 2.5 0 0 0-2-2.45M10.5 2.1a2.5 2.5 0 0 1 0 4.8" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <span>Round {currentRound} of {totalRounds}</span>
                    </span>

                    <span className="db-badge-pill db-badge-amber" title={daysLeft}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                        <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      <span>{daysLeft}</span>
                    </span>
                  </div>

                  <div className="db-card-text">
                    <h3
                      className="db-card-title"
                      title={displayTitle}
                      onClick={() => handleOpenGroup(p)}
                      style={{ cursor: "pointer" }}
                    >
                      {displayTitle}
                    </h3>
                    <p className="db-card-desc-1" title={displayStart}>
                      {displayStart}
                    </p>
                    <p className="db-card-desc-2" title={displayDeadline}>
                      {displayDeadline}
                    </p>
                  </div>

                  {/* Group Members Snippet (how many they are) */}
                  <div className="db-card-members" title={`${memberCount} members`}>
                    <div className="db-avatar-stack">
                      <span className="db-member-avatar" style={{ background: "#B54880" }} />
                      <span className="db-member-avatar" style={{ background: "#176B45" }} />
                      <span className="db-member-avatar" style={{ background: "#D97706" }} />
                      {extraMembers > 0 && <span className="db-member-avatar db-avatar-count">+{extraMembers}</span>}
                    </div>
                    <span className="db-members-note">{memberCount} members · {nextPayerLabel} pays next</span>
                  </div>

                  <div className="db-card-action">
                    <div className="db-card-price-col">
                      <span className="db-card-price" title={displayGoal}>
                        {displayGoal}
                      </span>
                      {p.perPayment && (
                        <span className="db-card-per-payment" title={`${p.perPayment} per cycle`}>
                          {p.perPayment}/cycle
                        </span>
                      )}
                    </div>
                    <div className="db-card-btn-row">
                      <button
                        type="button"
                        onClick={() => handleOpenGroup(p)}
                        className="db-card-btn db-card-btn-view"
                        aria-label={`View ${displayTitle || "ambagan"}`}
                      >
                        <span className="db-card-btn-label">View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateToContract(`/contract?plan=${encodeURIComponent(p.id)}`)}
                        className="db-card-btn"
                        aria-label={`Open e-contract for ${displayTitle || "ambagan"}`}
                      >
                        <span className="db-card-btn-label">Contract</span>
                      </button>
                      <Link
                        href={`/pay?plan=${encodeURIComponent(p.id)}`}
                        className="db-card-btn"
                        aria-label={`Pay ${displayTitle || "ambagan"}`}
                      >
                        <span className="db-card-btn-label">Pay</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Ambagan Card */}
          <div
            className="db-card-create"
            role="button"
            tabIndex={0}
            onClick={() => setIsCreateModalOpen(true)}
            onKeyDown={(e) => e.key === "Enter" && setIsCreateModalOpen(true)}
            aria-label="Create Ambagan"
          >
            <div className="db-create-circle">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                <path d="M15 6v18M6 15h18" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </main>

      {/* Ledger Creation Modal */}
      {isCreateModalOpen && (
        <LedgerModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateAmbagan}
        />
      )}
    </div>
  );
}
