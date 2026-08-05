import { Router } from "express";
import { sql } from "../../lib/db.js";
import { hashPassword, generateRandomPassword } from "../../lib/auth.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

function rowToUser(r: any) {
  return { id: r.id, name: r.name, isAdmin: r.role !== "user", role: r.role, createdAt: r.created_at };
}

/** Hides superadmin rows from anyone who isn't superadmin themselves —
 *  the account (and the fact that it exists at all) is not visible to
 *  regular admins. */
router.get("/", async (req, res) => {
  const rows = await sql`select * from desk_users order by name asc`;
  const visible = req.user!.role === "superadmin" ? rows : rows.filter((r: any) => r.role !== "superadmin");
  res.status(200).json({ users: visible.map(rowToUser) });
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

  // The API can only ever create 'user' or 'admin' accounts — a superadmin
  // can only be seeded directly against the database.
  const role = body.isAdmin ? "admin" : "user";
  const rows = await sql`
    insert into desk_users (name, password_hash, role)
    values (${name}, ${hashPassword(password)}, ${role})
    returning *
  `;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "user_added", detail: `Added ${role} "${name}".` });
  res.status(201).json({ user: rowToUser(rows[0]) });
});

router.post("/:id/reset-password", async (req, res) => {
  const id = req.params.id;
  const target = await sql`select role, name from desk_users where id = ${id}`;
  if (!target[0] || (target[0].role === "superadmin" && req.user!.role !== "superadmin")) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const newPassword = generateRandomPassword();
  await sql`update desk_users set password_hash = ${hashPassword(newPassword)} where id = ${id}`;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "password_reset", detail: `Reset password for "${target[0].name}".` });
  res.status(200).json({ newPassword });
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const target = await sql`select role, name from desk_users where id = ${id}`;
  if (!target[0] || (target[0].role === "superadmin" && req.user!.role !== "superadmin")) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (target[0].role === "admin") {
    const adminCount = await sql`select count(*)::int as count from desk_users where role = 'admin'`;
    if (adminCount[0].count <= 1) { res.status(400).json({ error: "Cannot remove the last admin." }); return; }
  }
  if (id === req.user?.id) { res.status(400).json({ error: "You can't remove your own account while signed in." }); return; }

  await sql`delete from desk_users where id = ${id}`;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "user_removed", detail: `Removed "${target[0].name}".` });
  res.status(200).json({ ok: true });
});

export default router;
