import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, type UserRow } from "./db";
import { randomToken } from "./crypto";

const COOKIE = "erpr_session";
const SESSION_DAYS = 30;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expires})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db()`DELETE FROM sessions WHERE token = ${token}`;
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [u] = await db()<UserRow[]>`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()`;
  return u ?? null;
}

export async function requireUser(): Promise<UserRow> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export function emailAllowed(email: string): boolean {
  const list = (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return list.some((d) => domain === d || domain.endsWith("." + d));
}
