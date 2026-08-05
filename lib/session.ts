import { getIronSession } from "iron-session";
import type { IronSession } from "iron-session";
import type { Request, Response } from "express";

export type UserRole = "user" | "admin" | "superadmin";

export interface SessionUser {
  id: string;
  name: string;
  isAdmin: boolean; // true for admin and superadmin — kept for existing admin-gated UI
  role: UserRole;
}

export interface SessionData {
  user?: SessionUser;
}

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  throw new Error("SESSION_SECRET environment variable must be set to a random string of at least 32 characters — see .env.example.");
}

export const sessionOptions = {
  cookieName: "stone_offer_session",
  password,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30 // 30 days
  }
};

export function getSession(req: Request, res: Response): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}
