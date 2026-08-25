/**
 * Stateless session cookie (signed JWT, HttpOnly, SameSite=Lax).
 *
 * The role carried in the token is a *hint* used to pick which navigation to
 * render. It is never trusted for authorisation: every read and write is
 * re-authorised by Row Level Security using the user id, and `app.is_admin()`
 * reads the role from the database, not from the token.
 */
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";
import type { SessionUser } from "./types";

const COOKIE = "isx_session";
const secret = new TextEncoder().encode(env.authSecret);

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    // `sub` matches the Supabase/PostgREST claim name, so the same RLS
    // policies work when this app is moved onto Supabase Auth.
    role: user.role, name: user.name, email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("isx-leave")
    .setExpirationTime(`${env.sessionTtlSeconds}s`)
    .sign(secret);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: env.sessionTtlSeconds,
  });
}

export async function readSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: "isx-leave" });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      role: payload.role === "admin" ? "admin" : "employee",
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
