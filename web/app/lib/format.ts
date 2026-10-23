/** Format as USD with thousands separator. Returns "—" for null/NaN. */
export function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

/** Format as percentage with sign. "+12.34%" / "-5.60%" */
export function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Signed dollar amount. "+$42.00" / "-$8.50" */
export function signed(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(2);
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

/** Tailwind text color class based on sign. */
export function tone(n: number | null | undefined): string {
  if (n == null) return "";
  return n >= 0 ? "text-upink" : "text-downink";
}

/** Price display: 4 decimals under $1, else 2. */
export function price(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return n < 1 ? n.toFixed(4) : n.toFixed(2);
}

/** Human-readable relative time. "5s ago", "3m ago", "2h ago", "1d ago" */
export function timeAgo(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const diff = Math.max(0, (Date.now() - ts) / 1000);
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
