/**
 * Unified schedule and payment calculation helper for Ambagan.
 * Connects start date, deadline date, frequency (daily, weekly, bi-weekly, semi-monthly, monthly),
 * and rounds to determine exact payment dates, next round progression, and per-member contribution amounts.
 *
 * STRICT GUARANTEES:
 * - Payment of each member or receipt finishes EXACTLY on the specific deadline date.
 * - Payment NEVER exceeds the exact payment deadline date.
 */

export type FrequencyType = "daily" | "weekly" | "bi-weekly" | "semi-monthly" | "monthly" | "custom";

export interface ScheduleFrequencyOption {
  value: FrequencyType;
  label: string;
  cycleDays: number;
  description: string;
}

export const FREQUENCY_OPTIONS: ScheduleFrequencyOption[] = [
  { value: "daily", label: "Daily", cycleDays: 1, description: "Every 24 hours" },
  { value: "weekly", label: "Weekly", cycleDays: 7, description: "Every 7 days" },
  { value: "bi-weekly", label: "Bi-weekly", cycleDays: 14, description: "Every 14 days (2 weeks)" },
  { value: "semi-monthly", label: "Semi-monthly", cycleDays: 15, description: "15th & 30th of month" },
  { value: "monthly", label: "Monthly", cycleDays: 30, description: "Every 30 days (1 month)" },
];

export function normalizeFrequency(freq?: string): FrequencyType {
  if (!freq) return "weekly";
  const s = freq.toLowerCase().trim();
  if (s.includes("daily")) return "daily";
  if (s.includes("bi-weekly") || s.includes("biweekly") || s.includes("2 week") || s.includes("every 2")) return "bi-weekly";
  if (s.includes("semi-monthly") || s.includes("semi monthly") || s.includes("semimonthly") || s.includes("15th")) return "semi-monthly";
  if (s.includes("monthly")) return "monthly";
  if (s.includes("weekly")) return "weekly";
  return "weekly";
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatScheduleDate(d: Date): string {
  if (!d || isNaN(d.getTime())) return "To be agreed";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getUTCMonth()] ?? "Jan";
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateUtc(iso?: string): Date | null {
  if (!iso) return null;
  const clean = iso.split("T")[0] || "";
  const parts = clean.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Calculates the total number of rounds.
 * Takes into account:
 * 1. Explicit payments if specified in plan (plan.payments)
 * 2. Member count (guarantees every member has at least 1 round turn)
 * 3. Schedule duration between start and deadline for the frequency
 */
export function computeTotalRounds(
  startIso?: string,
  deadlineIso?: string,
  frequency?: string,
  memberCount = 2,
  explicitPayments?: number
): number {
  const minRequired = Math.max(1, memberCount);

  if (explicitPayments && explicitPayments > 0) {
    return Math.max(explicitPayments, minRequired);
  }

  const start = parseDateUtc(startIso);
  const deadline = parseDateUtc(deadlineIso);
  if (start && deadline && deadline.getTime() > start.getTime()) {
    const totalMs = deadline.getTime() - start.getTime();
    const totalDays = Math.round(totalMs / (24 * 60 * 60 * 1000));
    const freq = normalizeFrequency(frequency);
    const cycleDays = freq === "daily" ? 1 : freq === "bi-weekly" ? 14 : freq === "monthly" ? 30 : freq === "semi-monthly" ? 15 : 7;
    const fittingCycles = Math.max(1, Math.floor(totalDays / cycleDays));
    return Math.max(fittingCycles, minRequired);
  }

  return minRequired;
}

/**
 * Calculates the exact scheduled payment / payout date for round `roundIndex` (1-based, 1..N).
 * Strictly connects:
 * 1. Start Date
 * 2. Deadline Date
 * 3. Total Rounds (or member count)
 * 4. Payment Frequency
 *
 * GUARANTEES:
 * - The payment of each member or receipt finishes EXACTLY ON the specific deadline date.
 * - The payment NEVER exceeds the exact payment deadline date (all r <= totalRounds are <= deadline).
 */
export function getRoundDueDate(
  startIso?: string,
  deadlineIso?: string,
  frequency?: string,
  roundIndex = 1,
  totalRounds = 5
): Date {
  const start = parseDateUtc(startIso) || new Date(Date.UTC(2026, 10, 3));
  const deadline = parseDateUtc(deadlineIso);
  const r = Math.max(1, roundIndex);
  const N = Math.max(1, totalRounds);

  // If deadline is valid and after start date:
  if (deadline && deadline.getTime() > start.getTime()) {
    // 1. The final round of the cycle (r === N) MUST land EXACTLY on the deadline date
    if (r === N) {
      return new Date(deadline.getTime());
    }

    // 2. For intermediate rounds (r < N), connect start, deadline, and total rounds:
    if (r < N) {
      const totalMs = deadline.getTime() - start.getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = Math.round(totalMs / dayMs);

      // Proportional day allocation:
      // Round 1 is at round(1/N * totalDays), Round 2 at round(2/N * totalDays), etc.
      const roundDays = Math.round((r / N) * totalDays);
      let dueDate = new Date(start.getTime() + roundDays * dayMs);

      // Strict enforcement: MUST NOT exceed deadline date and must precede deadline
      if (dueDate.getTime() >= deadline.getTime()) {
        const backoffDays = Math.max(1, N - r);
        const adjusted = new Date(deadline.getTime() - backoffDays * dayMs);
        dueDate = adjusted.getTime() > start.getTime() ? adjusted : dueDate;
      }

      return dueDate;
    }

    // 3. If r > N (e.g. extending beyond the contract cycle into recurring cycles):
    const stepMs = (deadline.getTime() - start.getTime()) / N;
    return new Date(deadline.getTime() + (r - N) * stepMs);
  }

  // Fallback if no deadline is specified:
  const freq = normalizeFrequency(frequency);
  const stepDays = freq === "daily" ? 1 : freq === "bi-weekly" ? 14 : freq === "monthly" ? 30 : 7;
  return new Date(start.getTime() + r * stepDays * 24 * 60 * 60 * 1000);
}

/**
 * Generates all payment dates strictly fitting between start date and deadline date.
 */
export function generateScheduleDates(
  startIso?: string,
  deadlineIso?: string,
  frequency?: string,
  totalRounds = 5
): Date[] {
  const N = Math.max(1, totalRounds);
  const dates: Date[] = [];
  for (let r = 1; r <= N; r++) {
    dates.push(getRoundDueDate(startIso, deadlineIso, frequency, r, N));
  }
  return dates;
}

/**
 * Calculates the cycle completion date based on start date, frequency, and total rounds.
 * Strictly guarantees that cycle end date never exceeds the deadline.
 */
export function calculateCycleEndDate(
  startIso?: string,
  deadlineIso?: string,
  frequency?: string,
  totalRounds = 5
): Date {
  return getRoundDueDate(startIso, deadlineIso, frequency, totalRounds, totalRounds);
}

/**
 * Calculates the rotating recipient and payer information for any round number.
 */
export function getRoundRecipientInfo(
  memberNames: string[],
  roundNumber: number
): {
  name: string;
  slotIndex: number;
  slotLabel: string;
  cycleNumber: number;
  isCycleStart: boolean;
} {
  const count = Math.max(1, memberNames.length);
  const r = Math.max(1, roundNumber);
  const slotIndex = (r - 1) % count;
  const name = memberNames[slotIndex] ?? `Member ${slotIndex + 1}`;
  const slotLabel = `Slot ${slotIndex + 1}`;
  const cycleNumber = Math.floor((r - 1) / count) + 1;
  const isCycleStart = (r - 1) % count === 0;

  return {
    name,
    slotIndex,
    slotLabel,
    cycleNumber,
    isCycleStart,
  };
}

/**
 * Computes the per-member payment amount and per-round payout.
 * Gives exact transparency on:
 * - How much each member pays per round
 * - How much the recipient receives when their round is paid out
 */
export function getPaymentBreakdown(
  goalStr?: string,
  perPaymentStr?: string,
  totalMembers = 5,
  totalRounds = 5
): {
  memberPaymentNum: number;
  memberPaymentFormatted: string;
  roundPayoutNum: number;
  roundPayoutFormatted: string;
  totalGoalNum: number;
  totalGoalFormatted: string;
} {
  const N = Math.max(1, totalMembers);
  const R = Math.max(1, totalRounds);

  const cleanGoal = (goalStr || "").replace(/[^0-9.]/g, "");
  const goalNum = parseFloat(cleanGoal) || 0;

  const cleanPerPayment = (perPaymentStr || "").replace(/[^0-9.]/g, "");
  const perPaymentNum = parseFloat(cleanPerPayment) || 0;

  let memberPaymentNum = 0;
  let roundPayoutNum = 0;
  let totalGoalNum = goalNum;

  if (perPaymentNum > 0) {
    memberPaymentNum = perPaymentNum;
    roundPayoutNum = goalNum > 0 ? goalNum / R : perPaymentNum * N;
    totalGoalNum = goalNum > 0 ? goalNum : roundPayoutNum * R;
  } else if (goalNum > 0) {
    roundPayoutNum = goalNum / R;
    memberPaymentNum = roundPayoutNum;
    totalGoalNum = goalNum;
  } else {
    memberPaymentNum = 390.83;
    roundPayoutNum = 2344.98;
    totalGoalNum = 2344.98;
  }

  const peso = (n: number) =>
    `₱${n.toLocaleString("en-PH", {
      minimumFractionDigits: n % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;

  return {
    memberPaymentNum,
    memberPaymentFormatted: peso(memberPaymentNum),
    roundPayoutNum,
    roundPayoutFormatted: peso(roundPayoutNum),
    totalGoalNum,
    totalGoalFormatted: peso(totalGoalNum),
  };
}
