import { sql, withTransaction } from "./db";
import type { InventoryStone } from "./xlsxParse";

const COLUMNS = [
  "stone_id", "shape", "weight", "color", "clarity", "cut", "polish", "symmetry", "fluorescence",
  "lab", "report_no", "rate", "amt", "rap_rate", "rap_amt", "back", "status", "location",
  "cert_date", "image_link", "video", "cert_filename", "raw"
] as const;

function stoneToRow(s: InventoryStone): unknown[] {
  return [
    s.stoneId, s.shape, s.weight, s.color, s.clarity, s.cut, s.polish, s.symmetry, s.fluorescence,
    s.lab, s.reportNo, s.rate, s.amt, s.rapRate, s.rapAmt, s.back, s.status, s.location,
    s.certDate, s.imageLink, s.video, s.certFilename, JSON.stringify(s.raw ?? {})
  ];
}

/**
 * Inventory refresh is split into three steps (rather than one call) so a
 * browser upload of ~12k rows can be sent in several smaller HTTP requests
 * instead of one huge one — the live table is never touched until
 * `commitStagedInventory` runs, and that step is atomic.
 */
export async function clearInventoryStaging(): Promise<void> {
  await sql`truncate table inventory_staging`;
}

export async function appendInventoryStagingChunk(stones: InventoryStone[]): Promise<void> {
  if (!stones.length) return;
  const values: unknown[] = [];
  const placeholders = stones
    .map((s, rowIdx) => {
      const row = stoneToRow(s);
      const base = rowIdx * COLUMNS.length;
      values.push(...row);
      return "(" + COLUMNS.map((_, ci) => `$${base + ci + 1}`).join(",") + ")";
    })
    .join(",");
  const text = `insert into inventory_staging (${COLUMNS.join(",")}) values ${placeholders}`;
  await sql(text, values);
}

export async function commitStagedInventory(meta: {
  fileName: string;
  source: "manual-upload" | "gmail-worker";
  rowCount: number;
}): Promise<void> {
  await withTransaction(async (txSql) => {
    await txSql`truncate table inventory`;
    await txSql`insert into inventory select * from inventory_staging`;
    await txSql`
      insert into inventory_meta (id, file_name, source, row_count, imported_at)
      values (1, ${meta.fileName}, ${meta.source}, ${meta.rowCount}, now())
      on conflict (id) do update set
        file_name = excluded.file_name, source = excluded.source,
        row_count = excluded.row_count, imported_at = excluded.imported_at
    `;
  });
  await sql`truncate table inventory_staging`;
}

/** Single-shot convenience for the Gmail worker (Phase 2), which holds every
 *  row in memory at once and isn't subject to any HTTP body size limit. */
export async function stageAndSwapInventory(
  stones: InventoryStone[],
  meta: { fileName: string; source: "manual-upload" | "gmail-worker" }
): Promise<void> {
  await clearInventoryStaging();
  const CHUNK = 500;
  for (let i = 0; i < stones.length; i += CHUNK) {
    await appendInventoryStagingChunk(stones.slice(i, i + CHUNK));
  }
  await commitStagedInventory({ ...meta, rowCount: stones.length });
}
