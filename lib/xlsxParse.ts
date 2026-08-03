import * as XLSX from "xlsx";

/**
 * Server-side counterpart to the hand-rolled browser parser in
 * offer-dashboard.html. Same field-alias mapping so both stay resilient to
 * header renames/reordering in future AutoMail/client-list exports — but here
 * we can lean on SheetJS instead of hand-rolling ZIP/XML parsing, since
 * there's no browser CSP constraint on the server.
 */

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseWorkbookBuffer(buffer: Buffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];

  // raw:true — we do our own numeric/date normalization below rather than
  // relying on SheetJS's cell-format-based auto-formatting.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const headers = rawRows.length
    ? Object.keys(rawRows[0])
    : ((XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]) || []);

  const rows = rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const key of headers) {
      const v = row[key];
      if (v == null || v === "") out[key] = "";
      else if (typeof v === "number") out[key] = Number.isInteger(v) ? v.toFixed(0) : String(v);
      else out[key] = String(v);
    }
    return out;
  });

  return { headers, rows };
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildFieldIndex(headers: string[], aliasMap: Record<string, string[]>): Record<string, string> {
  const normHeaders = headers.map(normHeader);
  const fieldIndex: Record<string, string> = {};
  for (const field of Object.keys(aliasMap)) {
    for (const alias of aliasMap[field]) {
      const idx = normHeaders.indexOf(alias);
      if (idx !== -1) { fieldIndex[field] = headers[idx]; break; }
    }
  }
  return fieldIndex;
}

function excelSerialToDate(v: string): string {
  const n = parseFloat(v);
  if (!n || isNaN(n)) return "";
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export interface InventoryStone {
  stoneId: string; shape: string; weight: number; color: string; clarity: string; cut: string;
  polish: string; symmetry: string; fluorescence: string; lab: string; reportNo: string;
  rate: number; amt: number; rapRate: number; rapAmt: number; back: string; status: string;
  location: string; certDate: string; imageLink: string; video: string; certFilename: string;
  raw: Record<string, string>;
}

const INVENTORY_ALIASES: Record<string, string[]> = {
  stoneId: ["stoneid"], shape: ["shape"], weight: ["weight", "carat", "wt"],
  color: ["color", "colour"], clarity: ["clarity"], cut: ["cut"], polish: ["polish"],
  symmetry: ["symmetry"], fluorescence: ["fluorescence", "fluor"], lab: ["lab"],
  reportNo: ["reportno", "reportnumber", "certificatenumber"], rate: ["rate"], amt: ["amt", "amount"],
  rapRate: ["raprate"], rapAmt: ["rapamt"], back: ["back"], status: ["status"], location: ["location"],
  certDate: ["certdate"], imageLink: ["imagelink"], video: ["video"], certFilename: ["certificatefilename"]
};

export function buildInventoryFromRows(headers: string[], rows: Record<string, string>[]): InventoryStone[] {
  const fi = buildFieldIndex(headers, INVENTORY_ALIASES);
  const get = (row: Record<string, string>, field: string) => (fi[field] !== undefined ? row[fi[field]] : "");
  return rows.map((row, i) => ({
    stoneId: get(row, "stoneId") || `ROW${i}`,
    shape: get(row, "shape"), weight: parseFloat(get(row, "weight")) || 0,
    color: get(row, "color"), clarity: get(row, "clarity"), cut: get(row, "cut"),
    polish: get(row, "polish"), symmetry: get(row, "symmetry"), fluorescence: get(row, "fluorescence"),
    lab: get(row, "lab"), reportNo: get(row, "reportNo"),
    rate: parseFloat(get(row, "rate")) || 0, amt: parseFloat(get(row, "amt")) || 0,
    rapRate: parseFloat(get(row, "rapRate")) || 0, rapAmt: parseFloat(get(row, "rapAmt")) || 0,
    back: get(row, "back"), status: get(row, "status") || "Unknown", location: get(row, "location"),
    certDate: excelSerialToDate(get(row, "certDate")), imageLink: get(row, "imageLink"),
    video: get(row, "video"), certFilename: get(row, "certFilename"), raw: row
  }));
}

export interface ClientRow { entityName: string; country: string; stockCategory: string }

const CLIENT_ALIASES: Record<string, string[]> = {
  entityName: ["entityname", "name", "client", "clientname"], country: ["country"], stockCategory: ["stockcategory", "category"]
};

/** Fills in defaults for a partial stone object arriving over HTTP (e.g. from
 *  the browser's own parser), so downstream code always sees the full shape. */
export function normalizeStone(s: Partial<InventoryStone>, index: number): InventoryStone {
  return {
    stoneId: s.stoneId || `ROW${index}`, shape: s.shape ?? "", weight: Number(s.weight) || 0,
    color: s.color ?? "", clarity: s.clarity ?? "", cut: s.cut ?? "", polish: s.polish ?? "",
    symmetry: s.symmetry ?? "", fluorescence: s.fluorescence ?? "", lab: s.lab ?? "",
    reportNo: s.reportNo ?? "", rate: Number(s.rate) || 0, amt: Number(s.amt) || 0,
    rapRate: Number(s.rapRate) || 0, rapAmt: Number(s.rapAmt) || 0, back: s.back ?? "",
    status: s.status || "Unknown", location: s.location ?? "", certDate: s.certDate ?? "",
    imageLink: s.imageLink ?? "", video: s.video ?? "", certFilename: s.certFilename ?? "",
    raw: s.raw ?? {}
  };
}

export function buildClientsFromRows(headers: string[], rows: Record<string, string>[]): ClientRow[] {
  const fi = buildFieldIndex(headers, CLIENT_ALIASES);
  const out: ClientRow[] = [];
  for (const row of rows) {
    const name = (fi.entityName !== undefined ? row[fi.entityName] : "").trim();
    if (!name) continue;
    out.push({
      entityName: name,
      country: fi.country !== undefined ? row[fi.country] : "",
      stockCategory: fi.stockCategory !== undefined ? row[fi.stockCategory] : ""
    });
  }
  return out;
}
