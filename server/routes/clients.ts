import { Router } from "express";
import { sql } from "../../lib/db.js";
import { rowToClient } from "../../lib/mappers.js";
import { requireAdmin } from "../middleware/requireAuth.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

// Must come before "/:id" so "reset" isn't treated as an id.
router.delete("/reset", requireAdmin, async (req, res) => {
  await sql`update offers set client_id = null`;
  await sql`delete from clients`;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "clients_reset", detail: "Removed all clients." });
  res.status(200).json({ ok: true });
});

router.get("/", async (req, res) => {  const rows = await sql`select * from clients order by entity_name asc`;
  res.status(200).json({ clients: rows.map(rowToClient) });
});

router.post("/", async (req, res) => {  const body = (req.body ?? {}) as { entityName?: string; country?: string; stockCategory?: string };
  const entityName = (body.entityName ?? "").trim();
  if (!entityName) { res.status(400).json({ error: "entityName is required." }); return; }
  const rows = await sql`
    insert into clients (entity_name, country, stock_category, source)
    values (${entityName}, ${body.country ?? ""}, ${body.stockCategory ?? ""}, 'manual')
    returning *
  `;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "client_added", detail: entityName });
  res.status(201).json({ client: rowToClient(rows[0]) });
});

router.post("/import", async (req, res) => {
  const body = (req.body ?? {}) as { rows?: { entityName: string; country?: string; stockCategory?: string }[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) { res.status(400).json({ error: "rows must be a non-empty array." }); return; }

  let added = 0, updated = 0;
  for (const row of rows) {
    const entityName = (row.entityName ?? "").trim();
    if (!entityName) continue;
    const existing = await sql`select id from clients where lower(entity_name) = lower(${entityName})`;
    if (existing[0]) {
      await sql`
        update clients set
          country = coalesce(nullif(${row.country ?? ""}, ''), country),
          stock_category = coalesce(nullif(${row.stockCategory ?? ""}, ''), stock_category)
        where id = ${existing[0].id}
      `;
      updated++;
    } else {
      await sql`
        insert into clients (entity_name, country, stock_category, source)
        values (${entityName}, ${row.country ?? ""}, ${row.stockCategory ?? ""}, 'import')
      `;
      added++;
    }
  }

  const totalRows = await sql`select count(*)::int as count from clients`;
  res.status(200).json({ added, updated, total: totalRows[0].count });
});

router.patch("/:id", async (req, res) => {  const id = req.params.id;
  const body = (req.body ?? {}) as { entityName?: string; country?: string; stockCategory?: string };
  const current = await sql`select * from clients where id = ${id}`;
  if (!current[0]) { res.status(404).json({ error: "Client not found" }); return; }
  const rows = await sql`
    update clients set
      entity_name = ${body.entityName ?? current[0].entity_name},
      country = ${body.country ?? current[0].country},
      stock_category = ${body.stockCategory ?? current[0].stock_category}
    where id = ${id}
    returning *
  `;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "client_edited", detail: rows[0].entity_name });
  res.status(200).json({ client: rowToClient(rows[0]) });
});

router.delete("/:id", async (req, res) => {  const id = req.params.id;
  const existing = await sql`select entity_name from clients where id = ${id}`;
  await sql`update offers set client_id = null where client_id = ${id}`;
  await sql`delete from clients where id = ${id}`;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "client_deleted", detail: existing[0]?.entity_name || "" });
  res.status(200).json({ ok: true });
});

export default router;
