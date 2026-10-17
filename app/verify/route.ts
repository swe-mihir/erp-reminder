import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendDueAlerts } from "@/lib/sync";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const base = process.env.APP_URL || req.nextUrl.origin;
  if (!token) return NextResponse.redirect(new URL("/dashboard?verified=0", base));
  const [u] = await db()<{ id: string }[]>`
    UPDATE users SET email_verified = true, verify_token = NULL WHERE verify_token = ${token} RETURNING id`;
  if (u) await sendDueAlerts(u.id).catch(() => undefined);
  return NextResponse.redirect(new URL(`/dashboard?verified=${u ? 1 : 0}`, base));
}
