import { Router } from "express";
import { sql } from "../../lib/db.js";
import { hashPassword } from "../../lib/auth.js";

const router = Router();

function rowToUser(r: any) {
  return { id: r.id, name: r.name, isAdmin: r.is_admin, createdAt: r.created_at };
}

router.get("/", async (_req, res) => {
  const rows = await sql`select * from desk_users order by name asc`;
  res.status(200).json({ users: rows.map(rowToUser) });
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as { name?: string; password?: string; isAdmin?: boolean };
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  if (!name || password.length < 6) {
    res.status(400).json({ error: "Name and a password of at least 6 characters are required." });
    return;
  }

  const existing = await sql`select id from desk_users where lower(name) = lower(${name})`;
  if (existing[0]) { res.status(409).json({ error: "A user with that name already exists." }); return; }

  const rows = await sql`
    insert into desk_users (name, password_hash, is_admin)
    values (${name}, ${hashPassword(password)}, ${!!body.isAdmin})
    returning *
  `;
  res.status(201).json({ user: rowToUser(rows[0]) });
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const target = await sql`select is_admin from desk_users where id = ${id}`;
  if (!target[0]) { res.status(404).json({ error: "User not found." }); return; }

  if (target[0].is_admin) {
    const adminCount = await sql`select count(*)::int as count from desk_users where is_admin = true`;
    if (adminCount[0].count <= 1) { res.status(400).json({ error: "Cannot remove the last admin." }); return; }
  }
  if (id === req.user?.id) { res.status(400).json({ error: "You can't remove your own account while signed in." }); return; }

  await sql`delete from desk_users where id = ${id}`;
  res.status(200).json({ ok: true });
});

export default router;
