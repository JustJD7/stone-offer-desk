import { Router } from "express";
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db";
import { getSession } from "../../lib/session";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) { res.status(400).json({ error: "Username and password are required." }); return; }

  const rows = await sql`select username, password_hash, display_name from offices where lower(username) = lower(${username})`;
  const office = rows[0] as { username: string; password_hash: string; display_name: string } | undefined;
  if (!office) { res.status(401).json({ error: "Invalid username or password." }); return; }

  const ok = await bcrypt.compare(password, office.password_hash);
  if (!ok) { res.status(401).json({ error: "Invalid username or password." }); return; }

  const session = await getSession(req, res);
  session.office = { username: office.username, displayName: office.display_name };
  await session.save();
  res.status(200).json({ office: session.office });
});

router.post("/logout", async (req, res) => {
  const session = await getSession(req, res);
  session.destroy();
  res.status(200).json({ ok: true });
});

router.get("/me", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.office) { res.status(401).json({ office: null }); return; }
  res.status(200).json({ office: session.office });
});

export default router;
