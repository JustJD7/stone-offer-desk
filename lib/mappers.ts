/** DB row (snake_case) -> frontend JSON shape (camelCase), matching the shapes
 *  already used throughout offer-dashboard.html so the frontend needs minimal changes. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToOffer(r: any) {
  return {
    id: r.id, clientId: r.client_id, contact: r.contact, channel: r.channel, type: r.type,
    shape: r.shape, carat: r.carat, color: r.color, clarity: r.clarity, cut: r.cut, cert: r.cert,
    priceType: r.price_type, price: Number(r.price), priority: r.priority, status: r.status,
    notes: r.notes, thread: r.thread, matchedStones: r.matched_stones, unread: r.unread,
    createdByOffice: r.created_by_office, version: r.version,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToClient(r: any) {
  return { id: r.id, entityName: r.entity_name, country: r.country, stockCategory: r.stock_category, source: r.source, createdAt: r.created_at };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToStone(r: any) {
  return {
    stoneId: r.stone_id, shape: r.shape, weight: Number(r.weight), color: r.color, clarity: r.clarity,
    cut: r.cut, polish: r.polish, symmetry: r.symmetry, fluorescence: r.fluorescence, lab: r.lab,
    reportNo: r.report_no, rate: Number(r.rate), amt: Number(r.amt), rapRate: Number(r.rap_rate),
    rapAmt: Number(r.rap_amt), back: r.back, status: r.status, location: r.location, certDate: r.cert_date,
    imageLink: r.image_link, video: r.video, certFilename: r.cert_filename
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToNotification(r: any) {
  return { id: r.id, type: r.type, offerId: r.offer_id, text: r.text, read: r.read, ts: r.created_at };
}
