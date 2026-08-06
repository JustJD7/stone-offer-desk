/** Server-side mirror of the frontend's clientMetrics()/ourMetrics() (public/index.html) —
 *  kept in sync manually since one is embedded HTML/JS and the other TS. Used by the
 *  offer detail view's stones table AND both Excel exports, so all three show the same
 *  numbers for the same offer. */

export interface RefStone {
  stoneId?: string | null; reportNo?: string | null; shape?: string | null; color?: string | null;
  clarity?: string | null; cut?: string | null; polish?: string | null; symmetry?: string | null;
  fluorescence?: string | null; lab?: string | null;
  rate?: number | null; rapRate?: number | null; rapAmt?: number | null; amt?: number | null;
}

export interface StoneEntry {
  shape?: string; carat?: string | number; color?: string; clarity?: string; cut?: string; cert?: string;
  priceType: string; price: number; matchedStone?: RefStone | null;
}

export interface Metrics { back: number | null; rate: number | null; amount: number | null }
export interface OurMetrics extends Metrics { rapRate: number | null; rapAmt: number | null }

function round2(n: number): number { return Math.round(n * 100) / 100; }

/** The client's price normalized into back%/rate/amount regardless of which one they
 *  quoted — back%<->$ conversion needs a Rap reference (the linked inventory stone). */
export function clientMetrics(priceType: string, price: number, carat: number, ref: RefStone | null | undefined): Metrics {
  const rap = ref?.rapRate ? Number(ref.rapRate) : null;
  let rate: number | null = null, amount: number | null = null, back: number | null = null;
  if (priceType === "back") {
    if (rap) { rate = rap * (1 + price / 100); amount = rate * carat; back = (1 - rate / rap) * 100; }
  } else if (priceType === "per_carat") {
    rate = price; amount = price * carat;
    if (rap) back = (1 - rate / rap) * 100;
  } else {
    amount = price; rate = carat ? amount / carat : 0;
    if (rap) back = (1 - rate / rap) * 100;
  }
  return { back, rate, amount };
}

/** Our own valuation of the linked inventory stone, same three representations. */
export function ourMetrics(ref: RefStone | null | undefined): OurMetrics {
  if (!ref) return { back: null, rate: null, amount: null, rapRate: null, rapAmt: null };
  const rate = ref.rate != null ? Number(ref.rate) : null;
  const rap = ref.rapRate != null ? Number(ref.rapRate) : null;
  const amount = ref.amt != null ? Number(ref.amt) : null;
  const back = rate != null && rap ? (1 - rate / rap) * 100 : null;
  return { back, rate, amount, rapRate: rap, rapAmt: ref.rapAmt != null ? Number(ref.rapAmt) : null };
}

export const STONE_COLUMNS = [
  "Stone ID", "Report No", "Shape", "Color", "Clarity", "Carat", "Cut", "Polish", "Symmetry", "Fluor.", "Lab",
  "Back", "Rate/ct", "Amount", "Rap Rate", "Rap Amt",
  "Client Back", "Client Rate/ct", "Client Amount",
  "Back Diff", "Rate/ct Diff", "Amount Diff"
];

/** One row of STONE_COLUMNS' 22 cells for a single stone. */
export function stoneRowCells(s: StoneEntry): Array<string | number> {
  const carat = parseFloat(String(s.carat)) || 0;
  const ref = s.matchedStone || null;
  const our = ourMetrics(ref);
  const client = clientMetrics(s.priceType, Number(s.price) || 0, carat, ref);
  const backDiff = our.back != null && client.back != null ? our.back - client.back : null;
  const rateDiff = our.rate != null && client.rate != null ? our.rate - client.rate : null;
  const amtDiff = our.amount != null && client.amount != null ? client.amount - our.amount : null;
  const shape = ref?.shape || s.shape || "", color = ref?.color || s.color || "",
    clarity = ref?.clarity || s.clarity || "", cut = ref?.cut || s.cut || "";
  return [
    ref?.stoneId || "", ref?.reportNo || "", shape, color, clarity, carat || "",
    cut, ref?.polish || "", ref?.symmetry || "", ref?.fluorescence || "", ref?.lab || "",
    our.back != null ? round2(our.back) : "", our.rate != null ? round2(our.rate) : "", our.amount != null ? round2(our.amount) : "",
    our.rapRate != null ? round2(our.rapRate) : "", our.rapAmt != null ? round2(our.rapAmt) : "",
    client.back != null ? round2(client.back) : "", client.rate != null ? round2(client.rate) : "", client.amount != null ? round2(client.amount) : "",
    backDiff != null ? round2(backDiff) : "", rateDiff != null ? round2(rateDiff) : "", amtDiff != null ? round2(amtDiff) : ""
  ];
}

/** A 22-cell row matching STONE_COLUMNS' width, with a label in the first cell and up
 *  to two values placed at given column indices — used for the Our/Client/Diff Avg+Total
 *  summary rows appended after a multi-stone offer's own stone rows. */
export function stoneSummaryRow(label: string, backIdx: number, backVal: number | null, amtIdx: number, amtVal: number | null): Array<string | number> {
  const row: Array<string | number> = new Array(STONE_COLUMNS.length).fill("");
  row[0] = label;
  if (backVal != null) row[backIdx] = round2(backVal);
  if (amtVal != null) row[amtIdx] = round2(amtVal);
  return row;
}

export interface StonesTotals {
  ourAvgBack: number | null; ourTotalAmount: number | null;
  clientAvgBack: number | null; clientTotalAmount: number | null;
  diffAvgBack: number | null; diffTotalAmount: number | null;
}

export function stonesTotals(stones: StoneEntry[]): StonesTotals {
  let ourAmt = 0, ourBackSum = 0, ourBackN = 0, clientAmt = 0, clientBackSum = 0, clientBackN = 0, diffAmt = 0, diffBackSum = 0, diffBackN = 0;
  let anyOur = false, anyClient = false, anyDiff = false;
  for (const s of stones) {
    const carat = parseFloat(String(s.carat)) || 0;
    const ref = s.matchedStone || null;
    const our = ourMetrics(ref);
    const client = clientMetrics(s.priceType, Number(s.price) || 0, carat, ref);
    if (our.amount != null) { ourAmt += our.amount; anyOur = true; }
    if (our.back != null) { ourBackSum += our.back; ourBackN++; }
    if (client.amount != null) { clientAmt += client.amount; anyClient = true; }
    if (client.back != null) { clientBackSum += client.back; clientBackN++; }
    if (our.amount != null && client.amount != null) { diffAmt += client.amount - our.amount; anyDiff = true; }
    if (our.back != null && client.back != null) { diffBackSum += our.back - client.back; diffBackN++; }
  }
  return {
    ourAvgBack: ourBackN ? ourBackSum / ourBackN : null, ourTotalAmount: anyOur ? ourAmt : null,
    clientAvgBack: clientBackN ? clientBackSum / clientBackN : null, clientTotalAmount: anyClient ? clientAmt : null,
    diffAvgBack: diffBackN ? diffBackSum / diffBackN : null, diffTotalAmount: anyDiff ? diffAmt : null
  };
}

/** stones jsonb is empty for an ordinary single-stone offer — build the equivalent
 *  one-entry list from its legacy top-level columns, same as the frontend's
 *  stonesForOffer(). Takes a raw DB row (snake_case). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stonesForOfferRow(r: any): StoneEntry[] {
  if (r.stones && r.stones.length) return r.stones as StoneEntry[];
  const matched = (r.matched_stones && r.matched_stones[0]) || null;
  return [{
    shape: r.shape, carat: r.carat, color: r.color, clarity: r.clarity, cut: r.cut, cert: r.cert,
    priceType: r.price_type, price: Number(r.price), matchedStone: matched
  }];
}
