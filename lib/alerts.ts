import { escapeHtml, appUrl, layout, type Mail } from "./mail";
import { formatIST, relative } from "./time";

export type AlertableItem = {
  id: string;
  kind: "assignment" | "quiz";
  subject_name: string;
  title: string;
  due_at: Date;
  completed: boolean;
};

export type PlannedAlert = { item: AlertableItem; daysBefore: number; coversThresholds: number[] };

/**
 * Decide which items need an alert right now.
 *
 * thresholds = e.g. [3, 1] → alert when ≤3 days remain and again when ≤1 day remains.
 * If an item is first seen late (e.g. with 20 hours left) only the smallest matching
 * threshold fires, and all larger thresholds are marked as covered so they never fire.
 */
export function planAlerts(
  items: AlertableItem[],
  thresholds: number[],
  alreadySent: Set<string>, // keys "itemId:days"
  now = new Date(),
): PlannedAlert[] {
  const ths = [...new Set(thresholds.filter((d) => Number.isFinite(d) && d > 0))].sort((a, b) => a - b);
  if (!ths.length) return [];
  const out: PlannedAlert[] = [];
  for (const item of items) {
    if (item.completed) continue;
    const msLeft = item.due_at.getTime() - now.getTime();
    if (msLeft <= 0) continue;
    const daysLeft = msLeft / 86_400_000;
    const matching = ths.filter((d) => daysLeft <= d);
    if (!matching.length) continue;
    const smallest = matching[0];
    if (alreadySent.has(`${item.id}:${smallest}`)) continue;
    out.push({ item, daysBefore: smallest, coversThresholds: matching });
  }
  return out.sort((a, b) => a.item.due_at.getTime() - b.item.due_at.getTime());
}

export function buildDigest(to: string, alerts: PlannedAlert[], now = new Date()): Mail {
  const first = alerts[0].item;
  const subject =
    alerts.length === 1
      ? `⏰ ${first.title} (${first.subject_name}) due ${relative(first.due_at, now)}`
      : `⏰ ${alerts.length} deadlines coming up, the first is due ${relative(first.due_at, now)}`;

  const rows = alerts
    .map(({ item }) => {
      const hoursLeft = (item.due_at.getTime() - now.getTime()) / 3_600_000;
      const color = hoursLeft <= 24 ? "#b4261c" : hoursLeft <= 72 ? "#b36b00" : "#2d6a4f";
      return `<tr>
  <td style="padding:10px 0;border-top:1px solid #eee8dc;vertical-align:top">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#7a7365">${item.kind === "quiz" ? "Quiz" : "Assignment"} · ${escapeHtml(item.subject_name)}</div>
    <div style="font-weight:600;font-size:15px;margin:2px 0">${escapeHtml(item.title)}</div>
    <div style="font-size:13px;color:#4a4539">Due ${escapeHtml(formatIST(item.due_at))} · <b style="color:${color}">${escapeHtml(relative(item.due_at, now))}</b></div>
  </td></tr>`;
    })
    .join("");

  const html = layout(
    alerts.length === 1 ? "A deadline is coming up" : `${alerts.length} deadlines are coming up`,
    `<table style="width:100%;border-collapse:collapse">${rows}</table>
     <p style="margin:18px 0 0"><a href="https://erp.vcet.edu.in/login.htm" style="background:#b4441c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Open ERP</a>
     &nbsp; <a href="${appUrl("/dashboard")}" style="color:#b4441c;font-size:14px">View dashboard</a></p>`,
  );

  const text =
    alerts
      .map(({ item }) => `• [${item.kind}] ${item.subject_name}: ${item.title}, due ${formatIST(item.due_at)} (${relative(item.due_at, now)})`)
      .join("\n") + `\n\nOpen ERP: https://erp.vcet.edu.in/login.htm\nDashboard: ${appUrl("/dashboard")}`;

  return { to, subject, html, text };
}
