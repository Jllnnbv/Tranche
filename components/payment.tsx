"use client";

import { memberNameFromEmail } from "./member-names";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserRequest } from "@/lib/browser-api";
import { refreshWallet } from "@/lib/wallet";
import { triggerPageTransition } from "./page-transition";
import { getRoundDueDate, computeTotalRounds, getRoundRecipientInfo } from "./schedule-helper";
import "./payment.css";

/* Figma frame: 1480 × 1024 */
const FRAME_WIDTH = 1480;
const FRAME_HEIGHT = 1024;

export type PaymentMethodId = "gcash" | "maya" | "bank" | "cash";

interface PaymentMethodOption {
  id: PaymentMethodId;
  name: string;
  badgeLabel: string;
  badgeTone: "green" | "blue" | "amber" | "gray";
  reviewBadge: string;
  reviewBadgeTone: "green" | "amber" | "gray";
  description: string;
  iconBg: string;
  iconType: "letter-g" | "letter-m" | "landmark" | "banknote";
}

const PAYMENT_METHODS: PaymentMethodOption[] = [
  {
    id: "gcash",
    name: "GCash",
    badgeLabel: "Provider checkout",
    badgeTone: "blue",
    reviewBadge: "PROVIDER CHECKOUT",
    reviewBadgeTone: "green",
    description: "Redirects to GCash app · Never enter your MPIN in Ambagan",
    iconBg: "#0077C8",
    iconType: "letter-g",
  },
  {
    id: "maya",
    name: "Maya",
    badgeLabel: "Provider checkout",
    badgeTone: "blue",
    reviewBadge: "PROVIDER CHECKOUT",
    reviewBadgeTone: "green",
    description: "Redirects to Maya app · Secure provider checkout",
    iconBg: "#7B2D8B",
    iconType: "letter-m",
  },
  {
    id: "bank",
    name: "Bank Transfer",
    badgeLabel: "Await verification",
    badgeTone: "amber",
    reviewBadge: "AWAIT VERIFICATION",
    reviewBadgeTone: "amber",
    description: "BPI, BDO, Metrobank · Manual verification required before marked Paid",
    iconBg: "#1E40AF",
    iconType: "landmark",
  },
  {
    id: "cash",
    name: "Cash",
    badgeLabel: "In-person",
    badgeTone: "gray",
    reviewBadge: "IN-PERSON",
    reviewBadgeTone: "gray",
    description: "Pay directly to collector · Admin marks as Paid after verification",
    iconBg: "#059669",
    iconType: "banknote",
  },
];

type View = "method" | "review" | "processing" | "pending" | "failed" | "success" | "receipt";

type Plan = {
  id: string;
  purpose?: string;
  goal?: string;
  start?: string;
  deadline?: string;
  frequency?: string;
  payments?: number;
  perPayment?: string;
  recipients?: { email: string; share: string }[];
  hasProgress?: boolean;
};

const DEFAULT_SCHOOL_PROJECT: Plan = {
  id: "school-project",
  purpose: "School Project",
  goal: "126",
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
};

const DEFAULT_ANTIPOLO_PROJECT: Plan = {
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
};

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

function calculateDaysLeft(deadlineStr?: string, fallbackDays = 27): string {
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

type Group = {
  name: string;
  contributionStroops: string;
  mode: string;
  activeRound: number | null;
  members: { id: string; slot: number; displayName: string; publicKey: string | null }[];
  destinations: { slot: number; label: string; publicKey: string; percentBps: number }[];
  rounds: {
    index: number;
    receiverMemberId: string;
    splitBps: { now: number; vault: number; fund: number };
    deadline: string;
    members: Record<string, string>;
  }[];
};

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

/** Shows the main amount big and the "(last ₱…)" remainder note small underneath, so it never wraps awkwardly. */
function AmountText({ value }: { value: string }) {
  const m = /^(.*?)\s*(\(last[^)]*\))\s*$/.exec(value);
  if (!m) return <>{value}</>;
  return (
    <>
      {m[1]}
      <small className="pay-amount-note">{m[2]}</small>
    </>
  );
}

export function Payment() {
  const scale = useFrameScale();
  const router = useRouter();

  const [view, setView] = useState<View>("method");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("gcash");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [address, setAddress] = useState("");
  const [txRef, setTxRef] = useState<string>("TXN-GC-928412");
  const [paidAt, setPaidAt] = useState<string>("");
  const [processingMsg, setProcessingMsg] = useState("Connecting to payment provider...");
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  // Contributions already settled when the page opened (fixed so the round doesn't shift after paying).
  const [paidCount, setPaidCount] = useState(0);

  // Load plan and initial view from query param if present
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("plan");
    if (id) {
      try {
        const saved = JSON.parse(
          localStorage.getItem("ambagan_groups") ?? localStorage.getItem("tranche_paluwagans") ?? "[]"
        ) as Plan[];
        let found = saved.find((p) => p.id === id);
        if (!found && id === "school-project") found = DEFAULT_SCHOOL_PROJECT;
        if (!found && id === "antipolo-trip") found = DEFAULT_ANTIPOLO_PROJECT;
        setPlan(found ?? null);
        const stored = localStorage.getItem(`ambagan_settled_${id}`);
        const paid = localStorage.getItem(`ambagan_paid_${id}`) === "true";
        setPaidCount(stored !== null ? Number(stored) : paid ? 1 : 0);
      } catch {
        // Ignore
      }
    } else {
      setPlan(DEFAULT_SCHOOL_PROJECT);
      setPaidCount(0);
    }
    const v = params.get("view");
    if (
      v === "method" ||
      v === "review" ||
      v === "processing" ||
      v === "pending" ||
      v === "failed" ||
      v === "success" ||
      v === "receipt"
    ) {
      setView(v);
    }
  }, []);

  // Attempt to load server group if available
  useEffect(() => {
    browserRequest<Group>("/api/tranche/group")
      .then((g) => setGroup(g))
      .catch(() => undefined);
    refreshWallet().then((a) => a && setAddress(a), () => undefined);
  }, []);

  const currentPlan = plan || DEFAULT_SCHOOL_PROJECT;
  const groupName = currentPlan.purpose?.trim() || group?.name || "School Project";
  const amountFormatted = currentPlan.perPayment || "—";
  const memberCount = currentPlan.recipients?.length || currentPlan.payments || 6;

  const activeFrequency = (() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`ambagan_freq_${currentPlan.id}`);
        if (saved) return saved;
      }
    } catch {}
    return currentPlan.frequency || "Weekly";
  })();

  const totalRounds = computeTotalRounds(
    currentPlan.start,
    currentPlan.deadline,
    activeFrequency,
    memberCount,
    currentPlan.payments
  );
  
  // Everything below is derived from the open plan: who pays next, which round, and the schedule.
  const recipientsList = currentPlan.recipients ?? [];
  const nameFromEmail = memberNameFromEmail;

  // Support direct ?round=X navigation from group dashboard
  const requestedRound = (() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const r = parseInt(params.get("round") || "", 10);
      if (!isNaN(r) && r >= 1) return Math.min(totalRounds, r);
    }
    return Math.min(totalRounds, paidCount + 1);
  })();

  const currentRound = requestedRound;
  const payerIdx = recipientsList.length ? (currentRound - 1) % recipientsList.length : 0;
  const payerEmail = recipientsList[payerIdx]?.email ?? "";
  const nextPayerName = payerEmail ? nameFromEmail(payerEmail, payerIdx) : `Member ${payerIdx + 1}`;
  const nextPayerSlot = `Slot ${payerIdx + 1}`;
  const receiverIdx = recipientsList.length ? (currentRound - 1) % recipientsList.length : 0;
  const receiverEmail = recipientsList[receiverIdx]?.email ?? "";
  const receiverName = receiverEmail ? nameFromEmail(receiverEmail, receiverIdx) : nextPayerName;
  const nextPayerHandle = (payerEmail.split("@")[0] || nextPayerName).toLowerCase().replace(/[^a-z0-9]/g, "_");
  const phoneSeed = Array.from(payerEmail || nextPayerName).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 10000, 7);
  const nextPayerPhone = `09${String(17 + (phoneSeed % 80)).padStart(2, "0")} ••• ${String(phoneSeed).padStart(4, "0")}`;

  const paymentMethods: PaymentMethodOption[] = [
    {
      id: "gcash",
      name: "GCash",
      badgeLabel: "Provider checkout",
      badgeTone: "blue",
      reviewBadge: "PROVIDER CHECKOUT",
      reviewBadgeTone: "green",
      description: `Account: ${nextPayerName} (${nextPayerPhone}) · Redirects to GCash app`,
      iconBg: "#0077C8",
      iconType: "letter-g",
    },
    {
      id: "maya",
      name: "Maya",
      badgeLabel: "Provider checkout",
      badgeTone: "blue",
      reviewBadge: "PROVIDER CHECKOUT",
      reviewBadgeTone: "green",
      description: `Account: ${nextPayerName} (@${nextPayerHandle}) · Secure provider checkout`,
      iconBg: "#7B2D8B",
      iconType: "letter-m",
    },
    {
      id: "bank",
      name: "Bank Transfer",
      badgeLabel: "Await verification",
      badgeTone: "amber",
      reviewBadge: "AWAIT VERIFICATION",
      reviewBadgeTone: "amber",
      description: `Account Name: ${nextPayerName} · BPI, BDO, Metrobank`,
      iconBg: "#1E40AF",
      iconType: "landmark",
    },
    {
      id: "cash",
      name: "Cash",
      badgeLabel: "In-person",
      badgeTone: "gray",
      reviewBadge: "IN-PERSON",
      reviewBadgeTone: "gray",
      description: `Payer: ${nextPayerName} · Admin marks as Paid after verification`,
      iconBg: "#059669",
      iconType: "banknote",
    },
  ];

  const daysLeftText = calculateDaysLeft(currentPlan.deadline, currentPlan.id === "antipolo-trip" ? 27 : 17);
  const roundDueIso = (() => {
    const d = getRoundDueDate(currentPlan.start, currentPlan.deadline, activeFrequency, currentRound, totalRounds);
    return d.toISOString().slice(0, 10);
  })();
  const dueDateFormatted = roundDueIso ? `Due ${formatCardDate(roundDueIso)}` : "Due date to be set";
  const extraMembers = Math.max(0, memberCount - 3);
  const activeMethod = paymentMethods.find((m) => m.id === selectedMethod) ?? (paymentMethods[0] as PaymentMethodOption);

  function handleContinueToReview() {
    setView("review");
  }

  function handleAuthorizePayment() {
    setView("processing");
    const providerName = activeMethod.name;
    setProcessingMsg(`Redirecting to ${providerName} app...`);

    const ref = `TR-${activeMethod.id.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    setTxRef(ref);

    const timer = setTimeout(() => {
      setProcessingMsg(`Confirming ${providerName} transaction with Ambagan...`);
      const timer2 = setTimeout(() => {
        const now = new Date().toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        setPaidAt(now);
        // Persist payment state for demo presentation
        try {
          const nextSettled = Math.min(totalRounds, Math.max(paidCount + 1, currentRound));
          localStorage.setItem(`ambagan_settled_${currentPlan.id}`, String(nextSettled));
          localStorage.setItem(`ambagan_paid_${currentPlan.id}`, "true");
          localStorage.setItem("ambagan_last_paid_plan", currentPlan.id);
          localStorage.setItem(
            `ambagan_tx_${currentPlan.id}`,
            JSON.stringify({
              txRef: ref,
              amount: amountFormatted,
              paidAt: now,
              method: activeMethod.name,
              planId: currentPlan.id,
              planPurpose: groupName,
            })
          );
          window.dispatchEvent(
            new CustomEvent("ambagan_payment_completed", {
              detail: {
                groupId: currentPlan.id,
                settledCount: nextSettled,
                round: currentRound,
                payer: nextPayerName,
                amount: amountFormatted,
              },
            })
          );
        } catch {}

        // Bank transfer and cash require verification -> transition to pending
        if (selectedMethod === "bank" || selectedMethod === "cash") {
          setView("pending");
        } else {
          setView("success");
        }
      }, 1200);
      return () => clearTimeout(timer2);
    }, 1400);

    return () => clearTimeout(timer);
  }

  function handleCheckStatus() {
    setIsCheckingStatus(true);
    setTimeout(() => {
      setIsCheckingStatus(false);
      const now = new Date().toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      setPaidAt(now);
      try {
        const nextSettled = Math.min(totalRounds, paidCount + 1);
        localStorage.setItem(`ambagan_settled_${currentPlan.id}`, String(nextSettled));
        localStorage.setItem(`ambagan_paid_${currentPlan.id}`, "true");
        localStorage.setItem("ambagan_last_paid_plan", currentPlan.id);
        localStorage.setItem(
          `ambagan_tx_${currentPlan.id}`,
          JSON.stringify({
            txRef,
            amount: amountFormatted,
            paidAt: now,
            method: activeMethod.name,
            planId: currentPlan.id,
            planPurpose: groupName,
          })
        );
        window.dispatchEvent(
          new CustomEvent("ambagan_payment_completed", {
            detail: {
              groupId: currentPlan.id,
              settledCount: nextSettled,
              round: currentRound,
              payer: nextPayerName,
              amount: amountFormatted,
            },
          })
        );
      } catch {}
      setView("success");
    }, 900);
  }

  function downloadReceipt() {
    const lines = [
      "AMBAGAN — PAYMENT RECEIPT",
      "========================================",
      `Group:            ${groupName}`,
      `Round:            Round ${currentRound} of ${totalRounds}`,
      `Due Date:         ${currentPlan.deadline ? formatCardDate(currentPlan.deadline) : "Nov 15, 2026"}`,
      `Payment Method:   ${activeMethod.name}`,
      `Amount Paid:      ${amountFormatted}`,
      `Convenience Fee:  ₱0.00 (Waived)`,
      `Total Due:        ${amountFormatted}`,
      `Status:           SUCCESS / CONFIRMED`,
      `Reference No:     ${txRef}`,
      `Timestamp:        ${paidAt || new Date().toLocaleString()}`,
      `Payer Account:    ${nextPayerName} (${nextPayerSlot})`,
      `Recipient:        ${receiverName} (Round ${currentRound} Receiver)`,
      "----------------------------------------",
      "Security Notice: Authenticated via Ambagan payment pathway.",
      "Never share your PIN, OTP, or wallet seed phrase with anyone.",
      "========================================",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ambagan-receipt-round${currentRound}-${activeMethod.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pay-viewport" style={{ height: Math.max(760, FRAME_HEIGHT * scale) }}>
      <div className="pay-frame" style={{ transform: `scale(${scale})` }}>
        {/* Brand Header */}
        <header className="pay-brand-header">
          <Link href="/dashboard" className="pay-brand-link">
            <div className="pay-logo-group">
              <div className="pay-logo-glow" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.svg" alt="Ambagan Logo" className="pay-logo-img" />
            </div>
            <span className="pay-brand-title">Ambagan</span>
          </Link>
        </header>

        {/* Sidebar (Frame 52) */}
        <aside className="pay-sidebar" aria-label="Navigation Sidebar">
          {/* Frame 27: Home */}
          <Link href="/dashboard" className="pay-sidebar-item pay-item-home" aria-label="Home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z" fill="#E1EDA0" />
            </svg>
          </Link>

          {/* Frame 25: Wallet (Active) */}
          <Link href="/pay" className="pay-sidebar-item pay-item-wallet is-active" aria-label="Payments" aria-current="page">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="5" width="20" height="14" rx="3" stroke="#B54880" strokeWidth="2" />
              <path d="M2 10h20" stroke="#B54880" strokeWidth="1.5" />
              <circle cx="16" cy="14" r="1.5" fill="#B54880" />
            </svg>
          </Link>

          {/* Frame 24: Plus Math */}
          <Link href="/dashboard" className="pay-sidebar-item pay-item-plus" aria-label="Create group">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#E1EDA0" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </Link>

          {/* Double Right Arrow */}
          <div className="pay-sidebar-arrow" aria-hidden="true">
            <svg width="17" height="15" viewBox="0 0 17 15" fill="none">
              <path d="M1 1.5L6.5 7.5L1 13.5M9.5 1.5L15 7.5L9.5 13.5" stroke="#CA8A04" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Frame 26: User */}
          <button
            type="button"
            className="pay-sidebar-item pay-item-user"
            aria-label="Profile"
            onClick={() => {
              triggerPageTransition();
              router.push("/profile");
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="#E1EDA0" strokeWidth="2" />
              <path d="M4 20c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" stroke="#E1EDA0" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </aside>

        {/* Main Frame (Frame 50) */}
        <main className={`pay-main-frame ${view === "receipt" ? "is-receipt-mode" : view === "review" || view === "processing" || view === "pending" || view === "failed" || view === "success" ? "is-review-mode" : ""}`}>
          {/* Left Panel */}
          <section className="pay-left-panel" aria-label="Group Overview">
            <div className="pay-accent-bar" />

            {/* Back Nav */}
            <Link href="/dashboard" className="pay-back-nav">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 12L6 8L10 4" stroke="#176B45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>My Groups</span>
            </Link>

            {/* Group Header */}
            <div className="pay-group-header">
              <span className="pay-group-overline">CURRENT GROUP</span>
              <h1 className="pay-group-title">{groupName}</h1>
              <div className="pay-badge-group">
                <span className="pay-badge-pill pay-badge-green">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <path d="M11 14v-1.5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3V14" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="6.5" cy="4.5" r="2.5" stroke="#176B45" strokeWidth="2" />
                    <path d="M14 14v-1a2.5 2.5 0 0 0-2-2.45M10.5 2.1a2.5 2.5 0 0 1 0 4.8" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>Round {currentRound} of {totalRounds}</span>
                </span>
                <span className="pay-badge-pill pay-badge-amber">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                    <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span>{daysLeftText}</span>
                </span>
              </div>
            </div>

            <div className="pay-divider pay-divider-1" />

            {/* Amount Due Card */}
            <div className="pay-amount-card">
              <div className="pay-deco-circle pay-deco-1" />
              <div className="pay-deco-circle pay-deco-2" />
              <div className="pay-amount-content">
                <span className="pay-amount-label">Amount Due</span>
                <span className="pay-amount-value"><AmountText value={amountFormatted} /></span>
                <div className="pay-amount-footer">
                  <div className="pay-due-row">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="12" height="11" rx="2" stroke="#A7F3D0" strokeWidth="1.8" />
                      <path d="M5 1.5v3M11 1.5v3M2 7h12" stroke="#A7F3D0" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>{dueDateFormatted}</span>
                  </div>
                  <span className="pay-card-round-badge">ROUND {currentRound}</span>
                </div>
              </div>
            </div>

            {/* Round Progress */}
            <div className="pay-round-progress">
              <div className="pay-progress-header">
                <span className="pay-progress-label">Round Progress</span>
                <span className="pay-progress-sub">Round {currentRound} of {totalRounds} · Current</span>
              </div>
              <div className="pay-progress-track">
                <div className="pay-progress-fill" style={{ width: `${Math.round((currentRound / totalRounds) * 100)}%` }} />
              </div>
            </div>

            <div className="pay-divider pay-divider-2" />

            {/* Members Snippet */}
            <div className="pay-members-snippet">
              <span className="pay-members-label">Group Members</span>
              <div className="pay-members-row">
                <div className="pay-avatar-stack">
                  <span className="pay-member-avatar" style={{ background: "#B54880" }} />
                  <span className="pay-member-avatar" style={{ background: "#176B45" }} />
                  <span className="pay-member-avatar" style={{ background: "#D97706" }} />
                  {extraMembers > 0 && <span className="pay-member-avatar pay-avatar-count">+{extraMembers}</span>}
                </div>
                <span className="pay-members-note">{memberCount} members · {nextPayerName} pays next</span>
              </div>
            </div>

            {/* Pay Contribution CTA */}
            <button
              type="button"
              className="pay-btn-contribute"
              onClick={() => setView("method")}
              aria-label="Pay Contribution"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="5" width="20" height="14" rx="3" stroke="#FFFFFF" strokeWidth="2" />
                <path d="M2 10h20" stroke="#FFFFFF" strokeWidth="1.5" />
                <circle cx="16" cy="14" r="1.5" fill="#FFFFFF" />
              </svg>
              <span>Pay Contribution ({nextPayerName})</span>
            </button>

            <p className="pay-left-footnote">Tapping opens a secure payment selection.</p>
          </section>

          {/* Panel Divider */}
          <div className="pay-vertical-divider" />

          {/* Right Modal Backdrop & Container */}
          {view === "method" && <div className="pay-modal-backdrop" aria-hidden="true" />}

          {/* Payment Modal */}
          <div className="pay-modal-card" role="dialog" aria-modal="true" aria-labelledby="pay-modal-title">
            <div className="pay-modal-accent" aria-hidden="true" />
            {/* VIEW 1: SELECT PAYMENT METHOD */}
            {view === "method" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">Select Payment Method</h2>
                    <p className="pay-modal-subheading">Choose how you&apos;d like to pay your contribution</p>
                  </div>
                  <Link href="/dashboard" className="pay-modal-close-btn" aria-label="Close modal">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body">
                  {/* Payment Summary */}
                  <div className="pay-summary-box">
                    <div className="pay-summary-left">
                      <div className="pay-summary-icon-box">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" stroke="#176B45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="10" r="3" stroke="#176B45" strokeWidth="2" />
                        </svg>
                      </div>
                      <div className="pay-summary-info">
                        <strong className="pay-summary-group-name">{groupName}</strong>
                        <span className="pay-summary-sub">Round {currentRound} of {totalRounds} · Payer Account: {nextPayerName} · {dueDateFormatted}</span>
                      </div>
                    </div>
                    <div className="pay-summary-vdivider" />
                    <div className="pay-summary-right">
                      <span className="pay-summary-amount-label">Amount Due</span>
                      <strong className="pay-summary-amount-value"><AmountText value={amountFormatted} /></strong>
                    </div>
                  </div>

                  {/* Section Label */}
                  <div className="pay-section-tag">PAYMENT OPTIONS</div>

                  {/* Options List */}
                  <div className="pay-options-list" role="radiogroup" aria-label="Payment Options">
                    {paymentMethods.map((method) => {
                      const isSelected = selectedMethod === method.id;
                      return (
                        <div
                          key={method.id}
                          className={`pay-option-card pay-option-${method.id} ${isSelected ? "is-selected" : ""}`}
                          onClick={() => setSelectedMethod(method.id)}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              setSelectedMethod(method.id);
                            }
                          }}
                        >
                          {isSelected && <div className="pay-option-accent-bar" />}
                          <div className="pay-option-content">
                            <div className="pay-option-icon" style={{ background: method.iconBg }}>
                              {method.iconType === "letter-g" && <span className="pay-icon-letter">G</span>}
                              {method.iconType === "letter-m" && <span className="pay-icon-letter">M</span>}
                              {method.iconType === "landmark" && (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                  <line x1="2" y1="22" x2="22" y2="22" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="12" y1="2" x2="20" y2="7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="12" y1="2" x2="4" y2="7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="4" y1="7" x2="20" y2="7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="6" y1="11" x2="6" y2="18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="10" y1="11" x2="10" y2="18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="14" y1="11" x2="14" y2="18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                  <line x1="18" y1="11" x2="18" y2="18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              )}
                              {method.iconType === "banknote" && (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                  <rect x="2" y="6" width="20" height="12" rx="2" stroke="#FFFFFF" strokeWidth="2" />
                                  <circle cx="12" cy="12" r="2.5" stroke="#FFFFFF" strokeWidth="2" />
                                  <path d="M6 12h.01M18 12h.01" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              )}
                            </div>

                            <div className="pay-option-details">
                              <div className="pay-option-title-row">
                                <span className="pay-option-title">{method.name}</span>
                                {isSelected && (
                                  <span className="pay-tag-pill pay-tag-selected">SELECTED</span>
                                )}
                                <span className={`pay-tag-pill pay-tag-${method.badgeTone}`}>
                                  {method.badgeLabel}
                                </span>
                              </div>
                              <p className="pay-option-subtext">{method.description}</p>
                            </div>

                            <div className={`pay-radio-circle ${isSelected ? "is-checked" : ""}`}>
                              {isSelected && <div className="pay-radio-dot" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Security Notice */}
                  <div className="pay-security-card">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-security-icon">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 12l2 2 4-4" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="pay-security-text">
                      <strong className="pay-security-title">Security Reminder</strong>
                      <p className="pay-security-body">
                        Ambagan will never ask for your PIN or OTP. GCash and Maya payments continue via the provider&apos;s secure app. Bank Transfer and Cash payments are verified by your group admin before being marked Paid. Example: if a Bank Transfer reference is unverifiable, the admin will request re-confirmation.
                      </p>
                    </div>
                  </div>

                  {/* Modal Actions */}
                  <div className="pay-modal-actions-row">
                    <Link href="/dashboard" className="pay-btn-modal-cancel">
                      Cancel
                    </Link>
                    <button
                      type="button"
                      className="pay-btn-modal-continue"
                      onClick={handleContinueToReview}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#FFFFFF" strokeWidth="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#FFFFFF" strokeWidth="2" />
                      </svg>
                      <span>Continue to Payment</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M12 5l7 7-7 7" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 2: PAYMENT REVIEW */}
            {view === "review" && (
              <>
                <header className="pay-modal-header pay-header-review">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">Payment Review</h2>
                    <p className="pay-modal-subheading">Check the details below, then proceed to your payment provider</p>
                  </div>
                  <button
                    type="button"
                    className="pay-modal-close-btn"
                    onClick={() => setView("method")}
                    aria-label="Back to payment methods"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-review-body">
                  {/* Contribution summary */}
                  <div className="pay-review-summary">
                    <div className="pay-review-sym">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="9" cy="7" r="4" stroke="#176B45" strokeWidth="2" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="pay-review-group-info">
                      <strong className="pay-review-name">{groupName}</strong>
                      <span className="pay-review-round-due">Round {currentRound} of {totalRounds} · {dueDateFormatted}</span>
                    </div>
                    <div className="pay-review-amount-col">
                      <span className="pay-review-amount-lbl">Amount</span>
                      <strong className="pay-review-amount-val"><AmountText value={amountFormatted} /></strong>
                    </div>
                  </div>

                  {/* Selected method row */}
                  <div className="pay-review-selected-method">
                    <div className="pay-selected-info">
                      <span className="pay-selected-lbl">Payment Method</span>
                      <strong className="pay-selected-name">{activeMethod.name}</strong>
                    </div>
                    <span className={`pay-tag-pill pay-tag-${activeMethod.reviewBadgeTone}`}>
                      {activeMethod.reviewBadge}
                    </span>
                  </div>

                  {/* Transaction details card */}
                  <div className="pay-tx-details-box">
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payer Account</span>
                      <span className="pay-tx-value pay-tx-value-strong">{nextPayerName} ({nextPayerSlot} · Next to Pay)</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Recipient</span>
                      <span className="pay-tx-value">Ambagan Pool ({groupName})</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Due Date</span>
                      <span className="pay-tx-value">{currentPlan.deadline ? formatCardDate(currentPlan.deadline) : "Nov 15, 2026"}</span>
                    </div>

                    <div className="pay-tx-divider" />

                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Contribution Amount</span>
                      <span className="pay-tx-value">{amountFormatted}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Convenience Fee</span>
                      <span className="pay-tx-value">₱0.00 (Waived)</span>
                    </div>
                    <p className="pay-tx-note">No transaction fees applied for testnet/demo checkout.</p>
                    <div className="pay-tx-row pay-tx-row-total">
                      <span className="pay-tx-label">Total Due</span>
                      <span className="pay-tx-value pay-tx-value-strong">{amountFormatted}</span>
                    </div>
                  </div>

                  {/* Payment guidance */}
                  <div className="pay-guidance-box">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-guidance-icon">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#176B45" strokeWidth="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#176B45" strokeWidth="2" />
                    </svg>
                    <div className="pay-guidance-copy">
                      <strong className="pay-guidance-heading">Direct Provider Authorization</strong>
                      <p className="pay-guidance-desc">
                        You will be redirected to complete your payment securely. Ambagan never stores your payment credentials or PIN.
                      </p>
                    </div>
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="pay-review-actions">
                    <button
                      type="button"
                      className="pay-btn-change-method"
                      onClick={() => setView("method")}
                    >
                      Change Method
                    </button>
                    <button
                      type="button"
                      className="pay-btn-authorize"
                      onClick={handleAuthorizePayment}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#FFFFFF" strokeWidth="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#FFFFFF" strokeWidth="2" />
                      </svg>
                      <span>Authorize {activeMethod.name} ({nextPayerName})</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 3: PAYMENT PROCESSING (Figma Spec) */}
            {view === "processing" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">
                      Payment Processing
                    </h2>
                    <p className="pay-modal-subheading">
                      Do not close this window while your transaction is being prepared
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pay-modal-close-btn"
                    onClick={() => setView("review")}
                    aria-label="Cancel and go back"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-processing-body">
                  {/* Contribution summary */}
                  <div className="pay-review-summary">
                    <div className="pay-review-sym">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="9" cy="7" r="4" stroke="#176B45" strokeWidth="2" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="pay-review-group-info">
                      <strong className="pay-review-name">{groupName}</strong>
                      <span className="pay-review-round-due">Round {currentRound} of {totalRounds} · {dueDateFormatted}</span>
                    </div>
                    <div className="pay-review-amount-col">
                      <span className="pay-review-amount-lbl">Amount</span>
                      <strong className="pay-review-amount-val"><AmountText value={amountFormatted} /></strong>
                    </div>
                  </div>

                  {/* Processing Status Block */}
                  <div className="pay-processing-status-block">
                    {/* Processing Indicator (72x72) */}
                    <div className="pay-proc-indicator">
                      <div className="pay-proc-track" />
                      <div className="pay-proc-arc" />
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="pay-proc-link-icon">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="#176B45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 3h6v6" stroke="#176B45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 14L21 3" stroke="#176B45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <h3 className="pay-proc-title">Authorizing {activeMethod.name}</h3>
                    <p className="pay-proc-desc-main">{processingMsg} (Account: {nextPayerName})</p>

                    <div className="pay-proc-badge">
                      <span className="pay-proc-badge-text">PROVIDER HANDSHAKE</span>
                    </div>

                    <p className="pay-proc-desc-sub">
                      Please authenticate with your payment provider. Do not close or reload this window while the payment settles.
                    </p>
                  </div>

                  {/* Payment guidance */}
                  <div className="pay-guidance-box" style={{ marginTop: 2 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-guidance-icon">
                      <circle cx="12" cy="12" r="10" stroke="#176B45" strokeWidth="2" />
                      <path d="M12 16v-4M12 8h.01" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <div className="pay-guidance-copy">
                      <strong className="pay-guidance-heading">Keep this window open</strong>
                      <p className="pay-guidance-desc">
                        If the connection drops, Ambagan resends the same signed transaction. You will never be charged twice.
                      </p>
                    </div>
                  </div>

                  {/* Modal footer action */}
                  <div className="pay-proc-footer">
                    <button
                      type="button"
                      className="pay-btn-proc-cancel"
                      onClick={() => setView("review")}
                    >
                      <span className="pay-btn-proc-cancel-label">Cancel and go back</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 4: PAYMENT PENDING (Figma Spec) */}
            {view === "pending" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">
                      Payment Pending
                    </h2>
                    <p className="pay-modal-subheading">
                      Your payment has been submitted and is awaiting confirmation
                    </p>
                  </div>
                  <Link href="/dashboard" className="pay-modal-close-btn" aria-label="Close modal">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-pending-body">
                  {/* Payment status */}
                  <div className="pay-pending-status-block">
                    <h3 className="pay-pending-title">Payment Pending Confirmation</h3>
                    <p className="pay-pending-desc">We&apos;re verifying your transaction with the payment network</p>
                  </div>

                  {/* Branch indication: Status badge */}
                  <div className="pay-pending-badge-wrap">
                    <div className="pay-pending-badge">
                      <span className="pay-pending-badge-text">AWAITING CONFIRMATION</span>
                    </div>
                  </div>

                  {/* Transaction details card */}
                  <div className="pay-pending-tx-details">
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payer Account</span>
                      <span className="pay-tx-value pay-tx-value-strong">{nextPayerName}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Amount</span>
                      <span className="pay-tx-value pay-tx-value-strong">{amountFormatted}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Round</span>
                      <span className="pay-tx-value">Round {currentRound} of {totalRounds}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Status</span>
                      <span className="pay-tx-value">Pending Provider Verification</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Submitted</span>
                      <span className="pay-tx-value">Just now</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Reference No</span>
                      <span className="pay-tx-value">{txRef}</span>
                    </div>
                  </div>

                  {/* Payment guidance */}
                  <div className="pay-pending-guidance">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-pending-guidance-icon">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="14 2 14 8 20 8" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m9 14 2 2 4-4" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="pay-pending-guidance-copy">
                      <strong className="pay-pending-guidance-heading">Do not pay again</strong>
                      <p className="pay-pending-guidance-body">
                        Your signed payment is saved. We check its status every few seconds and resend the same transaction if needed, so it can never be paid twice. This page updates automatically.
                      </p>
                    </div>
                  </div>

                  {/* Modal footer actions */}
                  <div className="pay-pending-footer">
                    <Link href="/dashboard" className="pay-btn-pending-close">
                      <span className="pay-btn-pending-close-label">Close</span>
                    </Link>
                    <button
                      type="button"
                      className="pay-btn-pending-check"
                      onClick={handleCheckStatus}
                      disabled={isCheckingStatus}
                    >
                      {isCheckingStatus ? (
                        <svg className="pay-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <polyline points="14 2 14 8 20 8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="11.5" cy="14.5" r="2.5" stroke="#FFFFFF" strokeWidth="2" />
                          <path d="M13.5 16.5L16 19" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                      <span className="pay-btn-pending-check-label">
                        {isCheckingStatus ? "Checking Status..." : "Check Status"}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 5: PAYMENT FAILED (Figma Spec) */}
            {view === "failed" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">
                      Payment Failed
                    </h2>
                    <p className="pay-modal-subheading">
                      Your payment could not be processed · You have not been charged
                    </p>
                  </div>
                  <Link href="/dashboard" className="pay-modal-close-btn" aria-label="Close modal">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-failed-body">
                  {/* Payment status */}
                  <div className="pay-failed-status-block">
                    <div className="pay-failed-sym-circle">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="#C43D4B" strokeWidth="2" />
                        <path d="m15 9-6 6M9 9l6 6" stroke="#C43D4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="pay-failed-title">Payment Declined</h3>
                    <p className="pay-failed-desc">The payment provider was unable to authorize your transaction</p>
                  </div>

                  {/* Example indication: Status badge */}
                  <div className="pay-failed-badge-wrap">
                    <div className="pay-failed-badge">
                      <span className="pay-failed-badge-text">TRANSACTION NOT CHARGED</span>
                    </div>
                  </div>

                  {/* Transaction details card */}
                  <div className="pay-failed-tx-details">
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Attempted Amount</span>
                      <span className="pay-tx-value">{amountFormatted}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Round</span>
                      <span className="pay-tx-value">Round {currentRound} of {totalRounds}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Failure Reason</span>
                      <span className="pay-tx-value">Provider Authorization Declined</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Status</span>
                      <span className="pay-tx-value">Failed · Zero Stroops Charged</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Reference No</span>
                      <span className="pay-tx-value">{txRef}</span>
                    </div>
                  </div>

                  {/* Payment guidance */}
                  <div className="pay-failed-guidance">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-failed-guidance-icon">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke="#C43D4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="12" y1="9" x2="12" y2="13" stroke="#C43D4B" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="17" r="1" fill="#C43D4B" />
                    </svg>
                    <div className="pay-failed-guidance-copy">
                      <strong className="pay-failed-guidance-heading">No funds were deducted</strong>
                      <p className="pay-failed-guidance-body">
                        Your balance is untouched. You can retry with another payment method or check your provider account balance before attempting again.
                      </p>
                    </div>
                  </div>

                  {/* Modal footer actions */}
                  <div className="pay-failed-footer">
                    <button
                      type="button"
                      className="pay-btn-failed-change"
                      onClick={() => setView("method")}
                    >
                      <span className="pay-btn-failed-change-label">Change Method</span>
                    </button>
                    <button
                      type="button"
                      className="pay-btn-failed-retry"
                      onClick={() => handleAuthorizePayment()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 3v5h5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="pay-btn-failed-retry-label">Retry Payment</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 6: PAYMENT SUCCESS (Figma Spec) */}
            {view === "success" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">
                      Payment Success
                    </h2>
                    <p className="pay-modal-subheading">
                      Your contribution has been received and confirmed on the ledger
                    </p>
                  </div>
                  <Link href="/dashboard" className="pay-modal-close-btn" aria-label="Close modal">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-success-body">
                  {/* Payment status */}
                  <div className="pay-success-status-block">
                    <div className="pay-success-sym-circle">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="#176B45" strokeWidth="2" />
                        <path d="m9 12 2 2 4-4" stroke="#176B45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="pay-success-title">Payment Successful</h3>
                    <p className="pay-success-desc">Your Round {currentRound} contribution for {nextPayerName} has been verified and settled</p>
                  </div>

                  {/* Example indication: Status badge */}
                  <div className="pay-success-badge-wrap">
                    <div className="pay-success-badge">
                      <span className="pay-success-badge-text">CONFIRMED ON LEDGER</span>
                    </div>
                  </div>

                  {/* Transaction details card */}
                  <div className="pay-success-tx-details">
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payer Account</span>
                      <span className="pay-tx-value pay-tx-value-strong">{nextPayerName} ({nextPayerSlot})</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Amount</span>
                      <span className="pay-tx-value pay-tx-value-strong">{amountFormatted}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Round</span>
                      <span className="pay-tx-value">Round {currentRound} of {totalRounds}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Receiver</span>
                      <span className="pay-tx-value">{receiverName}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payment Method</span>
                      <span className="pay-tx-value">{activeMethod.name}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Reference No</span>
                      <span className="pay-tx-value">{txRef}</span>
                    </div>
                  </div>

                  {/* Payment guidance */}
                  <div className="pay-guidance-box">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-guidance-icon">
                      <circle cx="12" cy="12" r="10" stroke="#176B45" strokeWidth="2" />
                      <path d="M12 16v-4M12 8h.01" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <div className="pay-guidance-copy">
                      <strong className="pay-guidance-heading">What happens next</strong>
                      <p className="pay-guidance-desc">
                        Your payment has been split and secured by the group&apos;s rules. The receiver will be able to claim the payout on schedule.
                      </p>
                    </div>
                  </div>

                  {/* Modal footer actions */}
                  <div className="pay-success-footer">
                    <Link
                      href={`/dashboard?openPlan=${encodeURIComponent(currentPlan.id)}&paid=true`}
                      className="pay-btn-success-done"
                    >
                      <span className="pay-btn-success-done-label">View in Group Dashboard →</span>
                    </Link>
                    <button
                      type="button"
                      className="pay-btn-success-receipt"
                      onClick={() => setView("receipt")}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8H8M16 12H8M13 16H8" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="pay-btn-success-receipt-label">View Receipt</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 7: PAYMENT RECEIPT (Figma Spec) */}
            {view === "receipt" && (
              <>
                <header className="pay-modal-header">
                  <div className="pay-modal-title-group">
                    <h2 id="pay-modal-title" className="pay-modal-heading">
                      Payment Receipt
                    </h2>
                    <p className="pay-modal-subheading">
                      Official receipt for your Round {currentRound} contribution
                    </p>
                  </div>
                  <Link href="/dashboard" className="pay-modal-close-btn" aria-label="Close modal">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 2.5L9.5 9.5M2.5 9.5L9.5 2.5" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </header>

                <div className="pay-modal-hdivider" />

                <div className="pay-modal-body pay-receipt-body">
                  {/* Receipt heading */}
                  <div className="pay-receipt-heading">
                    <div className="pay-receipt-amount-block">
                      <span className="pay-receipt-amount-lbl">AMOUNT PAID</span>
                      <strong className="pay-receipt-amount-val">{amountFormatted}</strong>
                    </div>
                    <div className="pay-receipt-badge">
                      <span className="pay-receipt-badge-text">PAID · VERIFIED</span>
                    </div>
                  </div>

                  {/* Transaction details */}
                  <div className="pay-receipt-tx-details">
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Group</span>
                      <span className="pay-tx-value">{groupName}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payer Account</span>
                      <span className="pay-tx-value pay-tx-value-strong">
                        {nextPayerName} ({nextPayerSlot} · Next to Pay)
                      </span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Round</span>
                      <span className="pay-tx-value">Round {currentRound} of {totalRounds}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Payment Method</span>
                      <span className="pay-tx-value">{activeMethod.name}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Date &amp; Time</span>
                      <span className="pay-tx-value">{paidAt || new Date().toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Reference ID</span>
                      <span className="pay-tx-value">{txRef}</span>
                    </div>
                    <div className="pay-receipt-divider" />
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Contribution</span>
                      <span className="pay-tx-value">{amountFormatted}</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Convenience Fee</span>
                      <span className="pay-tx-value">₱0.00 (Waived)</span>
                    </div>
                    <div className="pay-tx-row">
                      <span className="pay-tx-label">Total Settled</span>
                      <span className="pay-tx-value pay-tx-value-strong">{amountFormatted}</span>
                    </div>
                  </div>

                  {/* Payment guidance (height 78px) */}
                  <div className="pay-receipt-guidance">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="pay-receipt-guidance-icon">
                      <circle cx="12" cy="12" r="10" stroke="#176B45" strokeWidth="2" />
                      <path d="M12 16v-4M12 8h.01" stroke="#176B45" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <div className="pay-receipt-guidance-copy">
                      <strong className="pay-receipt-guidance-heading">Cryptographically Verified</strong>
                      <p className="pay-receipt-guidance-body">
                        This receipt serves as tamper-evident proof of settlement recorded on the ledger. Ambagan never holds your private keys.
                      </p>
                    </div>
                  </div>

                  {/* Modal footer actions */}
                  <div className="pay-receipt-footer">
                    <Link
                      href={`/dashboard?openPlan=${encodeURIComponent(currentPlan.id)}&paid=true`}
                      className="pay-btn-receipt-done"
                    >
                      <span className="pay-btn-receipt-done-label">View in Group Dashboard</span>
                    </Link>
                    <button
                      type="button"
                      className="pay-btn-receipt-download"
                      onClick={downloadReceipt}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="pay-btn-receipt-download-label">Download Receipt</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {view === "method" && (
            <div className="pay-secure-badge-bottom">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="#176B45" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#176B45" strokeWidth="2" />
              </svg>
              <span>Authenticate only with your payment provider</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
