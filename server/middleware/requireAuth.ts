import type { Request, Response, NextFunction } from "express";
import { getSession, type SessionUser } from "../../lib/session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, res);
  if (!session.user) { res.status(401).json({ error: "Not signed in." }); return; }
  req.user = session.user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, res);
  if (!session.user) { res.status(401).json({ error: "Not signed in." }); return; }
  if (!session.user.isAdmin) { res.status(403).json({ error: "Admin access required." }); return; }
  req.user = session.user;
  next();
}

/** The hidden superadmin account is oversight-only — it can view offers,
 *  clients, exports and activity, but never creates/edits/deletes an offer
 *  or posts a chat message, since either would leave its name on a record
 *  every other signed-in user can see. */
export async function blockSuperadmin(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, res);
  if (session.user?.role === "superadmin") {
    res.status(403).json({ error: "This account is view-only." });
    return;
  }
  next();
}
