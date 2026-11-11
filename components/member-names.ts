/** Turns a recipient email into a display name (shared by contract, payment and group views). */
export function memberNameFromEmail(email: string, index = 0): string {
  const em = email.toLowerCase();
  if (em.includes("jullianna") || em.includes("villaluna12")) return "Villaluna J.";
  if (em.includes("jomari")) return "Villaluna Jomari";
  if (em.includes("keith")) return "Speirs Keith";
  if (em.includes("matt")) return "Mondares Matt";
  if (em.includes("rivera")) return "Rivera M.";
  if (em.includes("aniog")) return "Aniog D.";
  const prefix = email.split("@")[0] || `Member ${index + 1}`;
  const cleaned = prefix.replace(/[._\d]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned || `Member ${index + 1}`;
}

/** First money-looking number in a string, e.g. "₱357.15 (last ₱357.05)" -> 357.15. */
export function firstAmount(text?: string): number {
  const m = /\d[\d,]*(?:\.\d+)?/.exec(text ?? "");
  return m ? parseFloat(m[0].replace(/,/g, "")) : NaN;
}
