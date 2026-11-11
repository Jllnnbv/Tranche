"use client";

import { memberNameFromEmail, firstAmount } from "./member-names";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { triggerPageTransition, stopPageTransition } from "./page-transition";
import { calculateDaysLeft } from "./dashboard";
import {
  getRoundDueDate,
  computeTotalRounds,
  getRoundRecipientInfo,
  normalizeFrequency,
} from "./schedule-helper";
import "./group-dashboard.css";

/* Figma frame "DASHBOARD" (node 83-2244) is designed at 1480 × 1024. */
const FRAME_WIDTH = 1480;
const FRAME_HEIGHT = 1024;

/* ---------- Icons ---------- */
type IconName =
  | "check"
  | "checkOnly"
  | "clock"
  | "star"
  | "refresh"
  | "alert"
  | "shield"
  | "link"
  | "card"
  | "trend"
  | "grid"
  | "chevrons"
  | "user"
  | "wallet"
  | "plus";

const ICON_PATHS: Record<IconName, ReactNode> = {
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  checkOnly: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </>
  ),
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />,
  link: (
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  ),
  card: <rect x="3" y="6" width="18" height="13" rx="2" fill="currentColor" stroke="none" />,
  trend: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16" />
    </>
  ),
  chevrons: <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4.2" fill="currentColor" stroke="none" />
      <path d="M3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5z" fill="currentColor" stroke="none" />
    </>
  ),
  wallet: (
    <path
      d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v6h3.5l1 2h7l1-2H20V6zm0 8v4h16v-4h-2.4l-1 2H7.400l-1-2z"
      fillRule="evenodd"
      fill="currentColor"
      stroke="none"
    />
  ),
  plus: <path d="M12 3v18M3 12h18" strokeWidth="2.5" strokeLinecap="round" />,
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`gd-icon ${className ?? ""}`} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ---------- Data Types ---------- */
type PoolSlice = { label: string; color: string; amount: number };

type Member = {
  name: string;
  initials: string;
  slot: string;
  status: string;
  statusType: "paid" | "pending" | "winner" | "processing" | "unpaid" | "empty" | "next-payer" | "scheduled";
  statusIcon: IconName;
  paid: string;
  securityType: "secured" | "chained" | "empty";
  securityLabel: string;
  securityIcon: IconName;
  highlight?: boolean;
  contractSigned?: boolean;
  turnRole?: "paid_already" | "next_to_pay" | "scheduled";
  turnNote?: string;
};

type Round = {
  n: number;
  state: "done" | "current" | "upcoming";
  drawn?: string;
};

const peso = (v: number) => `₱${v.toLocaleString("en-PH")}`;

function donutBackground(slices: PoolSlice[]): string {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  if (total === 0) return "#E5E7EB";
  let acc = 0;
  const stops = slices.map((s) => {
    const start = (acc / total) * 100;
    acc += s.amount;
    return `${s.color} ${start}% ${(acc / total) * 100}%`;
  });
  return `conic-gradient(${stops.join(",")})`;
}

function useFrameScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setScale(Math.min(1, Math.max(0.65, w / FRAME_WIDTH)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

export type GroupDashboardProps = {
  plan?: {
    id: string;
    purpose: string;
    goal: string;
    start?: string;
    deadline?: string;
    frequency?: string;
    payments?: number;
    perPayment?: string;
    recipients?: { email: string; share: string }[];
    signature?: string;
    hasProgress?: boolean;
    isPaid?: boolean;
  };
  onBack?: () => void;
  defaultHasProgress?: boolean;
  initialMode?: "empty" | "one_paid" | "multi_paid";
};

function formatContractDate(iso?: string): string {
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

export function GroupDashboard({ plan, onBack, defaultHasProgress, initialMode }: GroupDashboardProps) {
  const scale = useFrameScale();
  const router = useRouter();
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const currentPlanId = plan?.id || "school-project";

  const [activeFrequency, setActiveFrequency] = useState<string>(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`ambagan_freq_${currentPlanId}`);
        if (saved) return saved;
      }
    } catch {}
    return plan?.frequency || "Weekly";
  });

  useEffect(() => {
    const handleFreqChange = (e: any) => {
      if (e?.detail?.groupId === currentPlanId && e?.detail?.frequency) {
        setActiveFrequency(e.detail.frequency);
      }
    };
    window.addEventListener("ambagan_frequency_changed", handleFreqChange);
    return () => window.removeEventListener("ambagan_frequency_changed", handleFreqChange);
  }, [currentPlanId]);

  const recips = plan?.recipients ?? [];
  const memberCount = Math.max(
    1,
    recips.length || (currentPlanId === "antipolo-trip" || currentPlanId === "school-project" ? 6 : 2)
  );
  const DEFAULT_NAMES = ["Villaluna J.", "Villaluna Jomari", "Speirs Keith", "Mondares Matt", "Rivera M.", "Aniog D."];
  const memberNames = Array.from({ length: memberCount }, (_, i) =>
    recips[i]?.email ? memberNameFromEmail(recips[i]!.email, i) : DEFAULT_NAMES[i] ?? `Member ${i + 1}`
  );

  const contractStart = plan?.start || "2026-10-14";
  const contractDeadline = plan?.deadline || "2026-11-25";
  const daysLeftText = calculateDaysLeft(contractDeadline, plan?.id === "antipolo-trip" ? 27 : 17);
  const formattedStart = formatContractDate(contractStart);
  const formattedDeadline = formatContractDate(contractDeadline);

  const totalRounds = computeTotalRounds(
    contractStart,
    contractDeadline,
    activeFrequency,
    memberCount,
    plan?.payments
  );
  const multiK = Math.min(totalRounds, Math.max(2, Math.ceil(totalRounds / 2)));

  // 3 Demo presentation modes:
  // - "empty": 0/totalRounds paid (Right Photo, No Progress)
  // - "one_paid": 1/totalRounds paid (Demo: Slot 1 Paid & Secured on ledger!)
  // - "multi_paid": multiK/totalRounds paid (Left Photo, Active Progress)
  const [demoMode, setDemoMode] = useState<"empty" | "one_paid" | "multi_paid">(() => {
    if (initialMode) return initialMode;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ambagan_settled_" + currentPlanId);
      if (stored !== null && !isNaN(Number(stored))) {
        const val = Number(stored);
        if (val === 0) return "empty";
        if (val === 1) return "one_paid";
        return "multi_paid";
      }
      const isPaid = localStorage.getItem("ambagan_paid_" + currentPlanId) === "true";
      if (isPaid) return "one_paid";
    }
    if (plan?.hasProgress) return "multi_paid";
    return defaultHasProgress ? "multi_paid" : "empty";
  });

  const [settledOverride, setSettledOverride] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("ambagan_settled_" + currentPlanId);
      if (stored !== null && !isNaN(Number(stored))) return Number(stored);
    } catch {}
    return null;
  });

  useEffect(() => {
    const checkPaid = () => {
      try {
        const stored = localStorage.getItem("ambagan_settled_" + currentPlanId);
        if (stored !== null && !isNaN(Number(stored))) {
          const val = Number(stored);
          setSettledOverride(val);
          if (val === 0) setDemoMode("empty");
          else if (val === 1) setDemoMode("one_paid");
          else setDemoMode("multi_paid");
          return;
        }
        const isPaid = localStorage.getItem("ambagan_paid_" + currentPlanId) === "true";
        if (isPaid) {
          setDemoMode("one_paid");
          setSettledOverride(1);
        }
      } catch {}
    };
    checkPaid();
    window.addEventListener("ambagan_payment_completed", checkPaid);
    window.addEventListener("storage", checkPaid);
    return () => {
      window.removeEventListener("ambagan_payment_completed", checkPaid);
      window.removeEventListener("storage", checkPaid);
    };
  }, [currentPlanId]);

  const handleSetSettled = (count: number) => {
    const clamped = Math.min(totalRounds, Math.max(0, count));
    setSettledOverride(clamped);
    if (clamped === 0) setDemoMode("empty");
    else if (clamped === 1) setDemoMode("one_paid");
    else setDemoMode("multi_paid");
    try {
      localStorage.setItem("ambagan_settled_" + currentPlanId, String(clamped));
      if (clamped > 0) {
        localStorage.setItem("ambagan_paid_" + currentPlanId, "true");
        localStorage.setItem("ambagan_last_paid_plan", currentPlanId);
      } else {
        localStorage.removeItem("ambagan_paid_" + currentPlanId);
      }
      window.dispatchEvent(
        new CustomEvent("ambagan_payment_completed", {
          detail: { groupId: currentPlanId, settledCount: clamped },
        })
      );
    } catch {}
  };

  const handleAdvanceNextRound = () => {
    const next = Math.min(totalRounds, settled + 1);
    handleSetSettled(next);
  };

  const handleSetMode = (mode: "empty" | "one_paid" | "multi_paid") => {
    const count = mode === "empty" ? 0 : mode === "one_paid" ? 1 : multiK;
    handleSetSettled(count);
  };

  const isEmpty = demoMode === "empty";
  const isOnePaid = demoMode === "one_paid";
  const isMultiPaid = demoMode === "multi_paid";
  const hasProgress = !isEmpty;

  const purposeName = plan?.purpose?.trim() || (currentPlanId === "school-project" ? "School Project" : "ANTIPOLO TRIP");
  const goalNum = plan?.goal
    ? parseFloat(plan.goal.replace(/,/g, "")) || (currentPlanId === "school-project" ? 756 : 12000)
    : (currentPlanId === "school-project" ? 756 : 12000);
  const contributionNum = plan?.perPayment
    ? firstAmount(plan.perPayment) || (currentPlanId === "school-project" ? 21 : 500)
    : (currentPlanId === "school-project" ? 21 : 500);

  const settled = isEmpty
    ? 0
    : settledOverride !== null
    ? Math.min(totalRounds, Math.max(0, settledOverride))
    : isOnePaid
    ? Math.min(1, totalRounds)
    : Math.min(totalRounds, Math.max(1, multiK));

  const nextRound = settled < totalRounds ? settled + 1 : null;
  const nextInfo = nextRound !== null ? getRoundRecipientInfo(memberNames, nextRound) : null;
  const nextName = nextInfo ? nextInfo.name : "All rounds settled";
  const nextSlot = nextInfo ? nextInfo.slotLabel : "";
  const nextIdx = nextInfo ? nextInfo.slotIndex : -1;

  const payoutDateText = (round: number) => {
    const d = getRoundDueDate(contractStart, contractDeadline, activeFrequency, round, totalRounds);
    return formatContractDate(d.toISOString().slice(0, 10));
  };
  const nextDueDate = nextRound !== null ? payoutDateText(nextRound) : "";

  const pct = Math.round((settled / totalRounds) * 100);
  const roundBadgeText = isEmpty
    ? `ROUND — / ${totalRounds}`
    : settled >= totalRounds
    ? `ROUND ${totalRounds} / ${totalRounds}`
    : `ROUND ${Math.max(1, settled)} / ${totalRounds}`;
  const nextDrawDateText = isEmpty
    ? "—"
    : nextRound !== null
    ? payoutDateText(nextRound)
    : "Completed";
  const membersPaidText = `${settled}/${totalRounds}`;
  const membersPaidPercent = `${pct}%`;
  const collectedText = peso(Math.round(contributionNum * settled * 100) / 100);
  const completionText = `${pct}%`;
  const completionMeta =
    settled >= totalRounds
      ? `All ${totalRounds} rounds settled`
      : `${totalRounds - settled} round${totalRounds - settled === 1 ? "" : "s"} left`;

  const poolSlices: PoolSlice[] = isEmpty
    ? [
        { label: "Disbursed", color: "#e5e7eb", amount: 0 },
        { label: "Active Round", color: "#e5e7eb", amount: 0 },
        { label: "Pending", color: "#e5e7eb", amount: 0 },
        { label: "Fees", color: "#e5e7eb", amount: 0 },
      ]
    : [
        { label: "Disbursed", color: "#2d6a3e", amount: Math.round(contributionNum * Math.max(0, settled - 1)) },
        { label: "Active Round", color: "#5fad41", amount: Math.round(contributionNum) },
        { label: "Pending", color: "#e5e7eb", amount: Math.max(0, Math.round(goalNum - contributionNum * settled)) },
        { label: "Fees", color: "#fdf3b0", amount: 0 },
      ];

  const initialsOf = (n: string) =>
    n.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const members: Member[] = memberNames.map((name, i) => {
    const isNext = !isEmpty && nextIdx === i && settled < totalRounds;
    const paid =
      settled >= totalRounds ||
      (!isNext && settled > 0 && ((settled % memberCount) > i || settled >= memberCount));
    return {
      name,
      initials: initialsOf(name),
      slot: `Slot ${i + 1}`,
      status: paid ? "Paid" : isNext ? "Next to Pay" : "Scheduled",
      statusType: paid ? "paid" : isNext ? "next-payer" : "scheduled",
      statusIcon: paid ? "check" : "clock",
      paid: paid ? peso(contributionNum) : "—",
      securityType: paid ? "secured" : "chained",
      securityLabel: paid ? "Secured" : "Chained",
      securityIcon: paid ? "shield" : "link",
      contractSigned: true,
      turnRole: paid ? "paid_already" : isNext ? "next_to_pay" : "scheduled",
    };
  });

  // Dynamic Contract Signatories & Member Status Mapping (Connected to all members)
  const contractSignatories = members.map((m, idx) => {
    const isSigned = m.contractSigned !== false;
    let payBadgeLabel = "";
    let payBadgeType = "scheduled";

    if (m.status === "Paid" || m.statusType === "paid") {
      payBadgeLabel = "Paid";
      payBadgeType = "paid";
    } else if (m.status === "Next to Pay" || (nextIdx === idx && settled < totalRounds)) {
      payBadgeLabel = "Next to Pay";
      payBadgeType = "next";
    } else if (m.statusType === "winner") {
      payBadgeLabel = "Drawn";
      payBadgeType = "paid";
    } else {
      payBadgeLabel = "Scheduled";
      payBadgeType = "scheduled";
    }

    return {
      name: m.name,
      slot: m.slot,
      isSigned,
      payBadgeLabel,
      payBadgeType,
    };
  });

  const handleHomeClick = () => {
    triggerPageTransition();
    if (onBack) {
      setTimeout(() => {
        onBack();
        stopPageTransition();
      }, 100);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="gd-viewport" style={{ height: Math.max(760, FRAME_HEIGHT * scale) }}>
      <div className="gd" style={{ transform: `scale(${scale})` }}>
        {/* Brand */}
        <header className="gd-brand">
          <button
            type="button"
            onClick={handleHomeClick}
            className="gd-brand__link"
            style={{ cursor: "pointer", background: "none", border: "none" }}
            aria-label="Back to Ambagan Dashboard"
          >
            <div className="gd-logo-group">
              <svg width="45.41" height="44.16" viewBox="0 0 45.41 44.16" style={{ overflow: "visible" }}>
                <defs>
                  <filter id="gd-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="10.38" />
                  </filter>
                </defs>
                <g filter="url(#gd-glow)">
                  <ellipse cx="22.7" cy="22.1" rx="20" ry="20" fill="#B54880" />
                </g>
                <image href="/images/logo.svg" width="45.41" height="44.16" preserveAspectRatio="none" />
              </svg>
            </div>
            <span className="gd-brand__name">Ambagan</span>
          </button>
        </header>

        {/* Presentation & Demo Mode Controller */}
        <div className="gd-presentation-bar" role="toolbar" aria-label="Demo mode selector">
          <div className="gd-mode-group">
            <button
              type="button"
              className={`gd-mode-btn ${demoMode === "empty" ? "is-active" : ""}`}
              onClick={() => handleSetMode("empty")}
              title={`Demonstrate 0/${totalRounds} rounds paid (Empty/New group)`}
            >
              ○ Round 0 / {totalRounds} (New)
            </button>
            <button
              type="button"
              className={`gd-mode-btn gd-mode-btn--highlight ${demoMode === "one_paid" ? "is-active" : ""}`}
              onClick={() => handleSetMode("one_paid")}
              title={`Demonstrate Round 1/${totalRounds} paid (${memberNames[0]} contribution verified on blockchain)`}
            >
              ⚡ Round 1 / {totalRounds} (Demo)
            </button>
            {totalRounds > 2 && (
              <button
                type="button"
                className={`gd-mode-btn ${demoMode === "multi_paid" ? "is-active" : ""}`}
                onClick={() => handleSetMode("multi_paid")}
                title={`Demonstrate active group with Round ${multiK}/${totalRounds} completed`}
              >
                ● Round {multiK} / {totalRounds} (Active)
              </button>
            )}
            {settled < totalRounds && (
              <button
                type="button"
                className="gd-mode-btn"
                style={{ borderColor: "#2d6a3f", color: "#166534", fontWeight: 700 }}
                onClick={handleAdvanceNextRound}
                title={`Advance to next round (Round ${settled + 1} of ${totalRounds})`}
              >
                ▶ Next Round (+1)
              </button>
            )}
          </div>
          {settled < totalRounds ? (
            <Link
              href={`/pay?plan=${encodeURIComponent(currentPlanId)}&round=${nextRound}`}
              className="gd-demo-pay-btn"
              title={`Pay Round ${nextRound} contribution as ${nextName}`}
            >
              Pay Round {nextRound} as {nextName} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => handleSetMode("empty")}
              className="gd-demo-pay-btn"
              style={{ background: "#166534", color: "#ffffff", border: "none", cursor: "pointer" }}
              title="All rounds settled! Click to restart Ambagan cycle"
            >
              ✓ All {totalRounds} Rounds Settled · Restart ↺
            </button>
          )}
        </div>

        {/* Sidebar (Frame 51) */}
        <nav className="gd-sidebar" aria-label="Main navigation">
          <div className="gd-sidebar__top">
            <button
              type="button"
              className="gd-sidebar__btn is-active"
              onClick={handleHomeClick}
              aria-label="Home / Dashboard"
              title="Return to Purpose Cards"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#B54880" aria-hidden="true">
                <path d="M12 2.5 2.5 11h2.7V21h5.6v-6h2.4v6h5.6V11h2.7z" />
              </svg>
            </button>
            <Link href={`/pay?plan=${encodeURIComponent(plan?.id || "antipolo-trip")}`} className="gd-sidebar__btn" aria-label="Wallet">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#E1EDA0" aria-hidden="true">
                <path
                  d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v6h3.5l1 2h7l1-2H20V6zm0 8v4h16v-4h-2.4l-1 2H7.400l-1-2z"
                  fillRule="evenodd"
                />
              </svg>
            </Link>
            <button
              type="button"
              className="gd-sidebar__btn"
              onClick={handleHomeClick}
              aria-label="Create new plan"
              title="Create new plan"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v18M3 12h18" stroke="#E1EDA0" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="gd-sidebar__arrow" aria-hidden="true">
            <Icon name="chevrons" />
          </div>

          <button
            type="button"
            className="gd-sidebar__btn gd-sidebar__profile"
            onClick={() => {
              triggerPageTransition();
              router.push("/profile");
            }}
            aria-label="Profile"
          >
            <Icon name="user" />
          </button>
        </nav>

        {/* Group header */}
        <section className="gd-group-header">
          <div className="gd-group-header__text">
            <h1 className="gd-group-header__title">{purposeName}</h1>
            <p className="gd-group-header__subtitle">Ambagan-Based Rotating Savings</p>
          </div>
          <div className="gd-round-badge">
            {roundBadgeText}
          </div>
        </section>

        {/* Summary cards */}
        <div className="gd-summary gd-summary--pool">
          <span className="gd-summary__label">Total Pool</span>
          <span className="gd-summary__value">{peso(goalNum)}</span>
        </div>
        <div className="gd-summary gd-summary--draw">
          <span className="gd-summary__label">Next Draw Date</span>
          <span className="gd-summary__value gd-summary__value--date">
            {nextDrawDateText}
          </span>
        </div>

        {/* Main panel (members-card) */}
        <main className="gd-panel gd-main">
          {/* System Status & Member Payment Monitor Banner */}
          <div className="gd-payment-banner">
            <div className="gd-payment-banner__top">
              <div className="gd-payment-banner__left">
                <span className="gd-payment-banner__badge">
                  {settled >= totalRounds
                    ? "✓ All Rounds Settled"
                    : isOnePaid
                    ? "✓ Round 1 Settled"
                    : isMultiPaid
                    ? `● Round ${settled} Active`
                    : "○ Contract Ready"}
                </span>
                <span className="gd-payment-banner__text">
                  {settled >= totalRounds ? (
                    <>
                      <strong>All {totalRounds} Rounds Settled</strong>. Ambagan goal of <strong>{peso(goalNum)}</strong> fully disbursed across all {memberCount} members.
                    </>
                  ) : isOnePaid ? (
                    <>
                      <strong>{memberNames[0]}</strong> paid <strong>{peso(contributionNum)}</strong> contribution for Round 1. Secured on blockchain.
                    </>
                  ) : isMultiPaid ? (
                    <>
                      <strong>{settled} of {totalRounds} Rounds Settled</strong>. Next draw scheduled for <strong>{nextName}</strong> ({nextSlot}) on <strong>{nextDueDate}</strong>.
                    </>
                  ) : (
                    <>
                      <strong>E-Contract Distributed</strong>. Awaiting Round 1 contribution from <strong>{memberNames[0]}</strong>.
                    </>
                  )}
                </span>
              </div>
              <div className="gd-payment-banner__right">
                <button
                  type="button"
                  className="gd-payment-banner__action"
                  onClick={() => setShowReceiptModal(true)}
                >
                  View Receipt
                </button>
                <Link
                  href={`/contract?plan=${encodeURIComponent(currentPlanId)}`}
                  className="gd-payment-banner__action gd-payment-banner__action--contract"
                  style={{ textDecoration: "none" }}
                  title="Open the legally binding E-Contract agreement"
                >
                  View Contract
                </Link>
                {settled > 0 && (
                  <button
                    type="button"
                    className="gd-payment-banner__action gd-payment-banner__action--reset"
                    onClick={() => handleSetMode("empty")}
                    title={`Reset demo to 0/${totalRounds}`}
                  >
                    Reset to 0/{totalRounds}
                  </button>
                )}
              </div>
            </div>

            {/* System Live Monitor Strip: Who paid already, Who will pay next, System update */}
            <div className="gd-system-monitor-strip">
              <span className="gd-monitor-tag gd-monitor-tag--who-paid" title="Members who have contributed to the active round">
                <strong>✓ Paid Already:</strong>{" "}
                {settled === 0
                  ? "None yet (Round 1 pending)"
                  : settled === 1
                  ? `${memberNames[0]} (Round 1 · ${peso(contributionNum)})`
                  : `Rounds 1–${settled} of ${totalRounds} Settled on Ledger`}
              </span>
              <span className="gd-monitor-tag gd-monitor-tag--who-next" title="Next member in queue scheduled to contribute">
                <strong>🕒 Who Will Pay Next:</strong>{" "}
                {nextRound !== null
                  ? `${nextName} (${nextSlot} · Round ${nextRound} · Due ${nextDueDate})`
                  : `All ${totalRounds} rounds settled · Cycle completed`}
              </span>
              <span className="gd-monitor-tag gd-monitor-tag--system-update" title="Live status of contract consensus and ledger settlement">
                <strong>● System Update:</strong>{" "}
                {settled >= totalRounds
                  ? `Contract Consensus 100% · All ${totalRounds} Rounds Settled on Stellar Soroban`
                  : isOnePaid
                  ? `${memberCount}/${memberCount} Members Bound · Round 1 Settled on Stellar Soroban`
                  : isMultiPaid
                  ? `Cadence: ${activeFrequency} · ${settled}/${totalRounds} Settled · Active Multisig Escrow`
                  : "Contract Signed by Organizer · Awaiting First Contribution"}
              </span>
            </div>
          </div>
          <div className="gd-overview">
            <div className="gd-overview__left">
              {/* Network status */}
              <div className="gd-card gd-network">
                <div className="gd-network__icon">
                  <Icon name="shield" />
                </div>
                <div className="gd-network__info">
                  <span className="gd-muted">Network Status</span>
                  <span className="gd-network__status">
                    <i className="gd-dot" />
                    SECURED <em>(Blockchain)</em>
                  </span>
                </div>
                <div className="gd-network__tags">
                  <span className="gd-tag">
                    <Icon name="link" />
                    On-Chain
                  </span>
                  <span className="gd-tag">
                    <Icon name="card" />
                    Method Payment
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="gd-stats">
                <div className="gd-card gd-stat">
                  <span className="gd-stat__label">Members Paid</span>
                  <span className="gd-stat__value">{membersPaidText}</span>
                  <span className={`gd-stat__meta ${!isEmpty ? "gd-stat__meta--green" : ""}`}>
                    <Icon name="trend" />
                    {membersPaidPercent}
                  </span>
                </div>
                <div className="gd-card gd-stat">
                  <span className="gd-stat__label">Collected</span>
                  <span className="gd-stat__value">{collectedText}</span>
                  <span className="gd-stat__meta">
                    <b className="gd-stat__currency">₱</b> of {peso(goalNum)}
                  </span>
                </div>
                <div className="gd-card gd-stat">
                  <span className="gd-stat__label">Completion</span>
                  <span className="gd-stat__value">{completionText}</span>
                  <span className={`gd-stat__meta ${!isEmpty ? "gd-stat__meta--amber" : ""}`}>
                    <Icon name="clock" />
                    {completionMeta}
                  </span>
                </div>
              </div>
            </div>

            {/* Pool breakdown card */}
            <div className="gd-card gd-breakdown">
              <div className="gd-breakdown__head">
                <h3>Pool Breakdown</h3>
                <span className="gd-chip">{peso(goalNum)}</span>
              </div>
              <div className="gd-breakdown__body">
                <div
                  className={`gd-donut ${!hasProgress ? "gd-donut--empty" : ""}`}
                  style={{ background: donutBackground(poolSlices) }}
                />
                <ul className="gd-legend">
                  {poolSlices.map((s) => (
                    <li key={s.label}>
                      <span
                        className="gd-legend__swatch"
                        style={{ background: hasProgress ? s.color : "#E5E7EB" }}
                      />
                      <span>{s.label}</span>
                      <span className="gd-legend__value">{peso(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Members table */}
          <div className="gd-members">
            <h2 className="gd-section-title">
              <span className="gd-section-title__icon">
                <Icon name="grid" />
              </span>
              GROUP MEMBERS &amp; STATUS
            </h2>
            <table className="gd-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Assigned Slot</th>
                  <th>Payment Status</th>
                  <th>Amount Contributed</th>
                  <th>Security / Blockchain</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className={m.highlight ? "is-highlight" : undefined}>
                    <td>
                      <div className="gd-member">
                        <span
                          className={`gd-member__avatar ${
                            isEmpty && !m.initials ? "gd-member__avatar--empty" : ""
                          }`}
                        >
                          {m.initials}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span
                            className={`gd-member__name ${
                              isEmpty && !m.name ? "gd-member__name--empty" : ""
                            }`}
                          >
                            {m.name || "—"}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: m.contractSigned !== false ? "#16a34a" : "#ca8a04",
                              lineHeight: "13px",
                            }}
                          >
                            {m.contractSigned !== false ? "✓ Contract Signed" : "⏳ Pending Signature"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`gd-slot-text ${isEmpty && !m.slot ? "gd-slot-text--empty" : ""}`}>
                        {m.slot || "—"}
                      </span>
                    </td>
                    <td>
                      {isEmpty && i === 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="gd-status-pill gd-status-pill--next-payer">
                            <Icon name="clock" />
                            Next to Pay
                          </span>
                          <button
                            type="button"
                            className="gd-pay-inline-btn"
                            onClick={() => handleSetMode("one_paid")}
                            title={`Simulate ${memberNames[0]} paying ${peso(contributionNum)} contribution`}
                          >
                            ⚡ Demo Pay
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`gd-status-pill ${
                            m.statusType ? `gd-status-pill--${m.statusType}` : "gd-status-pill--empty"
                          }`}
                        >
                          <Icon name={m.statusIcon} />
                          {m.status}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="gd-amount">
                        <span
                          className={`gd-amount__val ${
                            m.paid === "—"
                              ? "gd-amount__val--empty"
                              : m.statusType === "paid"
                              ? "gd-amount__val--paid"
                              : ""
                          }`}
                        >
                          {m.paid}
                        </span>
                        <span className="gd-amount__denom">/ {peso(contributionNum)}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`gd-status-pill ${
                          m.securityType
                            ? `gd-status-pill--${m.securityType}`
                            : "gd-status-pill--empty"
                        }`}
                      >
                        <Icon name={m.securityIcon} />
                        {m.securityLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        {/* Round timeline (timeline-card) */}
        <aside className="gd-panel gd-timeline">
          <div className="gd-timeline__head">
            <h3>
              <Icon name="clock" />
              ROUND TIMELINE
            </h3>
            <button
              type="button"
              className="gd-timeline__receipt"
              onClick={() => setShowReceiptModal(true)}
            >
              RECEIPT
            </button>
          </div>
          <ol className="gd-timeline__list">
            {Array.from({ length: totalRounds }, (_, k) => k + 1).map((roundNum) => {
              const isDone = !isEmpty && roundNum <= settled;
              const isLatestSettled = !isEmpty && roundNum === settled && settled > 0;
              const isNext = !isEmpty && roundNum === settled + 1;
              const whoInfo = getRoundRecipientInfo(memberNames, roundNum);
              const who = whoInfo.name;
              const roundDueDate = payoutDateText(roundNum);

              return (
                <li key={roundNum} className={`gd-timeline__item ${isDone && roundNum < totalRounds ? "has-connector" : ""}`}>
                  <span
                    className={`gd-timeline__marker ${
                      isLatestSettled
                        ? "gd-timeline__marker--current"
                        : isDone
                        ? "gd-timeline__marker--done"
                        : isNext
                        ? "gd-timeline__marker--next"
                        : ""
                    }`}
                    style={isNext ? { borderColor: "#f59e0b", color: "#d97706", background: "#fef3c7" } : {}}
                  >
                    {isLatestSettled ? (
                      <Icon name="star" />
                    ) : isDone ? (
                      <Icon name="checkOnly" />
                    ) : (
                      roundNum
                    )}
                  </span>
                  <div className="gd-timeline__body">
                    <span className="gd-timeline__title">
                      ROUND {roundNum}
                      {isLatestSettled && (
                        <span className="gd-timeline__badge">
                          {settled >= totalRounds ? "SETTLED" : "ACTIVE"}
                        </span>
                      )}
                      {isNext && (
                        <span
                          className="gd-timeline__badge"
                          style={{ background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }}
                        >
                          UP NEXT
                        </span>
                      )}
                    </span>
                    <span className={`gd-timeline__sub ${isLatestSettled ? "gd-timeline__sub--active" : ""}`}>
                      {isEmpty
                        ? "Not Started"
                        : isDone
                        ? `${who} paid (${peso(contributionNum)}) · Secured on Ledger`
                        : isNext
                        ? `${who} up next · Due ${roundDueDate}`
                        : `${who} · Scheduled · Due ${roundDueDate}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* E-contract card */}
        <aside className="gd-panel gd-contract">
          <div className="gd-contract__head">
            <div>
              <h3>
                E-CONTRACT &amp;
                <br />
                AGREEMENT
              </h3>
              <div className="gd-contract__timeline-row" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <span className="gd-contract__dates" style={{ fontSize: 11, color: "#778174", fontWeight: 500 }}>
                  {formattedStart} – {formattedDeadline}
                </span>
                <span className="gd-days-badge gd-badge-amber" title={`${daysLeftText} until contract deadline`}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                    <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span>{daysLeftText}</span>
                </span>
              </div>
            </div>
            <span className="gd-chip">{peso(goalNum)}</span>
          </div>

          <div className="gd-contract__signatories">
            {contractSignatories.map((sig, idx) => (
              <div key={idx} className="gd-contract__signatory-row">
                <span className="gd-contract__sig-name">{sig.name}</span>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className={`gd-contract__pill gd-contract__pill--${sig.payBadgeType}`}>
                    {sig.payBadgeLabel}
                  </span>
                  <span className="gd-contract__pill gd-contract__pill--signed">
                    {sig.isSigned ? "✓ Signed" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Link
            href={`/contract?plan=${encodeURIComponent(plan?.id || "antipolo-trip")}`}
            className="gd-btn-more"
            title="Review full e-contract agreement"
          >
            See more...
          </Link>
        </aside>
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowReceiptModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#1A2E1A", fontWeight: 700 }}>
                Blockchain Payment Receipt
              </h3>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#9CA3AF" }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: "13px", color: "#374151", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "8px" }}>
                <span style={{ color: "#9ca3af" }}>Savings Plan</span>
                <span style={{ fontWeight: 600 }}>{purposeName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "8px" }}>
                <span style={{ color: "#9ca3af" }}>Active Status</span>
                <span style={{ fontWeight: 600, color: !isEmpty ? "#16A34A" : "#9CA3AF" }}>
                  {isEmpty
                    ? `Round — / ${totalRounds} (Not Started)`
                    : `Round ${settled} of ${totalRounds} (${settled === 1 ? "Slot 1 Paid & Verified" : "In Progress"})`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "8px" }}>
                <span style={{ color: "#9ca3af" }}>Disbursed to Date</span>
                <span style={{ fontWeight: 600, color: !isEmpty ? "#16A34A" : "#9CA3AF" }}>
                  {peso(Math.round(contributionNum * Math.max(0, settled - 1) * 100) / 100)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "8px" }}>
                <span style={{ color: "#9ca3af" }}>Network Security</span>
                <span style={{ fontWeight: 600, color: "#16A34A" }}>Stellar Testnet / Verified</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowReceiptModal(false)}
              style={{
                marginTop: "20px",
                width: "100%",
                padding: "10px",
                background: "#2D6A3F",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
