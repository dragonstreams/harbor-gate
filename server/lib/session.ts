import { randomBytes } from "node:crypto";
import type { H3Event } from "nitro/h3";
import { createError, deleteCookie, getCookie, getHeader, getRequestURL, setCookie } from "nitro/h3";

const COOKIE_NAME = "harborgate_session";
const SESSION_TTL = 12 * 60 * 60 * 1000;

type Session = { token: string; adminName: string; csrf: string; expiresAt: number };
const sessions = new Map<string, Session>();

function secureCookie(event: H3Event) {
  const forwardedProtocol = getHeader(event, "x-forwarded-proto")?.split(",")[0]?.trim();
  return process.env.NODE_ENV === "production" || forwardedProtocol === "https" || getRequestURL(event).protocol === "https:";
}

export function createSession(event: H3Event, token: string, adminName: string) {
  const id = randomBytes(32).toString("hex");
  const csrf = randomBytes(24).toString("base64url");
  sessions.set(id, { token, adminName, csrf, expiresAt: Date.now() + SESSION_TTL });
  setCookie(event, COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie(event),
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
  return { adminName, csrf };
}

export function requireSession(event: H3Event, mutation = false) {
  const id = getCookie(event, COOKIE_NAME);
  const session = id ? sessions.get(id) : undefined;
  if (!session || session.expiresAt < Date.now()) {
    if (id) sessions.delete(id);
    throw createError({ statusCode: 401, statusMessage: "Your administrator session has expired" });
  }
  if (mutation && event.headers.get("x-harborgate-csrf") !== session.csrf) {
    throw createError({ statusCode: 403, statusMessage: "Invalid security token" });
  }
  return session;
}

export function removeSession(event: H3Event) {
  const id = getCookie(event, COOKIE_NAME);
  if (id) sessions.delete(id);
  deleteCookie(event, COOKIE_NAME, { path: "/" });
}

export function getActiveTokens() {
  const now = Date.now();
  const tokens = new Set<string>();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
    else tokens.add(session.token);
  }
  return [...tokens];
}
