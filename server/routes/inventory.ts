import { Router } from "express";
import { sql } from "../../lib/db.js";
import { rowToStone } from "../../lib/mappers.js";
import { clearInventoryStaging, appendInventoryStagingChunk, commitStagedInventory, stageAndSwapInventory } from "../../lib/inventorySwap.js";
import { normalizeStone, parseWorkbookBuffer, buildInventoryFromRows, type InventoryStone } from "../../lib/xlsxParse.js";
import { fetchLatestAutoMail } from "../../lib/gmailImap.js";

const router = Router();

function metaToJson(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    fileName: row.file_name,
    source: row.source,
    rowCount: row.row_count,
    importedAt: row.imported_at,
    emailDate: row.email_date ?? null
  };
}

router.get("/", async (_req, res) => {
  const [stones, metaRows] = await Promise.all([
    sql`select stone_id, shape, weight, color, clarity, cut, polish, symmetry, fluorescence, lab, report_no, rate, amt, rap_rate, rap_amt, back, status, location, cert_date, image_link, video, cert_filename from inventory`,
    sql`select * from inventory_meta where id = 1`
  ]);

  res.status(200).json({ stones: stones.map(rowToStone), meta: metaToJson(metaRows[0]) });
});

router.get("/:stoneId", async (req, res) => {
  const stoneId = req.params.stoneId;
  const rows = await sql`select stone_id, raw from inventory where stone_id = ${stoneId}`;
  if (!rows[0]) { res.status(404).json({ error: "Stone not found" }); return; }
  res.status(200).json({ stoneId: rows[0].stone_id, raw: rows[0].raw ?? {} });
});

// On-demand refresh: fetch the newest AutoMail.xlsx straight from the mailbox
// right now (the "Refresh" button in the Inventory tab), rather than waiting
// for the next scheduled run.
router.post("/refresh", async (_req, res) => {
  try {
    const { buffer, emailDate, fileName } = await fetchLatestAutoMail();
    const { headers, rows } = parseWorkbookBuffer(buffer);
    if (!rows.length) { res.status(502).json({ error: "The latest email's attachment had no data rows — left the existing inventory untouched." }); return; }

    const stones = buildInventoryFromRows(headers, rows);
    await stageAndSwapInventory(stones, { fileName, source: "gmail-refresh", emailDate });

    const metaRows = await sql`select * from inventory_meta where id = 1`;
    res.status(200).json({ rowCount: stones.length, meta: metaToJson(metaRows[0]) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Refresh failed." });
  }
});

router.post("/import/start", async (_req, res) => {
  await clearInventoryStaging();
  res.status(200).json({ ok: true });
});

router.post("/import/append", async (req, res) => {
  const body = (req.body ?? {}) as { stones?: Partial<InventoryStone>[] };
  const stones = Array.isArray(body.stones) ? body.stones : [];
  if (!stones.length) { res.status(400).json({ error: "stones must be a non-empty array." }); return; }
  await appendInventoryStagingChunk(stones.map(normalizeStone));
  res.status(200).json({ appended: stones.length });
});

router.post("/import/commit", async (req, res) => {
  const body = (req.body ?? {}) as { fileName?: string; rowCount?: number };
  if (!body.fileName || !Number.isFinite(body.rowCount)) {
    res.status(400).json({ error: "fileName and rowCount are required." });
    return;
  }
  await commitStagedInventory({ fileName: body.fileName, source: "manual-upload", rowCount: body.rowCount! });
  res.status(200).json({ ok: true });
});

export default router;
