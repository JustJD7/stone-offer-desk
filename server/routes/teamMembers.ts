import { Router } from "express";
import { sql } from "../../lib/db.js";
import { rowToTeamMember } from "../../lib/mappers.js";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await sql`select * from team_members order by name asc`;
  res.status(200).json({ teamMembers: rows.map(rowToTeamMember) });
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required." }); return; }

  const existing = await sql`select * from team_members where lower(name) = lower(${name})`;
  if (existing[0]) { res.status(200).json({ teamMember: rowToTeamMember(existing[0]) }); return; }

  const rows = await sql`insert into team_members (name) values (${name}) returning *`;
  res.status(201).json({ teamMember: rowToTeamMember(rows[0]) });
});

export default router;
