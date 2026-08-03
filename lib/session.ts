import { getIronSession } from "iron-session";
import type { IncomingMessage, ServerResponse } from "http";

export interface SessionData {
  office?: { username: string; displayName: string };
}

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  throw new Error("SESSION_SECRET environment variable must be set to a random string of at least 32 characters — see .env.example.");
}

export const sessionOptions = {
  password,
  cookieName: "stone_offer_desk_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 14 // 2 weeks
  }
};

export function getSession(req: IncomingMessage, res: ServerResponse) {
  return getIronSession<SessionData>(req, res, sessionOptions);
}

/** Call at the top of any protected API route. Returns the office if logged in, otherwise null. */
export async function requireOffice(req: IncomingMessage, res: ServerResponse) {
  const session = await getSession(req, res);
  return session.office ?? null;
}
