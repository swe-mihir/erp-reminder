import { NextResponse, type NextRequest } from "next/server";
import { syncAll } from "@/lib/sync";
import { timingSafeEqualStr } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alternative trigger for the scheduled sync (e.g. from cron-job.org or Vercel Cron).
 * Call with header "Authorization: Bearer <CRON_SECRET>".
 * Processes users (least-recently-synced first) until ~45s have passed, so call it often
 * enough for all users to be covered. The GitHub Actions workflow runs the full sync
 * as a script instead and is the recommended trigger.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await syncAll({ budgetMs: 45_000, delayMs: 500 });
  return NextResponse.json(summary);
}
