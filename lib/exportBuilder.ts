import * as XLSX from "xlsx";
import { STONE_COLUMNS, stoneRowCells, stoneSummaryRow, stonesForOfferRow, stonesTotals } from "./stonesFormat.js";

interface ThreadMessage { author: "client" | "company"; message: string; ts: string; price?: number; by?: string }

function formatChatCell(m: ThreadMessage): string {
  const who = m.author === "company" ? m.by || "Company" : "Client";
  const ts = new Date(m.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const price = m.price != null ? ` [${m.price}]` : "";
  return `${ts} - ${who}: ${m.message}${price}`;
}

const DEAL_COLUMNS = ["Client", "Country", "Contact", "Channel", "Type", "Status", "Priority", "Created By", "Created At"];
const OUTCOME_COLUMNS = ["Sold Price Type", "Sold Price", "Sold At", "Rejection Reason"];

/** Builds the offers export workbook — one row per stone (an offer with 3 stones is 3
 *  rows, all repeating that offer's client/status/etc columns, plus 3 summary rows after
 *  them), used identically by the "export all" and "export this offer" routes so both
 *  produce the same shape of sheet. Negotiation chat gets one column per message
 *  (dynamic count = the longest thread among the rows being exported) instead of one
 *  cell, since a crammed cell isn't usable as data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOffersWorkbook(rows: any[]): Buffer {
  const maxChat = rows.reduce((max, r) => Math.max(max, (r.thread ?? []).length), 0);
  const chatColumns = Array.from({ length: maxChat }, (_, i) => `Chat ${i + 1}`);
  const header = [...DEAL_COLUMNS, ...STONE_COLUMNS, ...OUTCOME_COLUMNS, "Notes", ...chatColumns];

  const body: Array<Array<string | number>> = [];
  for (const r of rows) {
    const stones = stonesForOfferRow(r);
    const dealCells = [
      r.entity_name || "", r.country || "", r.contact || "", r.channel || "", r.type, r.status,
      r.priority ? "Yes" : "No", r.created_by_office || "", new Date(r.created_at).toISOString()
    ];
    const outcomeCells = [
      r.sold_price_type || "", r.sold_price != null ? Number(r.sold_price) : "",
      r.sold_at ? new Date(r.sold_at).toISOString() : "", r.rejection_reason || ""
    ];
    const chatCells: string[] = (r.thread ?? []).map(formatChatCell);
    while (chatCells.length < chatColumns.length) chatCells.push("");
    const blankChat = chatColumns.map(() => "");

    stones.forEach((s, i) => {
      body.push([
        ...dealCells, ...stoneRowCells(s), ...outcomeCells,
        i === 0 ? r.notes || "" : "", ...(i === 0 ? chatCells : blankChat)
      ]);
    });

    if (stones.length > 1) {
      const t = stonesTotals(stones);
      const blankDeal = dealCells.map(() => "");
      const blankOutcome = OUTCOME_COLUMNS.map(() => "");
      const summaryRows = [
        stoneSummaryRow("Our Avg / Total", 11, t.ourAvgBack, 13, t.ourTotalAmount),
        stoneSummaryRow("Client Avg / Total", 16, t.clientAvgBack, 18, t.clientTotalAmount),
        stoneSummaryRow("Diff Avg / Total", 19, t.diffAvgBack, 21, t.diffTotalAmount)
      ];
      for (const sr of summaryRows) body.push([...blankDeal, ...sr, ...blankOutcome, "", ...blankChat]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Offers");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
