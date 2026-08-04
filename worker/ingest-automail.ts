/**
 * Runs on a GitHub Actions schedule (see .github/workflows/ingest-automail.yml),
 * hourly — NOT on Vercel, so it isn't bound by serverless request timeouts.
 * Fetches the newest AutoMail.xlsx from the "Stock List" mailbox folder over
 * IMAP (see lib/gmailImap.ts) and atomically replaces the live `inventory`
 * table. This is the same logic the in-app "Refresh from Email" button runs
 * on demand — this script just runs it unattended, on a schedule.
 */
import "dotenv/config";
import { fetchLatestAutoMail } from "../lib/gmailImap.js";
import { parseWorkbookBuffer, buildInventoryFromRows } from "../lib/xlsxParse.js";
import { stageAndSwapInventory } from "../lib/inventorySwap.js";

async function main() {
  console.log("[ingest-automail] starting…");

  const { buffer, emailDate, fileName } = await fetchLatestAutoMail();
  console.log(`[ingest-automail] found "${fileName}" (email date: ${emailDate.toISOString()}, ${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const { headers, rows } = parseWorkbookBuffer(buffer);
  if (!rows.length) throw new Error("Parsed workbook has no data rows — refusing to overwrite live inventory.");

  const stones = buildInventoryFromRows(headers, rows);
  console.log(`[ingest-automail] parsed ${stones.length} stones`);

  await stageAndSwapInventory(stones, { fileName, source: "gmail-refresh", emailDate });
  console.log(`[ingest-automail] inventory refreshed successfully — ${stones.length} stones now live.`);
}

main().catch((err) => {
  console.error("[ingest-automail] FAILED:", err);
  process.exit(1);
});
