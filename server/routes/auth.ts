import { Router } from "express";
import { sql } from "../../lib/db.js";
import { verifyPassword } from "../../lib/auth.js";
import { getSession } from "../../lib/session.js";

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
  session.user = { id: row.id, name: row.name, isAdmin: row.is_admin };
  await session.save();
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

export default router;
