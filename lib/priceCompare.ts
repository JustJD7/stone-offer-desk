/** Server-side mirror of the frontend's buildCompareTable() math (public/index.html),
 *  kept in sync manually since one is embedded HTML/JS and the other TS — used by
 *  the admin Excel export so the sheet matches exactly what the UI shows. */

export interface OfferLike {
  type: "sell" | "buy";
  priceType: "per_carat" | "total" | "back";
  price: number;
  carat: string | number;
  matchedStones?: Array<{ stoneId?: string; rate?: number; rapRate?: number; amt?: number }> | null;
}

export interface PriceComparison {
  stoneId: string | null;
  ourDiscountPct: number | null;
  ourRate: number | null;
  ourTotal: number | null;
  clientDiscountPct: number | null;
  clientRate: number | null;
  clientTotal: number | null;
  diffRate: number | null;
  diffTotal: number | null;
  favorable: boolean | null;
}

const EMPTY: PriceComparison = {
  stoneId: null, ourDiscountPct: null, ourRate: null, ourTotal: null,
  clientDiscountPct: null, clientRate: null, clientTotal: null,
  diffRate: null, diffTotal: null, favorable: null
};

export function compareOfferPrice(o: OfferLike): PriceComparison {
  const ref = (o.matchedStones && o.matchedStones[0]) || null;
  if (!ref || !ref.rapRate) return EMPTY;

  const carat = parseFloat(String(o.carat)) || 1;
  const ourRate = ref.rate ?? 0;
  const ourRap = ref.rapRate;
  const ourTotal = ref.amt || ourRate * carat;
  const ourDiscountPct = ourRap ? (1 - ourRate / ourRap) * 100 : null;

  let clientRate: number, clientTotal: number, clientDiscountPct: number | null;
  if (o.priceType === "back") {
    clientDiscountPct = -o.price;
    clientRate = ourRap * (1 + o.price / 100);
    clientTotal = clientRate * carat;
  } else if (o.priceType === "per_carat") {
    clientRate = o.price;
    clientTotal = clientRate * carat;
    clientDiscountPct = ourRap ? (1 - clientRate / ourRap) * 100 : null;
  } else {
    clientTotal = o.price;
    clientRate = clientTotal / carat;
    clientDiscountPct = ourRap ? (1 - clientRate / ourRap) * 100 : null;
  }

  const favorable = o.type === "buy" ? clientRate > ourRate : clientRate < ourRate;

  return {
    stoneId: ref.stoneId || null,
    ourDiscountPct, ourRate, ourTotal,
    clientDiscountPct, clientRate, clientTotal,
    diffRate: clientRate - ourRate, diffTotal: clientTotal - ourTotal,
    favorable
  };
}
