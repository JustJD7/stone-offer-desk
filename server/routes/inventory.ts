import { Router } from "express";
import { sql } from "../../lib/db";
import { rowToStone } from "../../lib/mappers";
import { clearInventoryStaging, appendInventoryStagingChunk, commitStagedInventory } from "../../lib/inventorySwap";
import { normalizeStone, type InventoryStone } from "../../lib/xlsxParse";

const router = Router();

router.get("/", async (req, res) => {
  const [stones, metaRows] = await Promise.all([
    sql`select stone_id, shape, weight, color, clarity, cut, polish, symmetry, fluorescence, lab, report_no, rate, amt, rap_rate, rap_amt, back, status, location, cert_date, image_link, video, cert_filename from inventory`,
    sql`select * from inventory_meta where id = 1`
  ]);

  res.status(200).json({
    stones: stones.map(rowToStone),
    meta: metaRows[0]
      ? { fileName: metaRows[0].file_name, source: metaRows[0].source, rowCount: metaRows[0].row_count, importedAt: metaRows[0].imported_at }
      : null
  });
});

router.get("/:stoneId", async (req, res) => {  const stoneId = req.params.stoneId;
  const rows = await sql`select stone_id, raw from inventory where stone_id = ${stoneId}`;
  if (!rows[0]) { res.status(404).json({ error: "Stone not found" }); return; }
  res.status(200).json({ stoneId: rows[0].stone_id, raw: rows[0].raw ?? {} });
});

router.post("/import/start", async (req, res) => {  await clearInventoryStaging();
  res.status(200).json({ ok: true });
});

router.post("/import/append", async (req, res) => {  const body = (req.body ?? {}) as { stones?: Partial<InventoryStone>[] };
  const stones = Array.isArray(body.stones) ? body.stones : [];
  if (!stones.length) { res.status(400).json({ error: "stones must be a non-empty array." }); return; }
  await appendInventoryStagingChunk(stones.map(normalizeStone));
  res.status(200).json({ appended: stones.length });
});

router.post("/import/commit", async (req, res) => {  const body = (req.body ?? {}) as { fileName?: string; rowCount?: number };
  if (!body.fileName || !Number.isFinite(body.rowCount)) {
    res.status(400).json({ error: "fileName and rowCount are required." });
    return;
  }
  await commitStagedInventory({ fileName: body.fileName, source: "manual-upload", rowCount: body.rowCount! });
  res.status(200).json({ ok: true });
});

export default router;
