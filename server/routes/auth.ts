import { Router } from "express";
import { sql } from "../../lib/db.js";
import { verifyPassword, hashPassword } from "../../lib/auth.js";
import { getSession } from "../../lib/session.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

router.post("/login", async (req, res) => {
  const body = (req.body ?? {}) as { name?: string; password?: string };
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  if (!name || !password) { res.status(400).json({ error: "Name and password are required." }); return; }

  const rows = await sql`select * from desk_users where lower(name) = lower(${name})`;
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: "Invalid name or password." });
    return;
  }

  const session = await getSession(req, res);
  session.user = { id: row.id, name: row.name, isAdmin: row.role !== "user", role: row.role };
  await session.save();
  await logActivity({ actorId: row.id, actorName: row.name, actorRole: row.role, action: "login" });
  res.status(200).json({ user: session.user });
});

router.post("/logout", async (req, res) => {
  const session = await getSession(req, res);
  session.destroy();
  res.status(200).json({ ok: true });
});

router.get("/me", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.user) { res.status(401).json({ error: "Not signed in." }); return; }
  res.status(200).json({ user: session.user });
});

router.post("/change-password", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.user) { res.status(401).json({ error: "Not signed in." }); return; }

  const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string };
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters." }); return; }

  const rows = await sql`select * from desk_users where id = ${session.user.id}`;
  const row = rows[0];
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  await sql`update desk_users set password_hash = ${hashPassword(newPassword)} where id = ${session.user.id}`;
  await logActivity({ actorId: session.user.id, actorName: session.user.name, actorRole: session.user.role, action: "password_changed", detail: "Changed their own password." });
  res.status(200).json({ ok: true });
});

export default router;
