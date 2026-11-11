"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import defaultGroupConfig from "@/config/group.json";
import { DashboardLoading } from "./dashboard-loading";
import { DEFAULT_ANTIPOLO, DEFAULT_SCHOOL_PROJECT, calculateDaysLeft } from "./dashboard";
import {
  getRoundDueDate,
  computeTotalRounds,
  getRoundRecipientInfo,
  formatScheduleDate,
  formatIsoDate,
  calculateCycleEndDate,
  getPaymentBreakdown,
  normalizeFrequency,
  FrequencyType,
} from "./schedule-helper";
import "./contract.css";

type SavedPlan = {
  id: string;
  purpose?: string;
  goal?: string;
  start?: string;
  deadline?: string;
  frequency?: string;
  payments?: number;
  perPayment?: string;
  recipients?: { email: string; share: string }[];
  signature?: string;
};

type SignatureRecord = {
  signatoryId: string;
  name: string;
  email: string;
  role: string;
  type: "drawn" | "uploaded" | "typed";
  signatureData: string;
  font?: string;
  displayDate: string;
  signedAt: string;
};

type Participant = {
  id: string;
  slot: number;
  displayName: string;
  email: string;
  role: string;
  publicKey: string;
};

const DEFAULT_GROUP = "Land Cruiser";
const VERSION = "Draft v0.1";

const ACKS = [
  {
    title: "I have read the pending terms",
    body: "I understand that contribution amounts, dates, fees, payout order and custody details are still to be agreed and need every participant's approval.",
  },
  {
    title: "I understand this is not an investment",
    body: "This is a shared savings arrangement among the group. No returns, interest or profit are promised, and the pool target is a planning value only.",
  },
  {
    title: "I understand the Paiflow and crypto risks",
    body: "Value can change, transfers may be irreversible, and provider limits, outages or regulation may delay or reduce payouts. I will confirm Paiflow's actual terms myself.",
  },
  {
    title: "I agree to keep a record of approval",
    body: "I will keep the approved version, my acknowledgment record and my signed copy. Any optional crypto conversion needs my separate, explicit consent.",
  },
];

const FIELDS: [string, string][] = [
  ["Contribution / participant / round", "To be agreed"],
  ["Contribution deadline", "To be agreed"],
  ["Contribution currency / asset", "To be agreed"],
  ["Network", "To be agreed"],
  ["Fees / allocation of fees", "To be agreed"],
  ["Paiflow wallet / account", "To be agreed"],
  ["Agreement start date", "To be agreed"],
  ["Draw date, only if a draw is approved", "To be agreed"],
];

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

const word = (n: number) => WORDS[n] ?? String(n);
const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const makeNav = (n: number) => [
  ["01", "The group & savings purpose", "purpose"],
  ["02", "Individual participant contract", "individual-contract"],
  ["03", "Distribution rules", "distribution"],
  [
    "04",
    `${word(n).replace(/^./, (c) => c.toUpperCase())}-round payout schedule`,
    "schedule",
  ],
  ["05", "Paiflow & crypto risks", "custody"],
  ["06", "Your acknowledgments", "acks"],
  ["07", "Signatures & confirmation", "sign"],
];

export function Contract() {
  const [pageLoading, setPageLoading] = useState(true);
  const [checked, setChecked] = useState<boolean[]>(ACKS.map(() => false));
  const [changesRequested, setChangesRequested] = useState(false);
  const [contractActivated, setContractActivated] = useState(false);

  // Active participant for the current session (account per session)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [sessionMemberId, setSessionMemberId] = useState<string>("m1");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Signatures dictionary: key is signatoryId ('organizer', 'm1', 'm2', etc.)
  const [signatures, setSignatures] = useState<Record<string, SignatureRecord>>({});

  // E-Signature Modal state
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [modalSignatoryId, setModalSignatoryId] = useState<string>("m1");
  const [signMode, setSignMode] = useState<"drawn" | "uploaded">("drawn");
  const [uploadedImageData, setUploadedImageData] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [agreedConsent, setAgreedConsent] = useState<boolean>(true);
  const [hasDrawnStroke, setHasDrawnStroke] = useState(false);

  // File input and canvas references
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [live, setLive] = useState<{
    id: string;
    name: string;
    members: Array<{ id: string; slot: number; displayName: string; publicKey?: string }>;
    xlm: number;
    deadlines: string[];
    destinations: Array<{ slot: number; label: string; publicKey: string; percentBps: number }>;
    rounds: Array<{
      index: number;
      receiverMemberId: string;
      splitBps: { now: number; vault: number; fund: number };
      deadline: string;
    }>;
  }>({
    id: defaultGroupConfig.id,
    name: defaultGroupConfig.name,
    members: defaultGroupConfig.members,
    xlm: Number(BigInt(defaultGroupConfig.contributionStroops) / 10_000_000n),
    deadlines: defaultGroupConfig.rounds.map((r) => r.deadline),
    destinations: defaultGroupConfig.destinations,
    rounds: defaultGroupConfig.rounds,
  });

  const groupId = plan?.id || live.id || "tranche-demo";
  const planStartIso = plan?.start || "2026-10-14";
  const planEndIso = plan?.deadline || "2026-11-25";

  const [selectedFrequency, setSelectedFrequency] = useState<FrequencyType>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`ambagan_freq_${groupId}`);
        if (saved) return normalizeFrequency(saved);
      } catch {}
    }
    return normalizeFrequency(plan?.frequency);
  });

  // Check auth user session to bind contract to active account
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const u = data?.data ?? data;
        if (u?.username || u?.email) {
          const email = (u.email || u.username || "").toLowerCase();
          setCurrentUserEmail(email);
          const name = u.username || email.split("@")[0] || "Julianna";
          const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
          setCurrentUserName(capitalized);

        }
      })
      .catch(() => {});
  }, []);

  // Load signatures from server and localStorage
  useEffect(() => {
    const storageKey = `ambagan_signatures_${groupId}`;
    let initialSigs: Record<string, SignatureRecord> = {};
    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        initialSigs = JSON.parse(local);
      }
    } catch {}
    setSignatures(initialSigs);

    fetch(`/api/tranche/contract/signatures?groupId=${encodeURIComponent(groupId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data && typeof res.data === "object" && Object.keys(res.data).length > 0) {
          setSignatures((prev) => {
            const merged = { ...prev, ...res.data };
            try {
              localStorage.setItem(storageKey, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, [groupId]);

  // Check URL query parameters and load live group or custom saved plan.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const planId = params.get("plan");

      if (planId && planId !== "live") {
        const raw =
          localStorage.getItem("ambagan_groups") ??
          localStorage.getItem("tranche_paluwagans");
        const list = raw ? JSON.parse(raw) : null;
        const found = Array.isArray(list)
          ? list.find((x: SavedPlan) => x.id === planId)
          : null;
        if (found) {
          setPlan(found);
          return;
        }

        if (planId === "school-project") {
          setPlan(DEFAULT_SCHOOL_PROJECT);
          return;
        }
        if (planId === "antipolo-trip") {
          setPlan(DEFAULT_ANTIPOLO);
          return;
        }
      }

      if (!planId) {
        setPlan(DEFAULT_ANTIPOLO);
        return;
      }

      fetch("/api/tranche/group", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const g = j?.data;
          if (g?.members?.length) {
            setLive({
              id: g.id || "tranche-demo",
              name: g.name,
              members: g.members,
              xlm: Number(BigInt(g.contributionStroops) / 10_000_000n),
              deadlines: (g.rounds ?? []).map((r: { deadline: string }) => r.deadline),
              destinations: g.destinations ?? defaultGroupConfig.destinations,
              rounds: g.rounds ?? defaultGroupConfig.rounds,
            });
          }
        })
        .catch(() => {});
    } catch {}
  }, []);

  // Determine participant count (memberCount) and total schedule rounds (N).
  const isLiveGroup = !plan;

  // Number of participants (members):
  const memberCount = Math.max(
    1,
    plan?.recipients?.length ||
      (isLiveGroup ? live.members.length : 0) ||
      5
  );

  // Total schedule rounds calculated from start, deadline, cadence (daily, weekly, 15th & 30th, monthly):
  const N = computeTotalRounds(
    planStartIso,
    planEndIso,
    selectedFrequency,
    memberCount,
    plan?.payments
  );

  const ROUNDS = Array.from({ length: N }, (_, i) => i + 1);

  // Group name & goal:
  const GROUP =
    plan?.purpose && !plan.purpose.startsWith("<<")
      ? plan.purpose
      : isLiveGroup
      ? live.name
      : DEFAULT_GROUP;

  // Calculations for equal distribution:
  const isXlm = isLiveGroup;
  const goalNum = plan?.goal
    ? Number(plan.goal.replace(/[^0-9.]/g, ""))
    : isLiveGroup
    ? live.xlm * N
    : 12000;

  const validGoal = Number.isFinite(goalNum) && goalNum > 0 ? goalNum : 12000;
  const equalPayoutAmount = validGoal / N;

  const formatMoney = (val: number) => (isXlm ? `${val} XLM` : peso(val));

  const GOAL = plan?.goal
    ? /^\s*₱/.test(plan.goal)
      ? plan.goal.trim()
      : `₱${plan.goal.trim()}`
    : formatMoney(validGoal);

  const equalPayoutFormatted = formatMoney(equalPayoutAmount);
  const equalContributionFormatted = formatMoney(
    isXlm ? live.xlm : equalPayoutAmount / (memberCount > 1 ? memberCount - 1 : 1)
  );

  const UNIFIED_MEMBER_NAMES = [
    "Villaluna J.",
    "Villaluna Jomari (You)",
    "Speirs Keith",
    "Mondares Matt",
    "Rivera M.",
    "Aniog D.",
  ];

  // Participant list:
  const participantList: Participant[] = [
    {
      id: "organizer",
      slot: 0,
      displayName: "Organizer (Ambagan Lead)",
      email: currentUserEmail || "organizer@ambagan.ph",
      role: "Organizer & Custody Lead",
      publicKey: "GAZEEM5RF7DR2NQILQKBIZ7MARK7GYNPYPHQ2XODCB6SQO4VU5SE4QR4",
    },
    ...Array.from({ length: memberCount }, (_, i) => {
      const liveMember = isLiveGroup ? live.members[i] : null;
      const customRecip = plan?.recipients?.[i];
      const memberId = liveMember?.id || `m${i + 1}`;
      
      let humanName = UNIFIED_MEMBER_NAMES[i] || `Member ${i + 1}`;
      if (customRecip?.email) {
        const em = customRecip.email.toLowerCase();
        if (em.includes("jullianna") || em.includes("villaluna12")) {
          humanName = "Villaluna J.";
        } else if (em.includes("jomari")) {
          humanName = "Villaluna Jomari (You)";
        } else if (em.includes("keith")) {
          humanName = "Speirs Keith";
        } else if (em.includes("matt")) {
          humanName = "Mondares Matt";
        } else if (em.includes("rivera")) {
          humanName = "Rivera M.";
        } else if (em.includes("aniog")) {
          humanName = "Aniog D.";
        } else {
          const prefix = customRecip.email.split("@")[0] || `Member ${i + 1}`;
          humanName = prefix.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        }
      } else if (liveMember?.displayName) {
        humanName = liveMember.displayName;
      }

      const defaultPk = defaultGroupConfig.members[i]?.publicKey || "GCXRU43SEU2YDEEV4ZALE3SPKTZJ3SGV4C47F562CV2LHCGPE5IAJFUI";
      return {
        id: memberId,
        slot: i + 1,
        displayName: humanName,
        email: customRecip?.email || `${humanName.toLowerCase().replace(/[^a-z0-9]/g, "") || `member${i + 1}`}@ambagan.ph`,
        role: `Round ${i + 1} Recipient`,
        publicKey: liveMember?.publicKey || defaultPk,
      };
    }),
  ];

  // Keep names unique so each pill / perspective option is distinguishable.
  const seenNames: Record<string, number> = {};
  for (const p of participantList) {
    seenNames[p.displayName] = (seenNames[p.displayName] ?? 0) + 1;
    if (seenNames[p.displayName]! > 1) p.displayName = `${p.displayName} (Slot ${p.slot})`;
  }

  const fallbackParticipant: Participant = participantList[0] || {
    id: "organizer",
    slot: 0,
    displayName: "Organizer",
    email: "organizer@tranche.finance",
    role: "Organizer",
    publicKey: "",
  };

  const recipientNames: string[] = participantList.slice(1).map((p) => p.displayName);

  // Active participant details for current session
  const activeParticipant: Participant =
    participantList.find((p) => p.id === sessionMemberId) || participantList[1] || fallbackParticipant;
  const activeRoundInfo =
    live.rounds.find((r) => r.receiverMemberId === activeParticipant.id) ||
    live.rounds[Math.max(0, activeParticipant.slot - 1)];
  const activeDestinations = live.destinations.filter((d) => d.slot === activeParticipant.slot);
  const isOrganizer = activeParticipant.slot === 0 || activeParticipant.id === "organizer";

  const handleSendReminder = (targetName: string, targetEmail: string) => {
    setToastMessage(`Signature reminder sent to ${targetName} (${targetEmail})!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const copyStellarKey = (key: string) => {
    try {
      navigator.clipboard?.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {}
  };

  const nowBps = activeRoundInfo?.splitBps?.now ?? 7700;
  const vaultBps = activeRoundInfo?.splitBps?.vault ?? 2000;
  const fundBps = activeRoundInfo?.splitBps?.fund ?? 300;

  const nowAmount = (equalPayoutAmount * nowBps) / 10000;
  const vaultAmount = (equalPayoutAmount * vaultBps) / 10000;
  const fundAmount = (equalPayoutAmount * fundBps) / 10000;
  const isSignedByMe = !!signatures[activeParticipant.id];

  useEffect(() => {
    if (plan?.frequency) {
      setSelectedFrequency(normalizeFrequency(plan.frequency));
    }
  }, [plan?.frequency]);

  const handleFrequencyChange = (newFreq: FrequencyType) => {
    setSelectedFrequency(newFreq);
    const newTotalRounds = computeTotalRounds(planStartIso, planEndIso, newFreq, memberCount, plan?.payments);
    try {
      localStorage.setItem(`ambagan_freq_${groupId}`, newFreq);
      localStorage.setItem(`ambagan_rounds_${groupId}`, String(newTotalRounds));
      window.dispatchEvent(
        new CustomEvent("ambagan_frequency_changed", {
          detail: { groupId, frequency: newFreq, totalRounds: newTotalRounds },
        })
      );
    } catch {}
    setToastMessage(`Payment cadence updated to ${newFreq.toUpperCase()}. Recalculated ${newTotalRounds} rounds across schedule.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const startD = new Date(planStartIso.includes("T") ? planStartIso : `${planStartIso}T00:00:00`);
  const endD = new Date(planEndIso.includes("T") ? planEndIso : `${planEndIso}T00:00:00`);

  const formattedStartDate = !isNaN(+startD) ? fmtDate(startD) : "14 Oct 2026";
  const formattedEndDate = !isNaN(+endD) ? fmtDate(endD) : "25 Nov 2026";

  const cycleEndDateObj = calculateCycleEndDate(planStartIso, planEndIso, selectedFrequency, N);
  const formattedCycleEndDate = formatScheduleDate(cycleEndDateObj);
  const cycleDaysLeft = calculateDaysLeft(formatIsoDate(cycleEndDateObj), plan?.id === "antipolo-trip" ? 27 : 17);
  const daysLeftText = cycleDaysLeft;

  const paymentBreakdown = getPaymentBreakdown(plan?.goal, plan?.perPayment, N, N);
  const memberContributionDue = plan?.perPayment
    ? plan.perPayment
    : isXlm
    ? `${live.xlm} XLM`
    : paymentBreakdown.memberPaymentFormatted;
  const roundPoolPayout = equalPayoutFormatted;

  const payoutDate = (i: number): string => {
    if (isLiveGroup && live.deadlines?.[i - 1]) {
      const dl = live.deadlines[i - 1];
      if (typeof dl === "string" && dl.length > 0) {
        const d = new Date(dl);
        if (!isNaN(+d)) return fmtDate(d);
      }
    }
    const d = getRoundDueDate(planStartIso, planEndIso, selectedFrequency, i, N);
    return formatScheduleDate(d);
  };

  // Live settlement monitor, derived from the open contract.
  // Starts at 0 (unpaid) so the first member is NOT pre-paid before the contract is signed.
  const [settledRounds, setSettledRounds] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const stored = localStorage.getItem(`ambagan_settled_${groupId}`);
      if (stored !== null && !isNaN(Number(stored))) {
        return Math.min(N, Math.max(0, Number(stored)));
      }
      const paid = localStorage.getItem(`ambagan_paid_${groupId}`) === "true";
      if (paid) return 1;
    } catch {}
    return 0;
  });

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingRound, setPayingRound] = useState<number>(1);
  const [payMethod, setPayMethod] = useState<"gcash" | "maya" | "bank" | "cash">("gcash");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Signatures tracking — count only active participants of this contract
  const totalSignatories = participantList.length; // Organizer + N recipients
  const signedCount = participantList.filter((p) => !!signatures[p.id]).length;
  const isFullySigned = signedCount >= totalSignatories;

  useEffect(() => {
    const syncSettled = () => {
      try {
        const stored = localStorage.getItem(`ambagan_settled_${groupId}`);
        if (stored !== null && !isNaN(Number(stored))) {
          setSettledRounds(Math.min(N, Math.max(0, Number(stored))));
          return;
        }
        const paid = localStorage.getItem(`ambagan_paid_${groupId}`) === "true";
        if (paid) {
          setSettledRounds((prev) => Math.max(1, prev));
          return;
        }
        setSettledRounds(0);
      } catch {
        setSettledRounds(0);
      }
    };
    syncSettled();
    window.addEventListener("ambagan_payment_completed", syncSettled);
    window.addEventListener("storage", syncSettled);
    return () => {
      window.removeEventListener("ambagan_payment_completed", syncSettled);
      window.removeEventListener("storage", syncSettled);
    };
  }, [groupId, N]);

  const handleOpenPayModal = (roundNum?: number) => {
    if (!isFullySigned) {
      setToastMessage("🔒 Payment is locked until the contract is signed by all participants. Please sign the contract first!");
      setTimeout(() => setToastMessage(null), 4000);
      const firstUnsigned = participantList.find((p) => !signatures[p.id]);
      if (firstUnsigned) {
        openSignatureModal(firstUnsigned.id);
      }
      return;
    }
    const targetRound = roundNum || Math.min(N, settledRounds + 1);
    setPayingRound(targetRound);
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = (roundNum: number) => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      const newSettled = Math.max(settledRounds, roundNum);
      setSettledRounds(newSettled);
      setIsProcessingPayment(false);
      setIsPayModalOpen(false);

      const recipientName =
        recipientNames[(roundNum - 1) % recipientNames.length] || `Member ${roundNum}`;
      try {
        localStorage.setItem(`ambagan_settled_${groupId}`, String(newSettled));
        localStorage.setItem(`ambagan_paid_${groupId}`, "true");
        localStorage.setItem("ambagan_last_paid_plan", groupId);
        window.dispatchEvent(
          new CustomEvent("ambagan_payment_completed", {
            detail: {
              groupId,
              round: roundNum,
              settledCount: newSettled,
              member: recipientName,
              amount: memberContributionDue,
              frequency: selectedFrequency,
              dueDate: payoutDate(roundNum),
            },
          })
        );
      } catch {}

      setToastMessage(`✓ Payment confirmed for Round ${roundNum} (${recipientName} · ${memberContributionDue}). Secured on ledger.`);
      setTimeout(() => setToastMessage(null), 4500);
    }, 850);
  };

  const handleResetPayments = () => {
    setSettledRounds(0);
    try {
      localStorage.setItem(`ambagan_settled_${groupId}`, "0");
      localStorage.removeItem(`ambagan_paid_${groupId}`);
      window.dispatchEvent(
        new CustomEvent("ambagan_payment_completed", {
          detail: { groupId, settledCount: 0 },
        })
      );
    } catch {}
    setToastMessage("↺ Reset payments to 0 (First member unpaid · Round 1 assigned to pay after contract signing)");
    setTimeout(() => setToastMessage(null), 3500);
  };

  const settledCount = settledRounds;
  const paidMembers = participantList.slice(1, settledCount + 1);
  const paidMember = settledCount > 0 ? participantList[settledCount] : null;
  const nextMember = settledCount < N ? participantList[settledCount + 1] : null;
  const tag = (m: Participant) => `${m.displayName.replace(/ \(Slot \d+\)$/, "")} (${m.id === activeParticipant.id ? "You · " : ""}Slot ${m.slot})`;

  const done = checked.filter(Boolean).length;
  const allChecked = done === ACKS.length;

  const toggle = (i: number) =>
    setChecked((c) => c.map((v, k) => (k === i ? !v : v)));

  // Open signature modal for any signatory in demo mode without personal account restrictions
  const openSignatureModal = (signatoryId?: string) => {
    const targetId = signatoryId || activeParticipant.id;
    setSessionMemberId(targetId);
    setModalSignatoryId(targetId);
    setUploadedImageData(null);
    setUploadedFileName("");
    setHasDrawnStroke(false);
    setIsSignModalOpen(true);
  };

  const handleDemoSignAll = async () => {
    const today = new Date();
    const displayDate = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const newSigs: Record<string, SignatureRecord> = { ...signatures };
    for (const p of participantList) {
      if (!newSigs[p.id]) {
        newSigs[p.id] = {
          signatoryId: p.id,
          name: p.displayName,
          email: p.email,
          role: p.role,
          type: "typed",
          signatureData: p.displayName,
          displayDate,
          signedAt: today.toISOString(),
        };
      }
    }

    setSignatures(newSigs);
    try {
      localStorage.setItem(`ambagan_signatures_${groupId}`, JSON.stringify(newSigs));
    } catch {}

    // Persist to backend for consistency
    for (const p of participantList) {
      if (!signatures[p.id]) {
        try {
          await fetch("/api/tranche/contract/signatures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId,
              signatoryId: p.id,
              name: p.displayName,
              email: p.email,
              role: p.role,
              type: "typed",
              signatureData: p.displayName,
              displayDate,
              termsAccepted: true,
            }),
          });
        } catch {}
      }
    }

    setToastMessage("All participants signed for demo presentation!");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleResetSignatures = async () => {
    setSignatures({});
    try {
      localStorage.removeItem(`ambagan_signatures_${groupId}`);
    } catch {}
    try {
      await fetch(`/api/tranche/contract/signatures?groupId=${encodeURIComponent(groupId)}`, {
        method: "DELETE",
      });
    } catch {}
    setToastMessage("Contract signatures reset for demo!");
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, SVG, WebP).");
      return;
    }
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (typeof loadEvt.target?.result === "string") {
        setUploadedImageData(loadEvt.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, SVG, WebP).");
      return;
    }
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (typeof loadEvt.target?.result === "string") {
        setUploadedImageData(loadEvt.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Canvas drawing handlers
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a4d2e";
    ctx.lineWidth = 2.5;
  }, []);

  useEffect(() => {
    if (isSignModalOpen && signMode === "drawn") {
      setTimeout(initCanvas, 50);
    }
  }, [isSignModalOpen, signMode, initCanvas]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      if (touch) {
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
    }
    const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;
    return {
      x: mouseEvent.clientX - rect.left,
      y: mouseEvent.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    setHasDrawnStroke(true);
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnStroke(false);
  };

  // Submit and save e-signature
  const handleAdoptSignature = async () => {
    const target: Participant = participantList.find((p) => p.id === modalSignatoryId) || activeParticipant;
    let signatureData = "";

    if (signMode === "drawn") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawnStroke) {
        alert("Please draw your signature in the pad before proceeding.");
        return;
      }
      signatureData = canvas.toDataURL("image/png");
    } else {
      if (!uploadedImageData) {
        alert("Please select or drop an image file of your signature.");
        return;
      }
      signatureData = uploadedImageData;
    }

    const today = new Date();
    const displayDate = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const newSig: SignatureRecord = {
      signatoryId: target.id,
      name: target.displayName,
      email: target.email,
      role: target.role,
      type: signMode,
      signatureData,
      displayDate,
      signedAt: today.toISOString(),
    };

    const updated = {
      ...signatures,
      [target.id]: newSig,
    };

    setSignatures(updated);
    try {
      localStorage.setItem(`ambagan_signatures_${groupId}`, JSON.stringify(updated));
    } catch {}

    // Post to FastAPI backend
    try {
      await fetch("/api/tranche/contract/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          signatoryId: target.id,
          name: newSig.name,
          email: newSig.email,
          role: newSig.role,
          type: newSig.type,
          signatureData: newSig.signatureData,
          font: newSig.font,
          displayDate: newSig.displayDate,
          termsAccepted: true,
        }),
      });
    } catch {}

    setIsSignModalOpen(false);
  };

  return (
    <div className="ec">
      {pageLoading && <DashboardLoading />}
      <header className="ec-header">
        <Link href="/dashboard" className="ec-brand" aria-label="Ambagan home">
          <div className="ec-logo-group">
            <svg
              width="45.41"
              height="44.16"
              viewBox="0 0 45.41 44.16"
              aria-hidden="true"
              style={{ overflow: "visible" }}
            >
              <defs>
                <filter id="ec-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="10.38" />
                </filter>
              </defs>
              <g filter="url(#ec-glow)">
                <ellipse cx="22.7" cy="22.1" rx="20" ry="20" fill="#B54880" />
              </g>
              <image href="/images/logo.svg" width="45.41" height="44.16" preserveAspectRatio="none" />
            </svg>
          </div>
          <span className="ec-brand-name">Ambagan</span>
        </Link>
        <span className="ec-workspace">
          {GROUP.toUpperCase()} &nbsp;/&nbsp; INDIVIDUAL E-CONTRACT WORKSPACE
        </span>
      </header>

      <div className="ec-workspace-area">
        <nav className="ec-rail" aria-label="Navigation rail">
          <div className="ec-nav">
            <Link
              href="/dashboard"
              className="ec-nav-btn active"
              style={{ top: 32.72 }}
              aria-label="Dashboard"
              title="Dashboard"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="#B54880"
                aria-hidden="true"
              >
                <path d="M12 2.5 2.5 11h2.7V21h5.6v-6h2.4v6h5.6V11h2.7z" />
              </svg>
            </Link>
            <Link
              href="/pay"
              className="ec-nav-btn"
              style={{ top: 87.49 }}
              aria-label="Payments"
              title="Payments"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="#E1EDA0"
                aria-hidden="true"
              >
                <path
                  d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v6h3.5l1 2h7l1-2H20V6zm0 8v4h16v-4h-2.4l-1 2H7.400l-1-2z"
                  fillRule="evenodd"
                />
              </svg>
            </Link>
            <Link
              href="/dashboard"
              className="ec-nav-btn"
              style={{ top: 142.26 }}
              aria-label="Create Ambagan"
              title="Create Ambagan"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 3v18M3 12h18"
                  stroke="#E1EDA0"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
            <Link
              href="/dashboard"
              className="ec-nav-btn"
              style={{ top: 479.42 }}
              aria-label="Profile"
              title="Profile"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="#E1EDA0"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4.5" />
                <path d="M3.500 21c0-4.500 3.800-7 8.500-7s8.500 2.500 8.500 7z" />
              </svg>
            </Link>
            <span className="ec-nav-arrow" aria-hidden="true">
              »
            </span>
          </div>
        </nav>

        <div className="ec-review">
          <div className="ec-intro">
            <div className="ec-breadcrumb">
              <Link
                href="/dashboard"
                style={{ textDecoration: "none", color: "#2d6a3f" }}
              >
                {GROUP}
              </Link>
              <span aria-hidden="true">›</span>
              <span className="dim">Individual E-Contract &amp; Electronic Signature</span>
            </div>
            <div className="ec-title-row">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <h1 className="ec-heading" style={{ margin: 0 }}>Individual Ambagan E-Contract</h1>
                  <span className="ec-days-badge ec-badge-amber" title={`${cycleDaysLeft} until contract cycle completion (${formattedCycleEndDate})`}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                      <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>{cycleDaysLeft}</span>
                  </span>
                </div>
                <p className="ec-subtitle" style={{ marginTop: 6 }}>
                  Legally binding individual agreement active from <strong>{formattedStartDate}</strong> to <strong>{formattedCycleEndDate}</strong> ({cycleDaysLeft}) · {selectedFrequency.charAt(0).toUpperCase() + selectedFrequency.slice(1)} cycle ({N} rounds) · Cryptographic e-signature portal.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="ec-download"
                  onClick={() => window.print()}
                >
                  ⭳ <span>Download PDF</span>
                </button>
              </div>
            </div>

            {/* Live Settlement & System Monitor Banner */}
            <div
              style={{
                marginTop: 14,
                marginBottom: 14,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isFullySigned ? "#16a34a" : "#d97706", display: "inline-block" }} />
                  <strong style={{ fontSize: "13px", color: "#14532d" }}>Ambagan Live Settlement &amp; Member Monitor</strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: "10px" }}>
                    {signedCount}/{totalSignatories} Signed · {settledCount}/{N} Settled
                  </span>

                  {/* Payment Cadence Selector */}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "#ffffff",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      padding: "2px 6px",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#166534" }}>Cadence:</span>
                    <select
                      value={selectedFrequency}
                      onChange={(e) => handleFrequencyChange(e.target.value as FrequencyType)}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#166534",
                        cursor: "pointer",
                        outline: "none",
                      }}
                      title="Adjust payment frequency (Weekly, Daily, Bi-weekly, Monthly)"
                    >
                      <option value="daily">Daily (Every 1d)</option>
                      <option value="weekly">Weekly (Every 7d)</option>
                      <option value="bi-weekly">Bi-weekly (Every 14d)</option>
                      <option value="semi-monthly">Semi-monthly (15th/30th)</option>
                      <option value="monthly">Monthly (Every 30d)</option>
                    </select>
                  </div>

                  {!isFullySigned && (
                    <button
                      type="button"
                      onClick={() => void handleDemoSignAll()}
                      title="Sign all pending participants for demo"
                      style={{
                        padding: "3px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d97706",
                        background: "#fef3c7",
                        color: "#92400e",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      🔒 Sign Contract First ({signedCount}/{totalSignatories})
                    </button>
                  )}
                  {settledCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetPayments}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "8px",
                        border: "1px solid #bbf7d0",
                        background: "#ffffff",
                        color: "#166534",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ↺ Reset Demo
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div style={{ background: "#ffffff", border: "1px solid #dcfce7", borderRadius: "8px", padding: "8px 12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803d", display: "block" }}>✓ WHO PAID ALREADY</span>
                  <strong style={{ fontSize: "13px", color: "#14532d" }}>
                    {paidMembers.length > 0 ? paidMembers.map((m) => tag(m)).join(", ") : "No payments yet (First member unpaid)"}
                  </strong>
                  <span style={{ fontSize: "11px", color: "#4b5563", display: "block", marginTop: 2 }}>
                    {paidMembers.length > 0
                      ? `${paidMembers.length} contribution${paidMembers.length > 1 ? "s" : ""} settled (${formatMoney(paymentBreakdown.memberPaymentNum * paidMembers.length)} pool secured)`
                      : isFullySigned
                      ? `Contract signed — Ready for Round 1 payment`
                      : "Payments unlock sequentially after all participants sign the contract"}
                  </span>
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #fde68a", borderRadius: "8px", padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#b45309", display: "block" }}>🕒 WHO IS ASSIGNED TO PAY NEXT</span>
                    <strong style={{ fontSize: "13px", color: "#92400e" }}>
                      {nextMember ? tag(nextMember) : "All rounds settled"}
                    </strong>
                    <span style={{ fontSize: "11px", color: "#4b5563", display: "block", marginTop: 2 }}>
                      {nextMember
                        ? `Assigned for Round ${nextMember.slot} · Due ${payoutDate(nextMember.slot)} (${memberContributionDue})`
                        : "No pending payments"}
                    </span>
                  </div>
                  {nextMember && (
                    <div style={{ marginTop: 6 }}>
                      {isFullySigned ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(nextMember.slot)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #16a34a",
                            background: "#16a34a",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          ⚡ Pay as {nextMember.displayName.replace(/ \(Slot \d+\)$/, "")} ({memberContributionDue})
                        </button>
                      ) : (
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            border: "1px solid #fde68a",
                            background: "#fffbeb",
                            color: "#92400e",
                            fontSize: "10.5px",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          🔒 Requires all signatures before payment
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ background: "#ffffff", border: "1px solid #dbeafe", borderRadius: "8px", padding: "8px 12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", display: "block" }}>● WORKFLOW GATE &amp; CADENCE MONITOR</span>
                  <strong style={{ fontSize: "13px", color: "#1e40af" }}>
                    {isFullySigned
                      ? `Contract Signed · ${selectedFrequency.toUpperCase()} Active`
                      : `Awaiting E-Signatures (${signedCount}/${totalSignatories})`}
                  </strong>
                  <span style={{ fontSize: "11px", color: "#4b5563", display: "block", marginTop: 2 }}>
                    {isFullySigned
                      ? `${memberContributionDue} / member / round · Cycle active to ${formattedCycleEndDate}`
                      : "Once all accounts sign, assigned payer can settle on-chain"}
                  </span>
                </div>
              </div>
            </div>

            {/* Demo Visual: Email Dispatch Notifications & Contract/Payment Assignment */}
            <div
              style={{
                marginBottom: 16,
                background: "#ffffff",
                border: "1.5px solid #c7d2fe",
                borderRadius: "12px",
                padding: "14px 16px",
                boxShadow: "0 2px 8px rgba(30, 64, 175, 0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        background: "#e0e7ff",
                        color: "#1e40af",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        letterSpacing: "0.02em",
                      }}
                    >
                      ✉️ DEMO EMAIL DISPATCH VISUAL
                    </span>
                    <strong style={{ fontSize: "13.5px", color: "#1e293b" }}>
                      Emailed Accounts: Who Needs to Answer the Contract &amp; Who Is Assigned to Pay
                    </strong>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569" }}>
                    When the handler creates an Ambagan, every emailed account receives a contract notification. Since this is a demo system, use the cards below to see <strong>who needs to answer/sign the contract</strong> and <strong>who is assigned to pay</strong> (payment unlocks after signing).
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!isFullySigned ? (
                    <button
                      type="button"
                      onClick={() => void handleDemoSignAll()}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "8px",
                        border: "1px solid #1e40af",
                        background: "#1e40af",
                        color: "#ffffff",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✓ Answer &amp; Sign All Emailed Accounts
                    </button>
                  ) : (
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#166534",
                        border: "1px solid #86efac",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "8px",
                      }}
                    >
                      ✓ All Emailed Accounts Signed · Payment Unlocked
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(265px, 1fr))",
                  gap: 10,
                }}
              >
                {participantList.slice(1).map((p) => {
                  const hasSigned = !!signatures[p.id];
                  const isPaidMember = p.slot <= settledCount;
                  const isAssignedNextPayer = p.slot === settledCount + 1;
                  const cleanName = p.displayName.replace(/ \(Slot \d+\)$/, "");

                  return (
                    <div
                      key={p.id}
                      style={{
                        border: isAssignedNextPayer
                          ? "1.5px solid #f59e0b"
                          : hasSigned
                          ? "1px solid #bbf7d0"
                          : "1px solid #e2e8f0",
                        background: isAssignedNextPayer
                          ? "#fffbeb"
                          : hasSigned
                          ? "#f0fdf4"
                          : "#f8fafc",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a" }}>
                            Slot {p.slot}: {cleanName}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "6px",
                              background: isPaidMember
                                ? "#dcfce7"
                                : isAssignedNextPayer
                                ? "#fef3c7"
                                : "#f1f5f9",
                              color: isPaidMember
                                ? "#166534"
                                : isAssignedNextPayer
                                ? "#92400e"
                                : "#475569",
                              border: isAssignedNextPayer ? "1px solid #fde68a" : "none",
                            }}
                          >
                            {isPaidMember
                              ? "✓ Paid"
                              : isAssignedNextPayer
                              ? `💳 Assigned to Pay (Round ${p.slot})`
                              : `Round ${p.slot} Queue`}
                          </span>
                        </div>

                        <div style={{ fontSize: "11px", color: "#475569", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>📧 Notified:</span>
                          <strong style={{ color: "#334155" }}>{p.email}</strong>
                        </div>

                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: hasSigned ? "#15803d" : "#b45309" }}>
                            {hasSigned
                              ? "✓ Contract Answered & Signed"
                              : "⏳ Needs to Answer & Sign Contract"}
                          </div>
                          <div style={{ fontSize: "11px", color: "#334155", fontWeight: 500 }}>
                            {isPaidMember
                              ? `✓ Settled ${memberContributionDue} on ${payoutDate(p.slot)}`
                              : isAssignedNextPayer
                              ? isFullySigned
                                ? `Ready to pay ${memberContributionDue} (Due ${payoutDate(p.slot)})`
                                : `Assigned to pay ${memberContributionDue} (Due ${payoutDate(p.slot)}) after contract is signed`
                              : `Scheduled for ${payoutDate(p.slot)} (${memberContributionDue})`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2, alignItems: "center" }}>
                        {!hasSigned ? (
                          <button
                            type="button"
                            onClick={() => openSignatureModal(p.id)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "6px",
                              border: "1px solid #2d6a3f",
                              background: "#2d6a3f",
                              color: "#ffffff",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ✍️ Answer &amp; Sign as {cleanName}
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 600,
                              color: "#166534",
                              background: "#dcfce7",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            ✓ Signed ({signatures[p.id]?.displayDate})
                          </span>
                        )}

                        {isAssignedNextPayer && isFullySigned && !isPaidMember && (
                          <button
                            type="button"
                            onClick={() => handleOpenPayModal(p.slot)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "6px",
                              border: "1px solid #16a34a",
                              background: "#16a34a",
                              color: "#ffffff",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            ⚡ Pay Now ({memberContributionDue})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Group Signing Status Bar (Account per session) */}
            <div className="ec-participant-bar">
              <div className="ec-participant-header">
                <div className="ec-participant-title">
                  <span>
                    Demo Signatory: <strong>{activeParticipant.displayName}</strong>
                  </span>
                  <span className="ec-dest-badge" style={{ background: isOrganizer ? "#fef08a" : "#e1eda0", color: isOrganizer ? "#854d0e" : "#2d6a3f" }}>
                    {isOrganizer ? "Ambagan Lead" : `Slot #${activeParticipant.slot}`}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#2d6a3f" }}>Perspective:</span>
                    <select
                      className="ec-demo-select"
                      value={activeParticipant.id}
                      onChange={(e) => setSessionMemberId(e.target.value)}
                      aria-label="Select demo participant"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "1.2px solid #d3efc9",
                        background: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "#1a2e1a",
                        cursor: "pointer",
                      }}
                    >
                      {participantList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.slot === 0 ? "Organizer (Lead)" : `${p.displayName} (${p.role})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="ec-demo-btn"
                    onClick={() => void handleDemoSignAll()}
                    title="Sign all pending participants with demo signatures for instant presentation walkthrough"
                    style={{
                      padding: "5px 12px",
                      borderRadius: "8px",
                      border: "1px solid #2d6a3f",
                      background: "#2d6a3f",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Demo: Sign All
                  </button>

                  <a
                    href="#schedule"
                    className="ec-demo-btn"
                    title="View the scheduled payment dates and amounts per round"
                    style={{
                      padding: "5px 12px",
                      borderRadius: "8px",
                      border: "1px solid #16a34a",
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: "12px",
                      fontWeight: 600,
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    📅 View Payment Schedule
                  </a>

                  <button
                    type="button"
                    className="ec-demo-btn-secondary"
                    onClick={() => void handleResetSignatures()}
                    title="Reset all signatures to demonstrate the signing flow from scratch"
                    style={{
                      padding: "5px 10px",
                      borderRadius: "8px",
                      border: "1px solid #d3efc9",
                      background: "#f7f9f0",
                      color: "#48574b",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    ↺ Reset Sigs
                  </button>

                  {settledCount > 0 && (
                    <button
                      type="button"
                      className="ec-demo-btn-secondary"
                      onClick={handleResetPayments}
                      title="Reset payment progress back to 0 (First member unpaid)"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d3efc9",
                        background: "#f7f9f0",
                        color: "#48574b",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      ↺ Reset Payments
                    </button>
                  )}

                  <div style={{ fontSize: 12, color: "#778174" }}>
                    {signedCount} of {totalSignatories} signed
                  </div>
                </div>
              </div>
              <div className="ec-pills-list">
                {participantList.map((p) => {
                  const isSigned = !!signatures[p.id];
                  const isMe = p.id === activeParticipant.id;
                  const isLeadPill = p.id === "organizer";
                  return (
                    <div
                      key={p.id}
                      className={`ec-pill-item${isLeadPill ? " organizer-pill" : ""}${isMe ? " my-account" : ""}`}
                      onClick={() => {
                        setSessionMemberId(p.id);
                        setToastMessage(`Switched active demo perspective to ${p.displayName}`);
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSessionMemberId(p.id);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                      title={`Demo Mode: Click to switch perspective to ${p.displayName} (${p.role})`}
                    >
                      <span className={`ec-pill-dot${isSigned ? " signed" : ""}`} />
                      <span>{p.displayName}</span>
                      {isMe && <span className="ec-pill-me-tag">{isLeadPill ? "Lead" : "Active"}</span>}
                      <span style={{ fontSize: 11, opacity: 0.85 }}>
                        {isSigned
                          ? isLeadPill
                            ? "Countersigned"
                            : "Signed"
                          : isLeadPill
                          ? "• Pending Lead"
                          : "• Pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ec-notice">
              <strong>Demo Presentation Mode:</strong> Signatory accounts are not tied to personal user logins. Click any pill above or use <strong>Sign as [Name]</strong> in the register below to test and demonstrate the contract signing process freely.
            </div>
          </div>

          <div className="ec-columns">
            <div className="ec-doc">
              {/* 01: The group & savings purpose */}
              <section
                className="ec-card"
                id="purpose"
                aria-label="The group and savings purpose"
              >
                <div className="ec-sec-head">
                  <div className="ec-title-row2">
                    <span className="ec-clause">01</span>
                    <h2 className="ec-sec-title">The group &amp; savings purpose</h2>
                  </div>
                  <p className="ec-desc">
                    This agreement establishes the formal mutual savings collective between the organizer and {word(N)}{" "}
                    participants of the {GROUP} Ambagan.
                  </p>
                </div>
                <div className="ec-pool ec-pool-4">
                  <div className="ec-metric">
                    <span className="l">Pool target</span>
                    <span className="v">{GOAL}</span>
                  </div>
                  <div className="ec-metric">
                    <span className="l">Total participants</span>
                    <span className="v">
                      {N} members
                    </span>
                  </div>
                  <div className="ec-metric">
                    <span className="l">Distribution cycle</span>
                    <span className="v">
                      {N} round{N === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="ec-metric ec-metric-timeline">
                    <span className="l">Contract timeline</span>
                    <div className="v ec-timeline-v">
                      <span className="ec-timeline-dates">{formattedStartDate} – {formattedEndDate}</span>
                      <span className="ec-days-badge ec-badge-amber" title={`${daysLeftText} remaining until deadline`}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                          <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <span>{daysLeftText}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ec-fields">
                  <div className="ec-field">
                    <span className="l">Group / purpose</span>
                    <span className="v">{GROUP} · Shared savings collective</span>
                  </div>
                  <div className="ec-field">
                    <span className="l">Organizer / custody lead</span>
                    <span className="v">{currentUserEmail || "organizer@tranche.finance"}</span>
                  </div>
                  <div className="ec-field">
                    <span className="l">Agreement start date</span>
                    <span className="v">{formattedStartDate}</span>
                  </div>
                  <div className="ec-field">
                    <span className="l">Agreement end date (Deadline)</span>
                    <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>{formattedEndDate}</span>
                      <span className="ec-days-badge ec-badge-amber" title={`${daysLeftText} remaining until deadline`}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                          <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <span>{daysLeftText}</span>
                      </span>
                    </span>
                  </div>
                </div>
                <p className="ec-desc">
                  Participants: {recipientNames.join(", ")}. Each participant enters into an individual binding agreement with defined payment cycles and payout entitlements.
                </p>
                <div className="ec-divider" />
                <div className="ec-fields">
                  {FIELDS.map(([l, v0]) => {
                    const isDeadlineField = l === "Contribution deadline";
                    const v =
                      l === "Agreement start date"
                        ? formattedStartDate
                        : isDeadlineField
                        ? formattedEndDate
                        : l === "Contribution / participant / round"
                        ? plan?.perPayment || equalContributionFormatted
                        : l === "Contribution currency / asset" && isXlm
                        ? "XLM (Stellar testnet)"
                        : l === "Contribution currency / asset"
                        ? "PHP (Philippine Peso)"
                        : l === "Network" && isXlm
                        ? "Stellar Testnet"
                        : l === "Network"
                        ? "Paiflow Vault (Stellar Network)"
                        : l === "Fees / allocation of fees"
                        ? "0% Platform fee (Community savings)"
                        : v0;
                    return (
                      <div className="ec-field" key={l}>
                        <span className="l">{l}</span>
                        <span className="v">
                          {isDeadlineField ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>{formattedEndDate}</span>
                              <span className="ec-days-badge ec-badge-amber">
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                  <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                                  <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                                <span>{daysLeftText}</span>
                              </span>
                            </span>
                          ) : (
                            v
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 02: Individual participant contract or Organizer charter */}
              <section
                className="ec-card"
                id="individual-contract"
                aria-label={isOrganizer ? "Organizer administration & custody charter" : "Individual participant schedule & commitments"}
              >
                {isOrganizer ? (
                  <>
                    <div className="ec-sec-head">
                      <div className="ec-title-row2">
                        <span className="ec-clause">02</span>
                        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <h2 className="ec-sec-title">Organizer Administration &amp; Custody Charter</h2>
                          <span className="ec-indiv-badge" style={{ background: "#fffdf0", borderColor: "#ca8a04", color: "#854d0e" }}>
                            Ambagan Lead
                          </span>
                        </div>
                      </div>
                      <p className="ec-desc">
                        Administrative responsibilities, multi-sig vault coordination, and master agreement countersignature for{" "}
                        <strong>{activeParticipant.displayName}</strong>.
                      </p>
                    </div>

                    <div className="ec-indiv-grid">
                      <div className="ec-indiv-item">
                        <span className="label">Organizer Authority</span>
                        <span className="val">Ambagan Lead &amp; Multi-Sig Facilitator</span>
                      </div>
                      <div className="ec-indiv-item">
                        <span className="label">Pool Target Administered</span>
                        <span className="val">{GOAL} ({N} participant rounds)</span>
                      </div>
                      <div className="ec-indiv-item">
                        <span className="label">Organizer Fee / Cut</span>
                        <span className="val">0% (Zero deduction / Community savings)</span>
                      </div>
                      <div className="ec-indiv-item">
                        <span className="label">Multi-Sig Vault Key</span>
                        <span className="val" style={{ fontSize: 13, fontFamily: "monospace" }}>
                          {activeParticipant.publicKey.slice(0, 10)}...{activeParticipant.publicKey.slice(-6)}
                        </span>
                      </div>
                    </div>

                    <div className="ec-clause-block">
                      <h4>Organizer Custody Duty &amp; Settlement Safeguards</h4>
                      <p className="ec-desc">
                        As the Ambagan Lead, you certify that the participant roster, contribution amounts, payout schedule, and destination split rules are accurate. You agree to facilitate disbursements strictly through Paiflow multisig envelopes without commingling or unauthorized withdrawal.
                      </p>
                    </div>

                    <div className="ec-clause-block">
                      <h4>Emergency &amp; Default Recovery Authority</h4>
                      <p className="ec-desc">
                        If a participant defaults or delays a contribution beyond the agreed deadline, the Organizer is empowered by this agreement to trigger reserve coverage from the Safety Fund to ensure the scheduled recipient receives their payout on time.
                      </p>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fffdf5", border: "1px solid #fef08a", padding: "14px 18px", borderRadius: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#854d0e" }}>
                          Organizer Status: {signatures[activeParticipant.id] ? "Master Contract Countersigned" : "Countersignature Pending"}
                        </div>
                        <div style={{ fontSize: 12, color: "#778174" }}>
                          {signatures[activeParticipant.id]
                            ? `Countersigned on ${signatures[activeParticipant.id]?.displayDate}`
                            : "You must countersign this agreement as Organizer to permit pool activation once all participants sign."}
                        </div>
                      </div>
                      {!signatures[activeParticipant.id] && (
                        <button
                          type="button"
                          className="ec-btn primary ready"
                          onClick={() => openSignatureModal(activeParticipant.id)}
                        >
                          Countersign as Organizer
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ec-sec-head">
                      <div className="ec-title-row2">
                        <span className="ec-clause">02</span>
                        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <h2 className="ec-sec-title">Individual Participant Addendum</h2>
                          <span className="ec-indiv-badge">
                            <span style={{ color: "#34d399", fontSize: 10 }}>●</span>
                            <span>{activeParticipant.displayName}</span>
                            <span style={{ color: "#778174", fontWeight: 400 }}>· Slot #{activeParticipant.slot}</span>
                          </span>
                        </div>
                      </div>
                      <p className="ec-desc">
                        Legally binding terms, contribution commitments, and scheduled payout allocations tailored specifically for{" "}
                        <strong>{activeParticipant.displayName}</strong> ({activeParticipant.role}).
                      </p>
                    </div>

                    {/* 4-Column Balanced Key Metrics */}
                    <div className="ec-indiv-stats">
                      <div className="ec-stat-card">
                        <div className="ec-stat-head">
                          <span>Participant Role &amp; Slot</span>
                        </div>
                        <div className="ec-stat-val">Slot #{activeParticipant.slot}</div>
                        <div className="ec-stat-sub">{activeParticipant.role}</div>
                      </div>

                      <div className="ec-stat-card">
                        <div className="ec-stat-head">
                          <span>Contribution Obligation</span>
                        </div>
                        <div className="ec-stat-val">{equalContributionFormatted}</div>
                        <div className="ec-stat-sub">per round ({N} rounds total)</div>
                      </div>

                      <div className="ec-stat-card">
                        <div className="ec-stat-head">
                          <span>Allocated Payout Round</span>
                        </div>
                        <div className="ec-stat-val">Round {activeParticipant.slot}</div>
                        <div className="ec-stat-sub">{payoutDate(activeParticipant.slot)}</div>
                      </div>

                      <div className="ec-stat-card highlight">
                        <div className="ec-stat-head">
                          <span>Net Payout Entitlement</span>
                        </div>
                        <div className="ec-stat-val" style={{ color: "#2d6a3f" }}>{equalPayoutFormatted}</div>
                        <div className="ec-stat-sub">Guaranteed gross pool distribution</div>
                      </div>
                    </div>

                    {/* Round Split & Reserve Allocation Card */}
                    {activeParticipant.slot > 0 && activeRoundInfo && (
                      <div className="ec-split-card">
                        <div className="ec-split-head">
                          <div>
                            <h4>Smart Split &amp; Safety Reserve Rules</h4>
                            <div style={{ fontSize: 12, color: "#778174", marginTop: 2 }}>
                              Upon completion of Round {activeParticipant.slot}, your {equalPayoutFormatted} gross payout is partitioned automatically:
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 11, fontWeight: 600 }}>
                            <span style={{ color: "#2d6a3f" }}>● {(nowBps / 100).toFixed(0)}% Direct</span>
                            <span style={{ color: "#ca8a04" }}>● {(vaultBps / 100).toFixed(0)}% Vault</span>
                            <span style={{ color: "#b54880" }}>● {(fundBps / 100).toFixed(0)}% Safety</span>
                          </div>
                        </div>

                        {/* Visual Segmented Progress Bar */}
                        <div className="ec-split-bar" aria-hidden="true">
                          <div className="ec-split-seg now" style={{ width: `${nowBps / 100}%` }} title={`Direct Release: ${(nowBps / 100).toFixed(1)}%`} />
                          <div className="ec-split-seg vault" style={{ width: `${vaultBps / 100}%` }} title={`Multi-Sig Vault: ${(vaultBps / 100).toFixed(1)}%`} />
                          <div className="ec-split-seg fund" style={{ width: `${fundBps / 100}%` }} title={`Safety Fund: ${(fundBps / 100).toFixed(1)}%`} />
                        </div>

                        <div className="ec-split-grid">
                          <div className="ec-split-item now">
                            <span className="ec-split-tag">Immediate Direct Release ({(nowBps / 100).toFixed(1)}%)</span>
                            <span className="ec-split-amount">{formatMoney(nowAmount)}</span>
                            <span className="ec-split-desc">Distributed directly to your designated payout destinations</span>
                          </div>

                          <div className="ec-split-item vault">
                            <span className="ec-split-tag">Vault Multi-Sig Reserve ({(vaultBps / 100).toFixed(1)}%)</span>
                            <span className="ec-split-amount">{formatMoney(vaultAmount)}</span>
                            <span className="ec-split-desc">Held in non-custodial smart multisig escrow for default protection</span>
                          </div>

                          <div className="ec-split-item fund">
                            <span className="ec-split-tag">Emergency Safety Fund ({(fundBps / 100).toFixed(1)}%)</span>
                            <span className="ec-split-amount">{formatMoney(fundAmount)}</span>
                            <span className="ec-split-desc">Contributed to mutual pool buffer protecting cycle liquidity</span>
                          </div>
                        </div>

                        {/* Designated Stellar Public Key */}
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 12, color: "#6b7768", fontWeight: 500, marginBottom: 4 }}>
                            Designated Participant Stellar Address:
                          </div>
                          <div className="ec-addr-box">
                            <span className="ec-addr-text">
                              {activeParticipant.publicKey}
                            </span>
                            <button
                              type="button"
                              className="ec-addr-copy-btn"
                              onClick={() => copyStellarKey(activeParticipant.publicKey)}
                            >
                              {copiedKey ? "Copied" : "Copy Address"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pre-configured Disbursement Destinations */}
                    {activeDestinations.length > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1a2e1a" }}>
                            Pre-configured Disbursement Destinations
                          </h4>
                          <span style={{ fontSize: 12, color: "#778174" }}>
                            Applied to your direct release share ({formatMoney(nowAmount)})
                          </span>
                        </div>

                        <div className="ec-dest-grid">
                          {activeDestinations.map((dest, i) => {
                            const destAmount = (nowAmount * dest.percentBps) / 10000;
                            return (
                              <div key={i} className="ec-dest-card">
                                <div className="ec-dest-head">
                                  <span className="ec-dest-title">
                                    <span>{dest.label}</span>
                                  </span>
                                  <span className="ec-dest-amount">{formatMoney(destAmount)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#778174" }}>
                                  <span style={{ fontFamily: "monospace" }}>
                                    {dest.publicKey.slice(0, 10)}...{dest.publicKey.slice(-6)}
                                  </span>
                                  <span className="ec-dest-badge">
                                    {(dest.percentBps / 100).toFixed(1)}% of direct release
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Digital Certificate & Execution Banner */}
                    <div className="ec-cert-banner">
                      <div className="ec-cert-left">
                        <div className="ec-cert-shield" aria-hidden="true">
                          {isSignedByMe ? (
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path
                                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                                fill="rgba(255, 255, 255, 0.2)"
                              />
                              <polyline points="9 12 11 14 15 10" stroke="#ffffff" strokeWidth="2.5" />
                            </svg>
                          ) : (
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2.5" />
                              <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="ec-cert-title">
                            {isSignedByMe
                              ? "Individual Contract Executed & Authenticated"
                              : "E-Signature Required to Activate Your Slot"}
                          </div>
                          <div className="ec-cert-sub">
                            {isSignedByMe
                              ? `Cryptographically signed by ${signatures[activeParticipant.id]?.name} on ${signatures[activeParticipant.id]?.displayDate} · Compliant with Electronic Commerce Act (R.A. 8792)`
                              : "Affix your digital signature or upload an image from your device to confirm your participation."}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isSignedByMe ? (
                          <div className="ec-cert-seal">
                            Certified #{activeParticipant.id.toUpperCase()}-VERIFIED
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="ec-btn primary ready"
                            onClick={() => openSignatureModal(activeParticipant.id)}
                          >
                            Sign Your Contract
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* 03: How the ambagan is distributed */}
              <section
                className="ec-card"
                id="distribution"
                aria-label="How the ambagan is distributed"
              >
                <div className="ec-sec-head">
                  <div className="ec-title-row2">
                    <span className="ec-clause">03</span>
                    <h2 className="ec-sec-title">How the ambagan is distributed</h2>
                  </div>
                  <p className="ec-desc">
                    These rules describe how contributions are pooled and paid out so each
                    recipient receives an equal distribution across {N} rounds.
                  </p>
                </div>
                <div className="ec-clause-block">
                  <h4>3.1  One payout per round</h4>
                  <p className="ec-desc">
                    In each of the {word(N)} rounds, every participant contributes the agreed amount
                    and one recipient receives the net pool ({equalPayoutFormatted}). By the end of
                    the {N}-round cycle, each of the {N} recipients has been paid once, ensuring
                    funds are equally distributed.
                  </p>
                </div>
                <div className="ec-clause-block">
                  <h4>3.2  Payout order</h4>
                  <p className="ec-desc">
                    The payout order is recorded in the schedule below. Any subsequent changes require unanimous written consent from all participants.
                  </p>
                </div>
                <div className="ec-clause-block">
                  <h4>3.3  Safety reserve &amp; default protection</h4>
                  <p className="ec-desc">
                    In the event of a member shortfall, the designated safety fund covers the round to ensure the recipient receives their scheduled payout on time without interruption.
                  </p>
                </div>
              </section>

              {/* 04: Payout schedule */}
              <section
                className="ec-card"
                id="schedule"
                aria-label="Number of rounds, one payout each"
              >
                <div className="ec-sec-head">
                  <div className="ec-title-row2">
                    <span className="ec-clause">04</span>
                    <h2 className="ec-sec-title">
                      {word(N).replace(/^./, (c) => c.toUpperCase())} rounds. One payout each.
                    </h2>
                  </div>
                  <p className="ec-desc">
                    Each of the {N} recipients is assigned exactly one round, distributing the{" "}
                    {GOAL} pool equally at {roundPoolPayout} per recipient between <strong>{formattedStartDate}</strong> and <strong>{formattedCycleEndDate}</strong> ({cycleDaysLeft}).
                  </p>
                </div>

                {/* Cadence & Per-Member Payment Monitoring Banner */}
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>
                      ⚡ Payment Frequency:
                    </span>
                    <select
                      value={selectedFrequency}
                      onChange={(e) => handleFrequencyChange(e.target.value as FrequencyType)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid #16a34a",
                        background: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#166534",
                        cursor: "pointer",
                      }}
                      aria-label="Select payment frequency"
                    >
                      <option value="daily">Daily (Every 24 hours)</option>
                      <option value="weekly">Weekly (Every 7 days)</option>
                      <option value="bi-weekly">Bi-weekly (Every 14 days / 2 weeks)</option>
                      <option value="semi-monthly">Semi-monthly (15th &amp; 30th)</option>
                      <option value="monthly">Monthly (Every 30 days)</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: "12px" }}>
                    <div>
                      <span style={{ color: "#4b5563" }}>Each Member Pays: </span>
                      <strong style={{ color: "#166534", fontSize: "13px" }}>{memberContributionDue} / round</strong>
                    </div>
                    <div style={{ borderLeft: "1px solid #bbf7d0", paddingLeft: "14px" }}>
                      <span style={{ color: "#4b5563" }}>Round Payout: </span>
                      <strong style={{ color: "#0f172a", fontSize: "13px" }}>{roundPoolPayout} pool</strong>
                    </div>
                    <div style={{ borderLeft: "1px solid #bbf7d0", paddingLeft: "14px" }}>
                      <span style={{ color: "#4b5563" }}>Cycle: </span>
                      <strong style={{ color: "#0f172a", fontSize: "13px" }}>{formattedStartDate} → {formattedCycleEndDate}</strong>
                    </div>
                  </div>
                </div>

                <div className="ec-table" role="table" aria-label="Payout schedule">
                  <div className="ec-thead" role="row">
                    <span>Round</span>
                    <span>Assigned Member</span>
                    <span>Payment Date</span>
                    <span>Member Pays</span>
                    <span>Status</span>
                  </div>
                  {ROUNDS.map((n) => {
                    const memberSlot = 1 + ((n - 1) % memberCount);
                    const isCurrentMemberRound = activeParticipant.slot === memberSlot;
                    const isPaid = n <= settledCount;
                    const isNextToPay = n === settledCount + 1;
                    const memberObj = participantList[memberSlot];
                    const hasMemberSigned = memberObj ? !!signatures[memberObj.id] : false;
                    const assignedRecipientName =
                      recipientNames[(n - 1) % recipientNames.length] ??
                      UNIFIED_MEMBER_NAMES[(n - 1) % UNIFIED_MEMBER_NAMES.length];

                    return (
                      <div
                        className="ec-trow"
                        role="row"
                        key={n}
                        style={
                          isNextToPay
                            ? { background: "#fffbeb", borderLeft: "3px solid #f59e0b" }
                            : isCurrentMemberRound
                            ? { background: "#fafdf7", borderLeft: "3px solid #2d6a3f" }
                            : {}
                        }
                      >
                        <span className="ec-round">
                          {String(n).padStart(2, "0")}
                        </span>
                        <span className="ec-recip">
                          {assignedRecipientName}
                          {isCurrentMemberRound && <span style={{ fontSize: 11, color: "#2d6a3f", marginLeft: 6 }}>(You)</span>}
                        </span>
                        <span className="ec-cell-sm" style={{ fontWeight: 600, color: "#1e293b" }}>
                          {payoutDate(n)}
                        </span>
                        <span className="ec-cell-sm" style={{ fontWeight: 700, color: "#166534" }}>
                          {memberContributionDue}
                          <span style={{ display: "block", fontSize: "10.5px", fontWeight: 400, color: "#6b7280" }}>
                            pool: {roundPoolPayout}
                          </span>
                        </span>
                        <span>
                          {isPaid ? (
                            <span
                              className="ec-badge"
                              style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac", fontWeight: 700 }}
                            >
                              ✓ Paid ({memberContributionDue}) · Secured
                            </span>
                          ) : !isFullySigned ? (
                            <span
                              className="ec-badge"
                              style={{
                                background: hasMemberSigned ? "#f0fdf4" : "#fef2f2",
                                color: hasMemberSigned ? "#166534" : "#991b1b",
                                border: hasMemberSigned ? "1px solid #bbf7d0" : "1px solid #fecaca",
                                fontWeight: 600,
                              }}
                            >
                              {hasMemberSigned
                                ? `✓ Signed · Due ${payoutDate(n)} (${memberContributionDue})`
                                : `⏳ Awaiting Signatures · Due ${payoutDate(n)}`}
                            </span>
                          ) : isNextToPay ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span
                                className="ec-badge"
                                style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", fontWeight: 700 }}
                              >
                                📅 Assigned to Pay on {payoutDate(n)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenPayModal(n)}
                                style={{
                                   padding: "3px 10px",
                                   borderRadius: "6px",
                                   border: "1px solid #16a34a",
                                   background: "#16a34a",
                                   color: "#ffffff",
                                   fontSize: "11px",
                                   fontWeight: 700,
                                   cursor: "pointer",
                                   boxShadow: "0 1px 3px rgba(22, 163, 74, 0.25)",
                                   display: "inline-flex",
                                   alignItems: "center",
                                   gap: 4,
                                }}
                                title={`Settle payment for ${assignedRecipientName}`}
                              >
                                ⚡ Pay Now ({memberContributionDue})
                              </button>
                            </div>
                          ) : (
                            <span
                              className="ec-badge"
                              style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600 }}
                            >
                              📅 Scheduled on {payoutDate(n)} · {memberContributionDue}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 05: Paiflow & cryptocurrency terms */}
              <section
                className="ec-card"
                id="custody"
                aria-label="Paiflow and cryptocurrency acknowledgment"
              >
                <div className="ec-title-row2">
                  <span className="ec-clause">05</span>
                  <h2 className="ec-sec-title">Paiflow &amp; cryptocurrency terms</h2>
                </div>
                <div className="ec-intent">
                  <span aria-hidden="true">▭</span>
                  <div>
                    <div style={{ color: "#2d6a3f", fontSize: 15, fontWeight: 600 }}>
                      Paiflow · Non-custodial ledger &amp; settlement
                    </div>
                    <p className="ec-desc">
                      Contributions and disbursements are settled transparently on the Stellar network using Paiflow smart multisig envelopes.
                    </p>
                  </div>
                </div>
              </section>

              {/* 06: Acknowledgment checkboxes */}
              <section className="ec-card" id="acks" aria-label="Your acknowledgments">
                <div className="ec-sec-head">
                  <div className="ec-title-row2">
                    <span className="ec-clause">06</span>
                    <h2 className="ec-sec-title">Individual participant acknowledgments</h2>
                  </div>
                  <p className="ec-desc">
                    Each participant ticks every statement individually before signing. Ticking verifies understanding and unlocks electronic signature execution.
                  </p>
                </div>
                {ACKS.map((a, i) => (
                  <div
                    key={a.title}
                    className={`ec-ack${checked[i] ? " done" : ""}`}
                    role="checkbox"
                    aria-checked={checked[i]}
                    tabIndex={0}
                    onClick={() => toggle(i)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && toggle(i)
                    }
                  >
                    <span className="ec-check" aria-hidden="true">
                      {checked[i] ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : null}
                    </span>
                    <div style={{ flex: 1 }}>
                      <h4>{a.title}</h4>
                      <p className="ec-desc">{a.body}</p>
                    </div>
                    <span className={`ec-badge${checked[i] ? "" : " pink"}`}>
                      {checked[i] ? "Checked" : "Unchecked"}
                    </span>
                  </div>
                ))}
              </section>

              {/* 07: Signatures & participant confirmation */}
              <section
                className="ec-card"
                id="sign"
                aria-label="Signatures and participant confirmation"
              >
                <div className="ec-sec-head">
                  <div className="ec-title-row2">
                    <span className="ec-clause">07</span>
                    <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <h2 className="ec-sec-title">Signatures &amp; Participant Register</h2>
                      <span className={`ec-badge${isFullySigned ? "" : " pink"}`}>
                        {signedCount} of {totalSignatories} signatures recorded
                      </span>
                    </div>
                  </div>
                  <p className="ec-desc">
                    Pursuant to Republic Act No. 8792, electronic signatures affixed below have the same legal validity, effect, and enforceability as handwritten manual signatures.
                  </p>
                </div>

                <div className="ec-register" role="table" aria-label="Signatory register">
                  <div className="ec-reg-head">
                    <span>Signatory</span>
                    <span>E-signature</span>
                    <span>Date</span>
                    <span>Status</span>
                  </div>

                  {participantList.map((p) => {
                    const sig = signatures[p.id];
                    const isSigned = !!sig;
                    const isCurrent = p.id === activeParticipant.id;

                    return (
                      <div
                        className="ec-reg-row"
                        key={p.id}
                        style={isCurrent ? { background: "#fafdf7" } : {}}
                      >
                        <div>
                          <div className="ec-role">{p.role}</div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: "#1a2e1a" }}>
                            {sig?.name || p.displayName}
                            {isCurrent && <span style={{ fontSize: 11, color: "#2d6a3f", marginLeft: 6 }}>(Active)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#778174" }}>
                            {sig?.email || p.email}
                          </div>
                        </div>

                        <div>
                          {isSigned ? (
                            sig.type === "drawn" || sig.signatureData.startsWith("data:image/") ? (
                              <img
                                src={sig.signatureData}
                                alt={`Signature of ${sig.name}`}
                                className="ec-sig-img"
                              />
                            ) : (
                              <div className="ec-sig-typed">
                                {sig.signatureData}
                              </div>
                            )
                          ) : isCurrent ? (
                            <div>
                              <div style={{ fontSize: 13, color: "#b54880" }}>
                                {isOrganizer ? "Countersignature pending" : "E-signature pending"}
                              </div>
                              <button
                                type="button"
                                className="ec-row-sign-btn"
                                onClick={() => openSignatureModal(p.id)}
                              >
                                {isOrganizer ? "Countersign as Organizer" : `Sign as ${p.displayName}`}
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 13, color: "#778174" }}>
                                {p.slot === 0 ? "Awaiting Countersignature" : "Awaiting signature"}
                              </div>
                              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                <button
                                  type="button"
                                  className="ec-row-sign-btn"
                                  style={{ padding: "4px 10px", fontSize: 11 }}
                                  onClick={() => openSignatureModal(p.id)}
                                >
                                  Sign as {p.displayName}
                                </button>
                                {isOrganizer && (
                                  <button
                                    type="button"
                                    className="ec-reminder-btn"
                                    onClick={() => handleSendReminder(p.displayName, p.email)}
                                  >
                                    Reminder
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="ec-sign-line" style={{ marginTop: 6 }} />
                        </div>

                        <div>
                          <div style={{ fontSize: 13, color: isSigned ? "#1a2e1a" : "#778174", fontWeight: isSigned ? 500 : 400 }}>
                            {isSigned ? sig.displayDate : "DD / MM / YYYY"}
                          </div>
                          <div style={{ fontSize: 11, color: isSigned ? "#2d6a3f" : "#778174" }}>
                            {isSigned ? "Cryptographically signed" : "Not signed"}
                          </div>
                        </div>

                        <div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span className={`ec-badge${isSigned ? "" : " pink"}`}>
                              {isSigned ? (p.slot === 0 ? "Countersigned" : "✓ Signed") : "Unsigned"}
                            </span>
                            {p.slot > 0 && p.slot <= settledCount && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "#166534",
                                  background: "#dcfce7",
                                  border: "1px solid #86efac",
                                  padding: "2px 6px",
                                  borderRadius: "6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ✓ Paid {equalPayoutFormatted} · Secured
                              </span>
                            )}
                            {p.slot === settledCount + 1 && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "#92400e",
                                  background: "#fef3c7",
                                  border: "1px solid #fde68a",
                                  padding: "2px 6px",
                                  borderRadius: "6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isFullySigned
                                  ? `🕒 Assigned Next to Pay (${payoutDate(p.slot)})`
                                  : `🕒 Assigned to Pay · Sign Contract First`}
                              </span>
                            )}
                            {p.slot > settledCount + 1 && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 500,
                                  color: "#6b7280",
                                  background: "#f3f4f6",
                                  padding: "2px 6px",
                                  borderRadius: "6px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Scheduled
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="ec-divider" />

                <div className="ec-actions">
                  <div style={{ maxWidth: 480 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {contractActivated
                        ? "✓ Ambagan Contract Activated & Payment Schedule In Force"
                        : isFullySigned
                        ? "All Signatures Complete — Ready for Activation"
                        : `${signedCount} of ${totalSignatories} signatures recorded`}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: "19px", color: "#778174" }}>
                      {contractActivated
                        ? `The e-contract is now active. Members are NOT required to pay instantly upon signing—each assigned member pays ${equalPayoutFormatted} on their scheduled round date (${formattedStartDate} – ${formattedEndDate}).`
                        : isFullySigned
                        ? `Every participant has signed their e-contract. Activate the contract below to lock in the round dates and scheduled amounts (${equalPayoutFormatted} per round).`
                        : changesRequested
                        ? "Changes requested. The organizer will update the draft."
                        : isOrganizer
                        ? "Review participant progress and countersign the master contract to prepare for activation."
                        : "Each participant must sign their individual agreement before pool activation."}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className="ec-btn"
                      onClick={() => setChangesRequested(true)}
                    >
                      Request changes
                    </button>

                    <button
                      type="button"
                      className="ec-btn"
                      onClick={() => openSignatureModal(activeParticipant.id)}
                    >
                      {isOrganizer ? "Input e-sig (Organizer)" : "Input e-sig"}
                    </button>

                    {isFullySigned ? (
                      contractActivated ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <a
                            href="#schedule"
                            className="ec-btn"
                            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                          >
                            📅 View Round Schedule ({equalPayoutFormatted}/round)
                          </a>
                          <Link
                            href={`/dashboard?openPlan=${encodeURIComponent(groupId)}`}
                            className="ec-btn primary ready"
                            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                          >
                            ✓ Contract Activated · Open Group Dashboard →
                          </Link>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ec-btn primary ready"
                          onClick={() => {
                            setContractActivated(true);
                            setToastMessage(
                              `✓ E-Contract Activated! Round payment dates (${formattedStartDate} – ${formattedEndDate}) and amounts (${equalPayoutFormatted}/round) are now scheduled.`
                            );
                            setTimeout(() => setToastMessage(null), 4500);
                            document.getElementById("schedule")?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          ✓ Finalize &amp; Activate E-Contract
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className={`ec-btn primary ready`}
                        onClick={() => {
                          if (!allChecked) {
                            setChecked(ACKS.map(() => true));
                          }
                          openSignatureModal(activeParticipant.id);
                        }}
                      >
                        {isOrganizer ? "Countersign as Organizer" : `Review & Sign (${activeParticipant.displayName})`}
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Sidebar */}
            <aside className="ec-side" aria-label="Review companion">
              <div className="ec-card" aria-label="Agreement at a glance">
                <div className="ec-title-row2">
                  <span aria-hidden="true">▤</span>
                  <h2 className="ec-sec-title" style={{ fontSize: 16 }}>
                    Agreement at a glance
                  </h2>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#778174" }}>
                    {GROUP.toUpperCase()} · POOL TARGET
                  </div>
                  <div className="ec-target">{GOAL}</div>
                  <div style={{ fontSize: 12, color: "#778174" }}>
                    {N} planned recipients · {N} round{N === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="ec-divider" />
                <div className="ec-sum-row">
                  <span className="l">Agreement</span>
                  <span className="v">{VERSION}</span>
                </div>
                <div className="ec-sum-row">
                  <span className="l">Contract timeline</span>
                  <span className="v">{formattedStartDate} – {formattedEndDate}</span>
                </div>
                <div className="ec-sum-row" style={{ alignItems: "center" }}>
                  <span className="l">Time remaining</span>
                  <span className="ec-days-badge ec-badge-amber" title={`${daysLeftText} until deadline`}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" stroke="#D97706" strokeWidth="1.8" />
                      <path d="M8 5v3.5l2 1.5" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>{daysLeftText}</span>
                  </span>
                </div>
                {[
                  ["Distribution", `Equal split across ${N} rounds`],
                  ["Per-round payout", equalPayoutFormatted],
                  ["Central service", "Paiflow (Stellar testnet)"],
                ].map(([l, v]) => (
                  <div className="ec-sum-row" key={l}>
                    <span className="l">{l}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
                <div>
                  <div className="ec-sum-row">
                    <span style={{ fontWeight: 600 }}>Signatures collected</span>
                    <span style={{ color: "#2d6a3f", fontWeight: 700 }}>
                      {signedCount} / {totalSignatories}
                    </span>
                  </div>
                  <div className="ec-track" style={{ marginTop: 10 }}>
                    <div
                      style={{
                        width: `${(signedCount / totalSignatories) * 100}%`,
                        background: isFullySigned ? "#2d6a3f" : "#b54880",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "#778174", marginTop: 6 }}>
                    Organizer + {word(N)} recipient{N === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="ec-card" aria-label="In this agreement">
                <h2 className="ec-sec-title" style={{ fontSize: 16 }}>
                  In this agreement
                </h2>
                <div className="ec-toc">
                  {makeNav(N).map(([n, t, id]) => (
                    <a key={id} href={`#${id}`}>
                      <b>{n}</b>
                      <span>{t}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="ec-commit">
                <span aria-hidden="true">▦</span>
                <h3>Agree before you deposit.</h3>
                <p>
                  Confirm contributions, payout order, dates, fees, custody and destination
                  together. Keep a record of everyone’s approval.
                </p>
                <p className="fine">
                  An individual shared savings contract protected by Paiflow.
                </p>
              </div>

              <div
                style={{
                  padding: "0 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <span className={`ec-badge${allChecked ? "" : " pink"}`}>
                  {allChecked
                    ? "All acknowledgments checked"
                    : done === 0
                    ? "All acknowledgments unchecked"
                    : `${done} of ${ACKS.length} acknowledgments checked`}
                </span>
              </div>
            </aside>
          </div>

          <footer className="ec-foot">
            Ambagan · {GROUP} &nbsp;/&nbsp; {VERSION} &nbsp;·&nbsp; For participant review only
          </footer>
        </div>
      </div>

      {/* Interactive E-Signature Modal */}
      {isSignModalOpen && (
        <div className="ec-modal-overlay" onClick={() => setIsSignModalOpen(false)}>
          <div className="ec-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ec-modal-head">
              <div>
                <h3>Affix Electronic Signature</h3>
                <div style={{ fontSize: 12, color: "#778174", marginTop: 2 }}>
                  Signing for:{" "}
                  <strong>
                    {participantList.find((p) => p.id === modalSignatoryId)?.displayName}
                  </strong>{" "}
                  ({participantList.find((p) => p.id === modalSignatoryId)?.role})
                </div>
              </div>
              <button
                type="button"
                className="ec-modal-close"
                onClick={() => setIsSignModalOpen(false)}
                aria-label="Close signature modal"
              >
                &times;
              </button>
            </div>

            <div className="ec-modal-body">
              {/* Tab options: Draw or Upload */}
              <div className="ec-modal-tabs">
                <button
                  type="button"
                  className={`ec-tab-btn${signMode === "drawn" ? " active" : ""}`}
                  onClick={() => setSignMode("drawn")}
                >
                  Draw Signature
                </button>
                <button
                  type="button"
                  className={`ec-tab-btn${signMode === "uploaded" ? " active" : ""}`}
                  onClick={() => setSignMode("uploaded")}
                >
                  Upload from device
                </button>
              </div>

              {signMode === "drawn" ? (
                <div>
                  <div style={{ fontSize: 12, color: "#48574b", marginBottom: 6 }}>
                    Use your mouse, trackpad, or finger to sign inside the pad below:
                  </div>
                  <div className="ec-canvas-wrapper">
                    <canvas
                      ref={canvasRef}
                      className="ec-signature-canvas"
                      onMouseDown={handlePointerDown}
                      onMouseMove={handlePointerMove}
                      onMouseUp={handlePointerUp}
                      onMouseLeave={handlePointerUp}
                      onTouchStart={handlePointerDown}
                      onTouchMove={handlePointerMove}
                      onTouchEnd={handlePointerUp}
                    />
                    <button
                      type="button"
                      className="ec-canvas-clear"
                      onClick={clearCanvas}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: "#48574b", marginBottom: 6 }}>
                    Upload an image or scan of your signature:
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />
                  {!uploadedImageData ? (
                    <div
                      className="ec-upload-zone"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#2d6a3f", marginBottom: 4 }}>
                        Select File
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#2d6a3f" }}>
                        Click to browse or drop signature image here
                      </div>
                      <div style={{ fontSize: 12, color: "#778174" }}>
                        Supports PNG, JPG, JPEG, SVG, WebP
                      </div>
                    </div>
                  ) : (
                    <div className="ec-upload-preview-box">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#2d6a3f", fontWeight: 600 }}>
                          {uploadedFileName || "Signature attached"}
                        </span>
                        <button
                          type="button"
                          className="ec-upload-remove-btn"
                          onClick={() => {
                            setUploadedImageData(null);
                            setUploadedFileName("");
                          }}
                        >
                          Replace file
                        </button>
                      </div>
                      <div className="ec-upload-img-container">
                        <img
                          src={uploadedImageData}
                          alt="Uploaded signature"
                          style={{ maxHeight: 110, maxWidth: "100%", objectFit: "contain" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Consent checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 12,
                  color: "#48574b",
                  cursor: "pointer",
                  marginTop: 6,
                }}
              >
                <input
                  type="checkbox"
                  checked={agreedConsent}
                  onChange={(e) => setAgreedConsent(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I understand that this electronic signature has the same legal validity, effect, and enforceability as my handwritten manual signature under the Electronic Commerce Act of 2000 (R.A. No. 8792).
                </span>
              </label>
            </div>

            <div className="ec-modal-foot">
              <button
                type="button"
                className="ec-btn"
                onClick={() => setIsSignModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ec-btn primary ready"
                disabled={!agreedConsent}
                onClick={handleAdoptSignature}
              >
                Adopt &amp; Sign Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Payment Settlement Modal */}
      {isPayModalOpen && (
        <div
          className="ec-modal-overlay"
          onClick={() => !isProcessingPayment && setIsPayModalOpen(false)}
        >
          <div
            className="ec-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 540 }}
          >
            <div className="ec-modal-head">
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#1a2e1a" }}>
                  Settle Contribution Payment
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
                  Record contribution for Round {payingRound} of {N} on the ledger
                </p>
              </div>
              <button
                type="button"
                className="ec-modal-close"
                onClick={() => !isProcessingPayment && setIsPayModalOpen(false)}
                disabled={isProcessingPayment}
              >
                ✕
              </button>
            </div>

            <div className="ec-modal-body" style={{ gap: 14 }}>
              {/* Payment Summary Box */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#166534",
                      textTransform: "uppercase",
                    }}
                  >
                    {GROUP} · Round {payingRound}
                  </span>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#14532d",
                      marginTop: 2,
                    }}
                  >
                    Payer: {recipientNames[(payingRound - 1) % recipientNames.length] ?? `Member ${payingRound}`} (Slot {((payingRound - 1) % recipientNames.length) + 1})
                  </div>
                  <div style={{ fontSize: "12px", color: "#4b5563", marginTop: 2 }}>
                    Scheduled date: {payoutDate(payingRound)} · {selectedFrequency.toUpperCase()} cadence
                  </div>
                  <div style={{ fontSize: "11px", color: "#166534", marginTop: 2, fontWeight: 500 }}>
                    Round Pool Payout: {roundPoolPayout}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "11px", color: "#166534", fontWeight: 600 }}>
                    Member Contribution Due
                  </span>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#166534" }}>
                    {memberContributionDue}
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  Select Payment Method
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { id: "gcash", name: "GCash", sub: "Provider Handshake", icon: "G", color: "#0077c8" },
                    { id: "maya", name: "Maya", sub: "Provider Handshake", icon: "M", color: "#7b2d8b" },
                    { id: "bank", name: "Bank Transfer", sub: "BPI / BDO / Metrobank", icon: "🏛️", color: "#1e40af" },
                    { id: "cash", name: "Cash", sub: "In-Person Collector", icon: "💵", color: "#059669" },
                  ].map((m) => {
                    const isSelected = payMethod === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setPayMethod(m.id as any)}
                        style={{
                          border: isSelected ? "2px solid #16a34a" : "1px solid #e5e7eb",
                          background: isSelected ? "#f0fdf4" : "#ffffff",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          transition: "all 0.15s",
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "8px",
                            background: m.color,
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {m.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
                            {m.name}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#6b7280",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {m.sub}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Security info note */}
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  color: "#92400e",
                  lineHeight: "1.4",
                  display: "flex",
                  gap: 8,
                }}
              >
                <span>🔒</span>
                <span>
                  <strong>Blockchain Security:</strong> Ambagan logs this contribution timestamp and advances the payout round. Funds remain protected under multi-party contract rules.
                </span>
              </div>
            </div>

            <div className="ec-modal-foot" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Link
                href={`/pay?plan=${encodeURIComponent(groupId)}&view=method`}
                style={{ fontSize: "12px", color: "#166534", fontWeight: 600, textDecoration: "none" }}
              >
                Full Checkout Pathway →
              </Link>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="ec-btn"
                  onClick={() => setIsPayModalOpen(false)}
                  disabled={isProcessingPayment}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ec-btn primary ready"
                  onClick={() => handleExecutePayment(payingRound)}
                  disabled={isProcessingPayment}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#16a34a",
                    borderColor: "#16a34a",
                  }}
                >
                  {isProcessingPayment ? "Securing on Ledger..." : `⚡ Confirm & Pay (${memberContributionDue})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="ec-toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
