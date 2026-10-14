"use client";

import { isConnected } from "@stellar/freighter-api";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { fromStroops } from "@/lib/amount";
import { browserRequest, IntegrationError, retryDelay } from "@/lib/browser-api";
import type { Prepared } from "@/lib/paiflow";
import { connectWallet, refreshWallet, signPrepared } from "@/lib/wallet";
import "./dashboard.css";
import "./payment.css";

type MemberStatus = "paid" | "pending" | "due" | "late";
type Round = {
  index: number;
  receiverMemberId: string;
  splitBps: { now: number; vault: number; fund: number };
  deadline: string;
  members: Record<string, MemberStatus>;
};
type Group = {
  name: string;
  contributionStroops: string;
  mode: string;
  activeRound: number | null;
  members: { id: string; slot: number; displayName: string; publicKey: string | null }[];
  destinations: { slot: number; label: string; publicKey: string; percentBps: number }[];
  rounds: Round[];
};
type Contribution = {
  round: number;
  memberId?: string;
  amountStroops: string;
  txHash: string;
  status: string;
  ledger?: number;
  createdAt?: string;
  updatedAt?: string;
  error?: { code: string; message: string };
  explorerUrl?: string;
};
// A plan made with Create Paluwagan (saved in this browser by the dashboard).
type Plan = { id: string; purpose?: string; goal?: string; frequency?: string };

type Envelope = { address: string; round: number; txHash: string; signedXdr: string };
type View = "review" | "processing" | "success" | "pending" | "failed" | "receipt";
type Phase = "preparing" | "signing" | "submitting";
type Failure = { message: string; resend: boolean };

const POLL_MS = 7000;
const ENVELOPE_KEY = "tranche.pay.envelope";
const AVATAR_COLORS = ["#B54880", "#176B45", "#D97706"];
const OPEN = ["PENDING", "UNKNOWN"];
const CLOSED = ["FAILED", "REJECTED", "EXPIRED"];

const xlm = (stroops: string) => {
  const [whole, fraction = ""] = fromStroops(stroops).split(".");
  return `${whole}.${fraction.padEnd(2, "0")} XLM`;
};
const share = (stroops: string, bps: number) => ((BigInt(stroops) * BigInt(bps)) / 10_000n).toString();
const pct = (bps: number) => `${bps / 100}%`;
const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;
const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
const explorer = (c: Contribution) => c.explorerUrl ?? `https://stellar.expert/explorer/testnet/tx/${c.txHash}`;

// The signed envelope is kept until the payment settles, so a retry resends it instead of paying twice.
function loadEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(ENVELOPE_KEY);
    return raw ? (JSON.parse(raw) as Envelope) : null;
  } catch {
    return null;
  }
}
function saveEnvelope(envelope: Envelope | null) {
  try {
    if (envelope) localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
    else localStorage.removeItem(ENVELOPE_KEY);
  } catch {
    // The server also stores the envelope once it receives it.
  }
}

function errorText(error: unknown) {
  if (error instanceof IntegrationError) {
    const known: Record<string, string> = {
      PREPARATION_MODE: "Payments are switched off on the server right now.",
      FORBIDDEN: "This wallet isn't a member of the group. Connect a member wallet.",
      ROUND_NOT_ACTIVE: "This round isn't open for payments.",
      NOT_FOUND: "This payment wasn't prepared by Tranche. Start again from review.",
      RATE_LIMITED: "Too many attempts. Wait a few seconds and try again.",
    };
    return known[error.code] ?? error.message.split(" · ")[0] ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function Payment() {
  const [group, setGroup] = useState<Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [address, setAddress] = useState("");
  const [view, setView] = useState<View>("review");
  const [phase, setPhase] = useState<Phase>("preparing");
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [payouts, setPayouts] = useState<{ label: string; bps: number; amountStroops: string }[]>([]);
  const [checking, setChecking] = useState(false);
  const attempt = useRef(0);
  const envelope = useRef<Envelope | null>(null);

  const loadGroup = useCallback(async () => {
    try {
      setGroup(await browserRequest<Group>("/api/tranche/group"));
      setLoadError(null);
    } catch (error) {
      setLoadError(errorText(error));
    }
  }, []);

  // /pay?plan=<id> presents that plan; the payment itself still uses the live group.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("plan");
    if (!id) return;
    try {
      const plans = JSON.parse(localStorage.getItem("tranche_paluwagans") ?? "[]") as Plan[];
      setPlan(plans.find((p) => p.id === id) ?? null);
    } catch {
      // No saved plans in this browser: show the live group.
    }
  }, []);

  useEffect(() => {
    void loadGroup();
    refreshWallet().then((a) => a && setAddress(a), () => undefined);
  }, [loadGroup]);

  const groupName = plan?.purpose?.trim() || group?.name;
  const me = group?.members.find((m) => m.publicKey && m.publicKey === address) ?? null;
  const round =
    group?.rounds.find((r) => r.index === group.activeRound) ?? group?.rounds[group.rounds.length - 1] ?? null;
  const receiver = group?.members.find((m) => m.id === round?.receiverMemberId) ?? null;
  const receiverPurpose = group?.destinations.find((d) => d.slot === receiver?.slot && d.label !== "Wallet")?.label;
  const myStatus = me && round ? round.members[me.id] : undefined;
  const paymentsOn = group?.mode !== "prepare" && group?.mode !== "disabled";

  const loadReceipt = useCallback(async (match: (c: Contribution) => boolean) => {
    const ledger = await browserRequest<{
      contributions: (Contribution & { payouts: { label: string; bps: number; amountStroops: string }[] })[];
    }>("/api/tranche/ledger");
    const found = ledger.contributions.find(match);
    if (found) {
      setContribution(found);
      setPayouts(found.payouts);
    }
    return found;
  }, []);

  const settle = useCallback(
    (c: Contribution) => {
      setContribution(c);
      if (c.status === "SUCCESS") {
        envelope.current = null;
        saveEnvelope(null);
        setView("success");
        void loadGroup();
      } else if (CLOSED.includes(c.status)) {
        envelope.current = null;
        saveEnvelope(null);
        setFailure({
          message:
            c.status === "EXPIRED"
              ? "The payment expired before it was signed. Nothing was sent."
              : (c.error?.message ?? "The Stellar network rejected this transaction."),
          resend: false,
        });
        setView("failed");
      } else setView("pending");
    },
    [loadGroup],
  );

  const submit = useCallback(
    async (env: Envelope) => {
      setView("processing");
      setPhase("submitting");
      try {
        settle(await browserRequest<Contribution>("/api/tranche/pay", { round: env.round, signedXdr: env.signedXdr }));
      } catch (error) {
        const code = error instanceof IntegrationError ? error.code : "";
        if (code === "CONFLICT") {
          // Already submitted once: follow that payment rather than sending another.
          setContribution({ round: env.round, txHash: env.txHash, amountStroops: group?.contributionStroops ?? "0", status: "UNKNOWN" });
          setView("pending");
          return;
        }
        const refused = ["NOT_FOUND", "VALIDATION", "FORBIDDEN", "PREPARATION_MODE", "ROUND_NOT_ACTIVE"].includes(code);
        if (refused) {
          envelope.current = null;
          saveEnvelope(null);
        }
        setContribution({ round: env.round, txHash: env.txHash, amountStroops: group?.contributionStroops ?? "0", status: "UNKNOWN" });
        setFailure({ message: errorText(error), resend: !refused });
        setView("failed");
      }
    },
    [group?.contributionStroops, settle],
  );

  // On load, pick up where this member left off: a stored envelope, a pending payment, or a receipt.
  useEffect(() => {
    if (!group || !me || !round || attempt.current > 0) return;
    const stored = loadEnvelope();
    if (stored && stored.address === address && stored.round === round.index && myStatus !== "paid") {
      envelope.current = stored;
      setContribution({ round: stored.round, txHash: stored.txHash, amountStroops: group.contributionStroops, status: "UNKNOWN" });
      setView("pending");
    } else if (myStatus === "paid" || myStatus === "pending") {
      const status = myStatus;
      loadReceipt((c) => c.round === round.index && c.memberId === me.id && (status === "paid" ? c.status === "SUCCESS" : OPEN.includes(c.status)))
        .then((c) => c && setView(status === "paid" ? "receipt" : "pending"))
        .catch(() => undefined);
    }
  }, [group, me, round, address, myStatus, loadReceipt]);

  const checkStatus = useCallback(async () => {
    if (!contribution) return false;
    setChecking(true);
    try {
      const c = await browserRequest<Contribution>(
        `/api/tranche/pay/status?round=${contribution.round}&txHash=${contribution.txHash}`,
      );
      settle(c);
      return OPEN.includes(c.status);
    } catch (error) {
      // The server never received the envelope: resend the same one.
      if (error instanceof IntegrationError && error.code === "NOT_FOUND" && envelope.current) {
        void submit(envelope.current);
        return false;
      }
      throw error;
    } finally {
      setChecking(false);
    }
  }, [contribution, settle, submit]);

  useEffect(() => {
    if (view !== "pending" || !contribution) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = (delay: number) => {
      timer = setTimeout(async () => {
        try {
          if ((await checkStatus()) && !stopped) tick(POLL_MS);
        } catch (error) {
          if (!stopped) tick(Math.max(POLL_MS, retryDelay(error)));
        }
      }, delay);
    };
    tick(POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Restart only when the payment being watched changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, contribution?.txHash]);

  async function connect() {
    setNotice(null);
    try {
      if (!(await isConnected()).isConnected)
        throw new Error("Freighter isn't installed in this browser. Install the Freighter extension, switch it to Testnet, then try again.");
      setAddress(await connectWallet());
    } catch (error) {
      setNotice(errorText(error));
    }
  }

  async function pay() {
    if (!round || !address) return;
    const current = ++attempt.current;
    setNotice(null);
    setFailure(null);
    setView("processing");
    setPhase("preparing");
    try {
      const prepared = await browserRequest<Prepared & { amountStroops: string }>("/api/tranche/pay", {
        round: round.index,
        from: address,
      });
      if (current !== attempt.current) return;
      setPhase("signing");
      const signedXdr = await signPrepared(prepared, address);
      if (current !== attempt.current) return;
      const env = { address, round: round.index, txHash: prepared.txHash ?? "", signedXdr };
      envelope.current = env;
      saveEnvelope(env);
      await submit(env);
    } catch (error) {
      if (current !== attempt.current) return;
      if (error instanceof IntegrationError && error.code === "CONFLICT") {
        void loadGroup();
        setNotice("You already have a payment for this round. We're checking its status.");
        setView("review");
        return;
      }
      setContribution(null);
      setFailure({ message: errorText(error), resend: false });
      setView("failed");
    }
  }

  function cancel() {
    attempt.current++;
    setView("review");
  }

  function retry() {
    if (failure?.resend && envelope.current) void submit(envelope.current);
    else void pay();
  }

  async function openReceipt() {
    if (contribution) await loadReceipt((c) => c.txHash === contribution.txHash).catch(() => undefined);
    setView("receipt");
  }

  function downloadReceipt() {
    if (!contribution || !group || !round) return;
    const lines = [
      "TRANCHE — PAYMENT RECEIPT",
      "",
      `Group:            ${groupName}`,
      `Member:           ${me?.displayName ?? address}`,
      `Round:            ${contribution.round}`,
      `Receiver:         ${receiver?.displayName ?? "—"}`,
      `Amount:           ${xlm(contribution.amountStroops)}`,
      `Status:           ${contribution.status}`,
      `Date:             ${when(contribution.updatedAt ?? contribution.createdAt)}`,
      `Ledger:           ${contribution.ledger ?? "—"}`,
      `Transaction hash: ${contribution.txHash}`,
      `Verify:           ${explorer(contribution)}`,
      ...(payouts.length ? ["", "Split", ...payouts.map((p) => `  ${p.label.padEnd(8)} ${pct(p.bps).padStart(4)}  ${xlm(p.amountStroops)}`)] : []),
      "",
      "Stellar testnet. Signed in Freighter; Tranche never holds your keys.",
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tranche-receipt-round-${contribution.round}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const amount = group?.contributionStroops ?? "0";
  const paidCount = round ? Object.values(round.members).filter((s) => s === "paid").length : 0;
  const deadlinePassed = round ? Date.parse(round.deadline) < Date.now() : false;
  const daysLeft = round ? Math.ceil((Date.parse(round.deadline) - Date.now()) / 86_400_000) : 0;

  return (
    <div className="db pay">
      <header className="db-header">
        <Link href="/" className="db-brand">
          <div className="db-logo-group">
            <svg width="46" height="45" viewBox="0 0 82 82" aria-hidden="true" style={{ overflow: "visible" }}>
              <defs>
                <filter id="pay-glow" x="0" y="0" width="82" height="82" filterUnits="userSpaceOnUse">
                  <feGaussianBlur stdDeviation="10.38" />
                </filter>
              </defs>
              <g filter="url(#pay-glow)">
                <ellipse cx="40.77" cy="40.77" rx="24.5" ry="24.5" fill="#B54880" />
              </g>
              <image href="/images/logo.svg" x="13" y="14" width="55.69" height="54.16" preserveAspectRatio="none" />
            </svg>
          </div>
          <span className="db-brand-name">Tranche</span>
        </Link>
      </header>

      <nav className="db-sidebar" aria-label="Navigation Sidebar">
        <Link href="/dashboard" className="db-sidebar-btn db-btn-home" aria-label="Home">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z" fill="#A8D070" />
          </svg>
        </Link>
        <Link href="/pay" className="db-sidebar-btn db-btn-wallet pay-nav-active" aria-label="Payments" aria-current="page">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="5" width="20" height="14" rx="3" stroke="#B54880" strokeWidth="2" />
            <path d="M2 10h20" stroke="#B54880" strokeWidth="1.5" />
            <circle cx="16" cy="14" r="1.5" fill="#B54880" />
          </svg>
        </Link>
        <Link href="/dashboard" className="db-sidebar-btn db-btn-plus" aria-label="Create">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 6v12M6 12h12" stroke="#A8D070" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </Link>
        <button type="button" className="db-sidebar-btn db-btn-user" aria-label={address ? `Wallet ${short(address)}` : "Connect wallet"} onClick={connect}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="#A8D070" strokeWidth="2" />
            <path d="M4 20c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" stroke="#A8D070" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      <main className={`pay-main ${view === "receipt" ? "pay-main-receipt" : ""}`}>
        <section className="pay-overview" aria-label="Group overview">
          <div className="pay-accent" />
          <Link href="/dashboard" className="pay-back">
            <Icon name="arrowLeft" size={16} /> Dashboard
          </Link>

          <div className="pay-group-heading">
            <span className="pay-overline">PALUWAGAN GROUP</span>
            <h1 className="pay-group-name">{groupName ?? "Loading…"}</h1>
            {round && (
              <div className="pay-badges">
                <span className="pay-badge">
                  Round {round.index} of {group!.rounds.length}
                </span>
                <span className="pay-badge pay-badge-amber">
                  {deadlinePassed ? "Deadline passed" : daysLeft <= 1 ? "Due today" : `Due in ${daysLeft} days`}
                </span>
              </div>
            )}
            {plan && planGoal(plan) && <p className="pay-plan-note">{planGoal(plan)}</p>}
          </div>

          <div className="pay-divider" style={{ top: 158 }} />

          <div className="pay-contribution-card">
            <div className="pay-deco pay-deco-lg" />
            <div className="pay-deco pay-deco-sm" />
            <div className="pay-amount-summary">
              <span className="pay-card-label">Your share</span>
              <span className="pay-card-amount">{xlm(amount)}</span>
              <div className="pay-due">
                <Icon name="calendar" size={12} />
                <span>{round ? `Due ${when(round.deadline).replace(/, \d{4}/, "")}` : "No open round"}</span>
                {myStatus && <span className={`pay-badge pay-badge-${myStatus}`}>{statusLabel[myStatus]}</span>}
              </div>
            </div>
          </div>

          {group && round && (
            <div className="pay-progress">
              <div className="pay-progress-heading">
                <span className="pay-section-label">Round progress</span>
                <span className="pay-progress-current">
                  Round {round.index} of {group.rounds.length}
                  {receiverPurpose ? ` · ${receiverPurpose}` : ""}
                </span>
              </div>
              <div className="pay-track">
                <div className="pay-track-fill" style={{ width: `${(round.index / group.rounds.length) * 100}%` }} />
              </div>
              <div className="pay-markers">
                {group.rounds.map((r) => (
                  <span key={r.index} className={`pay-marker ${r.index <= round.index ? "pay-marker-done" : ""}`}>
                    <i /> R{r.index}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pay-divider" style={{ top: 416 }} />

          {group && (
            <div className="pay-members">
              <span className="pay-section-label">Group members</span>
              <div className="pay-member-summary">
                <div className="pay-avatars">
                  {group.members.slice(0, 3).map((m, i) => (
                    <span key={m.id} className="pay-avatar" style={{ background: AVATAR_COLORS[i] }} title={m.displayName}>
                      {m.displayName.replace(/\D/g, "") || m.displayName[0]}
                    </span>
                  ))}
                  {group.members.length > 3 && <span className="pay-avatar pay-avatar-more">+{group.members.length - 3}</span>}
                </div>
                <span className="pay-member-count">
                  {group.members.length} members · {paidCount} paid this round
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="pay-btn pay-btn-primary pay-contribute"
            onClick={() => (myStatus === "paid" ? void openReceipt() : setView("review"))}
            disabled={!group || view === "processing"}
          >
            <Icon name={myStatus === "paid" ? "receipt" : "wallet"} size={16} />
            {myStatus === "paid" ? "View my receipt" : "Pay contribution"}
          </button>
          <p className="pay-footnote">Signed in Freighter · settles on Stellar testnet</p>
        </section>

        <div className="pay-panel-divider" />

        <div className="pay-modal" role="dialog" aria-modal="false" aria-labelledby="pay-title">
          <div className="pay-modal-accent" />
          <header className="pay-modal-header">
            <div className="pay-heading">
              <h2 id="pay-title">{titles[view]}</h2>
              <p>{descriptions[view]}</p>
            </div>
            <Link href="/dashboard" className="pay-close" aria-label="Close">
              <Icon name="x" size={14} />
            </Link>
          </header>
          <div className="pay-header-divider" />

          <div className="pay-content">
            {loadError && <Guidance tone="red" icon="triangleAlert" title="Couldn't load your group" body={loadError} />}

            {view === "review" && group && round && (
              <>
                <ContributionSummary name={groupName ?? group.name} round={round} amount={amount} receiverName={receiver?.displayName} />
                <div className="pay-method">
                  <div className="pay-method-info">
                    <span>Payment method</span>
                    <strong>Freighter wallet</strong>
                  </div>
                  <span className={`pay-badge ${address ? "" : "pay-badge-amber"}`}>
                    {address ? `${short(address)} connected` : "Wallet not connected"}
                  </span>
                </div>
                <Details>
                  <Row label="Round" value={`Round ${round.index} · due ${when(round.deadline)}`} />
                  <Row label="Receiver this round" value={`${receiver?.displayName ?? "—"}${receiverPurpose ? ` · ${receiverPurpose}` : ""}`} />
                  <hr />
                  <Row label={`Paid out now (${pct(round.splitBps.now)})`} value={xlm(share(amount, round.splitBps.now))} />
                  <Row
                    label={`Vault + Safety Fund (${pct(round.splitBps.vault + round.splitBps.fund)})`}
                    value={xlm(share(amount, round.splitBps.vault + round.splitBps.fund))}
                  />
                  <p className="pay-note">
                    The Vault share is released back to the receiver as the group keeps paying. The Safety Fund covers missed payments.
                  </p>
                  <Row label="Total" value={xlm(amount)} strong />
                </Details>
                {notice || !paymentsOn || (address && !me) ? (
                  <Guidance
                    tone="amber"
                    icon="triangleAlert"
                    title={!paymentsOn ? "Payments are off" : address && !me ? "Not a member wallet" : "Heads up"}
                    body={
                      notice ??
                      (!paymentsOn
                        ? "The server is in prepare mode, so no payment can be sent right now."
                        : "The connected Freighter account isn't in this group. Switch to your member account in Freighter.")
                    }
                  />
                ) : (
                  <Guidance
                    icon="info"
                    title="You'll confirm this in Freighter"
                    body="Tranche prepares the transaction and Freighter asks you to sign it. Your secret key never leaves your wallet, and you have about 3 minutes to sign."
                  />
                )}
              </>
            )}

            {view === "processing" && group && round && (
              <>
                <ContributionSummary name={groupName ?? group.name} round={round} amount={amount} receiverName={receiver?.displayName} />
                <div className="pay-processing">
                  <div className="pay-spinner">
                    <span className="pay-spinner-track" />
                    <span className="pay-spinner-arc" />
                    <Icon name="externalLink" size={22} />
                  </div>
                  <h3 className="pay-status-title">{phaseText[phase].title}</h3>
                  <p className="pay-status-lead">{phaseText[phase].lead}</p>
                  <span className="pay-badge">{phaseText[phase].badge}</span>
                  <p className="pay-status-desc">{phaseText[phase].desc}</p>
                </div>
                <Guidance
                  icon="info"
                  title="Keep this page open"
                  body="If the connection drops, Tranche resends the same signed transaction. You won't be charged twice."
                />
              </>
            )}

            {view === "success" && contribution && (
              <>
                <StatusHead tone="green" icon="circleCheck" title="Contribution received" lead={`Your Round ${contribution.round} payment is confirmed on Stellar.`} />
                <div className="pay-center">
                  <span className="pay-badge">Confirmed on Stellar</span>
                </div>
                <Details>
                  <Row label="Amount" value={xlm(contribution.amountStroops)} strong />
                  <Row label="Round" value={`Round ${contribution.round}`} />
                  <Row label="Receiver" value={receiver?.displayName ?? "—"} />
                  <Row label="Ledger" value={String(contribution.ledger ?? "—")} />
                  <Row label="Transaction" value={<TxLink c={contribution} />} />
                </Details>
                <Guidance
                  icon="info"
                  title="What happens next"
                  body={round ? `${pct(round.splitBps.now)} goes to ${receiver?.displayName ?? "the receiver"} now. ${pct(round.splitBps.vault)} is held in the group Vault and ${pct(round.splitBps.fund)} goes to the Safety Fund.` : "Your payment has been split by the group's rules."}
                />
              </>
            )}

            {view === "pending" && contribution && (
              <>
                <StatusHead title="Payment pending confirmation" lead="Your payment was sent. We're waiting for Stellar to confirm it." />
                <div className="pay-center">
                  <span className="pay-badge pay-badge-amber">Waiting for the network</span>
                </div>
                <Details>
                  <Row label="Amount" value={xlm(contribution.amountStroops)} strong />
                  <Row label="Round" value={`Round ${contribution.round}`} />
                  <Row label="Status" value={contribution.status === "UNKNOWN" ? "Checking…" : "Pending"} />
                  <Row label="Submitted" value={when(contribution.updatedAt ?? contribution.createdAt ?? new Date().toISOString())} />
                  <Row label="Transaction" value={<TxLink c={contribution} />} />
                </Details>
                <Guidance
                  tone="amber"
                  icon="fileCheck"
                  title="Don't pay again"
                  body="Your signed payment is saved. We check its status every few seconds and resend the same transaction if needed, so it can never be paid twice. This page updates by itself."
                />
              </>
            )}

            {view === "failed" && (
              <>
                <StatusHead tone="red" icon="circleX" title="Payment could not be completed" lead={failure?.message ?? "Something went wrong."} />
                <div className="pay-center">
                  <span className="pay-badge pay-badge-red">
                    {failure?.resend ? "Not confirmed yet" : "Contribution not recorded"}
                  </span>
                </div>
                <Details>
                  <Row label="Amount" value={xlm(contribution?.amountStroops ?? amount)} />
                  <Row label="Round" value={round ? `Round ${round.index}` : "—"} />
                  <Row label="Wallet" value={address ? short(address) : "—"} />
                  <Row label="Transaction" value={contribution?.txHash ? <TxLink c={contribution} /> : "Not sent"} />
                  <Row label="Time" value={when(new Date().toISOString())} />
                </Details>
                <Guidance
                  tone="red"
                  icon="triangleAlert"
                  title="Before you try again"
                  body={
                    failure?.resend
                      ? "We couldn't confirm the submission. Try again resends the exact same signed transaction, so you can't be charged twice."
                      : "Check that Freighter is on Testnet, the right account is selected, and it has enough XLM for the payment and fees. Then try again."
                  }
                />
              </>
            )}

            {view === "receipt" && contribution && group && (
              <>
                <div className="pay-receipt-heading">
                  <div>
                    <span className="pay-receipt-label">AMOUNT CONTRIBUTED</span>
                    <strong className="pay-receipt-total">{xlm(contribution.amountStroops)}</strong>
                  </div>
                  <span className="pay-badge">{contribution.status === "SUCCESS" ? "Paid · Confirmed" : contribution.status}</span>
                </div>
                <Details>
                  <Row label="Group" value={groupName ?? group.name} />
                  <Row label="Member" value={me?.displayName ?? short(contribution.memberId ?? address)} />
                  <Row label="Round" value={`Round ${contribution.round}`} />
                  <Row label="Date" value={when(contribution.updatedAt ?? contribution.createdAt)} />
                  <Row label="Ledger" value={String(contribution.ledger ?? "—")} />
                  <Row label="Transaction" value={<TxLink c={contribution} />} />
                  <hr />
                  {payouts.length > 0 ? (
                    payouts.map((p) => <Row key={p.label} label={`${p.label} (${pct(p.bps)})`} value={xlm(p.amountStroops)} />)
                  ) : (
                    <ReceiptSplit round={group.rounds.find((r) => r.index === contribution.round)} amount={contribution.amountStroops} />
                  )}
                  <Row label="Total" value={xlm(contribution.amountStroops)} strong />
                </Details>
                <Guidance
                  icon="info"
                  title="Verified on Stellar testnet"
                  body="Anyone can check this payment on Stellar Expert with the transaction link above. Tranche never held your funds or your keys."
                />
              </>
            )}
          </div>

          <footer className="pay-modal-footer">
            {view === "review" && (
              <div className="pay-actions">
                <Link href="/dashboard" className="pay-btn pay-btn-secondary">Back</Link>
                {!address ? (
                  <button type="button" className="pay-btn pay-btn-primary" onClick={connect}>
                    <Icon name="wallet" size={16} /> Connect Freighter
                  </button>
                ) : myStatus === "paid" ? (
                  <button type="button" className="pay-btn pay-btn-primary" onClick={() => void openReceipt()}>
                    <Icon name="receipt" size={16} /> View receipt
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pay-btn pay-btn-primary"
                    onClick={() => void pay()}
                    disabled={!me || !paymentsOn || group?.activeRound !== round?.index}
                  >
                    <Icon name="shieldCheck" size={16} /> Confirm &amp; sign
                  </button>
                )}
              </div>
            )}
            {view === "processing" && (
              <button type="button" className="pay-btn pay-btn-secondary pay-btn-full" onClick={cancel} disabled={phase === "submitting"}>
                {phase === "submitting" ? "Submitting, please wait…" : "Cancel and go back"}
              </button>
            )}
            {view === "success" && (
              <div className="pay-actions">
                <Link href="/dashboard" className="pay-btn pay-btn-secondary">Done</Link>
                <button type="button" className="pay-btn pay-btn-primary" onClick={() => void openReceipt()}>
                  <Icon name="receipt" size={16} /> View receipt
                </button>
              </div>
            )}
            {view === "pending" && (
              <div className="pay-actions">
                <Link href="/dashboard" className="pay-btn pay-btn-secondary">Close</Link>
                <button type="button" className="pay-btn pay-btn-primary" onClick={() => void checkStatus().catch(() => undefined)} disabled={checking}>
                  <Icon name="fileSearch" size={16} /> {checking ? "Checking…" : "Check status"}
                </button>
              </div>
            )}
            {view === "failed" && (
              <div className="pay-actions">
                <button type="button" className="pay-btn pay-btn-secondary" onClick={() => setView("review")}>
                  Back to review
                </button>
                <button type="button" className="pay-btn pay-btn-primary" onClick={retry}>
                  <Icon name="rotateCcw" size={16} /> Try again
                </button>
              </div>
            )}
            {view === "receipt" && (
              <div className="pay-actions">
                <Link href="/dashboard" className="pay-btn pay-btn-secondary">Done</Link>
                <button type="button" className="pay-btn pay-btn-primary" onClick={downloadReceipt}>
                  <Icon name="download" size={16} /> Download receipt
                </button>
              </div>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}

// "Goal ₱1,500,000 · Weekly" for a plan, from its saved goal text.
function planGoal(plan: Plan) {
  const [whole, cents] = (plan.goal ?? "").split(".");
  const goal = whole && /^\d+$/.test(whole) ? `Goal ₱${BigInt(whole).toLocaleString("en-US")}${cents ? `.${cents}` : ""}` : "";
  return [goal, plan.frequency].filter(Boolean).join(" · ");
}

const statusLabel: Record<MemberStatus, string> = { paid: "Paid", pending: "Pending", due: "Due", late: "Late" };

const titles: Record<View, string> = {
  review: "Review payment",
  processing: "Processing payment",
  success: "Payment successful",
  pending: "Payment pending confirmation",
  failed: "Payment could not be completed",
  receipt: "Payment receipt",
};
const descriptions: Record<View, string> = {
  review: "Check the details below, then sign the contribution in Freighter.",
  processing: "Don't close this window while your payment is being sent.",
  success: "Your contribution has been received by the group.",
  pending: "Your payment was sent and is waiting for confirmation.",
  failed: "Your contribution wasn't recorded. Review the details and try again.",
  receipt: "A record of your contribution, verifiable on Stellar.",
};
const phaseText: Record<Phase, { title: string; lead: string; badge: string; desc: string }> = {
  preparing: {
    title: "Preparing your payment",
    lead: "Tranche is building your contribution transaction.",
    badge: "Preparing transaction",
    desc: "This takes a few seconds. Freighter will open when it's ready.",
  },
  signing: {
    title: "Approve in Freighter",
    lead: "Check the amount in the Freighter pop-up and sign it.",
    badge: "Waiting for Freighter signature",
    desc: "Can't see the pop-up? Click the Freighter icon in your browser toolbar. You have about 3 minutes to sign.",
  },
  submitting: {
    title: "Sending to Stellar",
    lead: "Your signed payment is on its way to the network.",
    badge: "Submitting to Stellar testnet",
    desc: "This usually takes under 10 seconds.",
  },
};

function ContributionSummary({ name, round, amount, receiverName }: { name: string; round: Round; amount: string; receiverName?: string }) {
  return (
    <div className="pay-summary">
      <span className="pay-group-symbol">
        <Icon name="users" size={18} />
      </span>
      <div className="pay-summary-details">
        <strong>{name}</strong>
        <span>
          Round {round.index} · to {receiverName ?? "receiver"} · due {when(round.deadline).replace(/, \d{4}/, "")}
        </span>
      </div>
      <div className="pay-summary-amount">
        <span>Contribution</span>
        <strong>{xlm(amount)}</strong>
      </div>
    </div>
  );
}

function ReceiptSplit({ round, amount }: { round?: Round; amount: string }) {
  if (!round) return null;
  return (
    <>
      <Row label={`Paid out now (${pct(round.splitBps.now)})`} value={xlm(share(amount, round.splitBps.now))} />
      <Row label={`Vault + Safety Fund (${pct(round.splitBps.vault + round.splitBps.fund)})`} value={xlm(share(amount, round.splitBps.vault + round.splitBps.fund))} />
    </>
  );
}

function StatusHead({ tone, icon, title, lead }: { tone?: "green" | "red"; icon?: IconName; title: string; lead: string }) {
  return (
    <div className="pay-status">
      {tone && icon && (
        <span className={`pay-status-symbol pay-status-${tone}`}>
          <Icon name={icon} size={32} />
        </span>
      )}
      <h3 className="pay-status-title">{title}</h3>
      <p className="pay-status-lead">{lead}</p>
    </div>
  );
}

function Details({ children }: { children: ReactNode }) {
  return <div className="pay-details">{children}</div>;
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`pay-row ${strong ? "pay-row-strong" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TxLink({ c }: { c: Contribution }) {
  return (
    <a href={explorer(c)} target="_blank" rel="noreferrer" className="pay-tx">
      {c.txHash.slice(0, 10)}…{c.txHash.slice(-6)} ↗
    </a>
  );
}

function Guidance({ tone = "green", icon, title, body }: { tone?: "green" | "amber" | "red"; icon: IconName; title: string; body: string }) {
  return (
    <div className={`pay-guidance pay-guidance-${tone}`} role={tone === "green" ? undefined : "alert"}>
      <Icon name={icon} size={16} />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

const icons = {
  x: <path d="M18 6 6 18M6 6l12 12" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  circleX: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  circleCheck: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  triangleAlert: <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4M12 17h.01" />,
  fileCheck: <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M9 15l2 2 4-4" />,
  fileSearch: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M13.3 16.3 15 18" /><circle cx="11.5" cy="14.5" r="2.5" /></>,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  rotateCcw: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />,
  receipt: <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11" />,
  externalLink: <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  arrowLeft: <path d="m12 19-7-7 7-7M19 12H5" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  shieldCheck: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></>,
  wallet: <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />,
};
type IconName = keyof typeof icons;

function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pay-icon">
      {icons[name]}
    </svg>
  );
}
