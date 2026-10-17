/** The ERP reports all times in India Standard Time without an offset. */
export const TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "2026-10-16 23:55:00.0" (IST) -> Date */
export function parseErpDateTime(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = "00"] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}${IST_OFFSET}`);
  return isNaN(date.getTime()) ? null : date;
}

/** "10 Oct, 2026 (11:55 PM)" (IST) -> Date */
export function parseQuizDateTime(s: string): Date | null {
  const m = s.trim().match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})\s*\(\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*\)/i);
  if (!m) return null;
  const [, d, mon, y, hh, mm, ap] = m;
  const mo = MONTHS[mon.toLowerCase()];
  if (!mo) return null;
  let h = parseInt(hh, 10) % 12;
  if (ap.toUpperCase() === "PM") h += 12;
  const date = new Date(`${y}-${mo}-${d.padStart(2, "0")}T${String(h).padStart(2, "0")}:${mm}:00${IST_OFFSET}`);
  return isNaN(date.getTime()) ? null : date;
}

const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});
export function formatIST(d: Date): string {
  return fmt.format(d);
}

/** Human "in 2 days 4 hrs" / "3 hrs ago" */
export function relative(d: Date, now = new Date()): string {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  let s: string;
  if (days >= 1) s = `${days} day${days > 1 ? "s" : ""}${hrs % 24 ? ` ${hrs % 24} hr${hrs % 24 > 1 ? "s" : ""}` : ""}`;
  else if (hrs >= 1) s = `${hrs} hr${hrs > 1 ? "s" : ""}`;
  else s = `${mins} min${mins !== 1 ? "s" : ""}`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}
