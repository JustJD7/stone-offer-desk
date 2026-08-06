import { Router } from "express";
import * as XLSX from "xlsx";
import { sql } from "../../lib/db.js";
import { rowToOffer } from "../../lib/mappers.js";
import { resolveOrCreateClient } from "../../lib/clients.js";
import { compareOfferPrice } from "../../lib/priceCompare.js";
import { requireAdmin, blockSuperadmin } from "../middleware/requireAuth.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

interface ThreadMessage { author: "client" | "company"; message: string; ts: string; price?: number; by?: string }
interface MatchedStone { stoneId: string; rate?: number; rapRate?: number; amt?: number; [key: string]: unknown }

function formatThreadForExport(thread: ThreadMessage[] | null | undefined): string {
  return (thread ?? []).map((m) => {
    const who = m.author === "company" ? (m.by || "Company") : "Client";
    const ts = new Date(m.ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const price = m.price != null ? ` [${m.price}]` : "";
    return `${ts} - ${who}: ${m.message}${price}`;
  }).join("\n");
}

interface StoneEntry { shape: string; carat: string; priceType: string; price: number; matchedStone: MatchedStone | null }

/** Mirrors the frontend's effectiveValue() per-stone math (public/index.html) —
 *  used so a multi-stone offer's export row totals what the app shows, since
 *  compareOfferPrice only knows how to compare a single stone against a single ref. */
function stoneEffectiveValue(s: StoneEntry): number {
  const carat = parseFloat(s.carat) || 1;
  if (s.priceType === "total") return s.price;
  if (s.priceType === "per_carat") return s.price * carat;
  if (s.priceType === "back" && s.matchedStone?.rapRate) return s.matchedStone.rapRate * (1 + s.price / 100) * carat;
  return 0;
}

router.get("/", async (_req, res) => {
  const rows = await sql`select * from offers order by created_at desc`;
  res.status(200).json({ offers: rows.map(rowToOffer) });
});

// Must come before "/:id"-style routes so "export" isn't treated as an id.
router.get("/export", requireAdmin, async (_req, res) => {
  const rows = await sql`
    select o.*, c.entity_name, c.country
    from offers o left join clients c on c.id = o.client_id
    order by o.created_at desc
  `;

  const header = [
    "Client", "Country", "Type", "Status", "Priority", "Shape", "Carat", "Color", "Clarity", "Cut", "Certificate",
    "Channel", "Contact", "Price Type", "Price (as entered)", "Matched Stone ID",
    "Our Discount %", "Our Rate/ct", "Our Total", "Client Discount %", "Client Rate/ct", "Client Total",
    "Diff Rate/ct", "Diff Total", "Favorable to Us", "Created By", "Created At", "Notes", "Negotiation Thread"
  ];

  const body = rows.map((r: any) => {
    const stones = (r.stones ?? []) as StoneEntry[];
    if (stones.length > 1) {
      // Multi-stone offer: compareOfferPrice only compares one stone against one ref,
      // so a mixed bag of stones just gets a total instead of a per-stone discount/rate breakdown.
      const totalCarat = stones.reduce((sum, s) => sum + (parseFloat(s.carat) || 0), 0);
      const totalValue = stones.reduce((sum, s) => sum + stoneEffectiveValue(s), 0);
      return [
        r.entity_name || "", r.country || "", r.type, r.status, r.priority ? "Yes" : "No",
        `${stones.length} stones: ${stones.map((s) => `${s.shape} ${s.carat}ct`).join(", ")}`,
        Number(totalCarat.toFixed(2)), "", "", "", "",
        r.channel || "", r.contact || "", "total", Number(totalValue.toFixed(2)),
        "", "", "", "", "", "", "", "", "", "",
        r.created_by_office || "", new Date(r.created_at).toISOString(), r.notes || "",
        formatThreadForExport(r.thread)
      ];
    }
    const cmp = compareOfferPrice({ type: r.type, priceType: r.price_type, price: Number(r.price), carat: r.carat, matchedStones: r.matched_stones });
    return [
      r.entity_name || "", r.country || "", r.type, r.status, r.priority ? "Yes" : "No",
      r.shape || "", r.carat || "", r.color || "", r.clarity || "", r.cut || "", r.cert || "",
      r.channel || "", r.contact || "", r.price_type, Number(r.price),
      cmp.stoneId || "",
      cmp.ourDiscountPct != null ? Number(cmp.ourDiscountPct.toFixed(2)) : "",
      cmp.ourRate != null ? Number(cmp.ourRate.toFixed(2)) : "",
      cmp.ourTotal != null ? Number(cmp.ourTotal.toFixed(2)) : "",
      cmp.clientDiscountPct != null ? Number(cmp.clientDiscountPct.toFixed(2)) : "",
      cmp.clientRate != null ? Number(cmp.clientRate.toFixed(2)) : "",
      cmp.clientTotal != null ? Number(cmp.clientTotal.toFixed(2)) : "",
      cmp.diffRate != null ? Number(cmp.diffRate.toFixed(2)) : "",
      cmp.diffTotal != null ? Number(cmp.diffTotal.toFixed(2)) : "",
      cmp.favorable == null ? "" : (cmp.favorable ? "Yes" : "No"),
      r.created_by_office || "", new Date(r.created_at).toISOString(), r.notes || "",
      formatThreadForExport(r.thread)
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Offers");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  res.status(200)
    .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set("Content-Disposition", `attachment; filename="offers-export-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    .send(buffer);
});

// One client, one or more stones in a single submission — all stones land in a
// single offer row. With exactly one stone this is indistinguishable from a
// plain single-stone offer (the legacy shape/carat/.../price columns carry
// that one stone's data and `stones` stays empty). With more than one, those
// legacy columns mirror the first stone (so any code that doesn't know about
// `stones` yet still degrades to something sensible) and the full list lives
// in the `stones` jsonb column — see rowToOffer/renderDetail's multi-stone branch.
router.post("/batch", blockSuperadmin, async (req, res) => {
  const body = (req.body ?? {}) as {
    clientName?: string; contact?: string; channel?: string; type?: string; notes?: string; priority?: boolean;
    stones?: Array<{
      shape?: string; carat?: string; color?: string; clarity?: string; cut?: string; cert?: string;
      priceType?: string; price?: number; matchedStone?: MatchedStone | null;
    }>;
  };
  const clientName = String(body.clientName ?? "").trim();
  const type = String(body.type ?? "");
  const stones = Array.isArray(body.stones) ? body.stones : [];
  if (!clientName || (type !== "sell" && type !== "buy") || !stones.length) {
    res.status(400).json({ error: "clientName, a valid type, and at least one stone are required." });
    return;
  }
  for (const s of stones) {
    if (!["per_carat", "total", "back"].includes(String(s.priceType))) {
      res.status(400).json({ error: "Each stone needs a valid price type." });
      return;
    }
  }

  const clientId = await resolveOrCreateClient(clientName);
  const createdByOffice = req.user!.name;
  const createdAt = new Date().toISOString();

  const stonesJson = stones.map((s) => ({
    shape: String(s.shape ?? ""), carat: String(s.carat ?? ""), color: String(s.color ?? ""), clarity: String(s.clarity ?? ""),
    cut: String(s.cut ?? ""), cert: String(s.cert ?? ""), priceType: s.priceType, price: Number(s.price) || 0,
    matchedStone: s.matchedStone ?? null
  }));
  const first = stonesJson[0];
  const matchedStones = stonesJson.filter((s) => s.matchedStone).map((s) => s.matchedStone);
  const stoneList = stonesJson.map((s) => `${s.shape} ${s.carat}ct`).join(", ");
  const initialMessage: ThreadMessage = {
    author: "client", ts: createdAt,
    message: stonesJson.length > 1
      ? `${type === "sell" ? "New stones offered: " : "New requirements: "}${stonesJson.length} stones — ${stoneList}.`
      : `${type === "sell" ? "New stone offered: " : "New requirement: "}${first.shape} ${first.carat}ct, ${first.color}/${first.clarity || "—"}.`
  };

  const inserted = await sql`
    insert into offers (
      client_id, contact, channel, type, shape, carat, color, clarity, cut, cert,
      price_type, price, priority, status, notes, thread, matched_stones, stones, unread, created_by_office
    ) values (
      ${clientId}, ${String(body.contact ?? "")}, ${String(body.channel ?? "")}, ${type},
      ${first.shape}, ${first.carat}, ${first.color}, ${first.clarity}, ${first.cut}, ${first.cert},
      ${first.priceType}, ${first.price}, ${!!body.priority}, 'new', ${String(body.notes ?? "")},
      ${JSON.stringify([initialMessage])}, ${JSON.stringify(matchedStones)},
      ${stonesJson.length > 1 ? JSON.stringify(stonesJson) : "[]"}, true, ${createdByOffice}
    )
    returning *
  `;
  const offer = rowToOffer(inserted[0]);

  const clientRow = await sql`select entity_name from clients where id = ${clientId}`;
  const entityName = (clientRow[0]?.entity_name as string) || "client";
  await sql`
    insert into notifications (type, offer_id, text)
    values ('new_offer', ${offer.id}, ${
      "New " + (stonesJson.length > 1 ? `offer (${stonesJson.length} stones)` : "offer") + " from " + entityName
    })
  `;
  await logActivity({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "offer_created",
    detail: `${entityName} — ${stonesJson.length > 1 ? `${stonesJson.length} stones (${stoneList})` : `${first.shape} ${first.carat}ct`}`,
    offerId: offer.id
  });

  res.status(201).json({ offer });
});

router.post("/", blockSuperadmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientName = String(body.clientName ?? "").trim();
  const type = String(body.type ?? "");
  const priceType = String(body.priceType ?? "");
  if (!clientName || (type !== "sell" && type !== "buy") || !["per_carat", "total", "back"].includes(priceType)) {
    res.status(400).json({ error: "clientName, a valid type, and a valid priceType are required." });
    return;
  }

  const clientId = await resolveOrCreateClient(clientName);
  const createdByOffice = req.user!.name;
  const createdAt = new Date().toISOString();
  const shape = String(body.shape ?? ""), carat = String(body.carat ?? ""), color = String(body.color ?? ""), clarity = String(body.clarity ?? "");
  const initialMessage: ThreadMessage = {
    author: "client", ts: createdAt,
    message: `${type === "sell" ? "New stone offered: " : "New requirement: "}${shape} ${carat}ct, ${color}/${clarity || "—"}.`
  };
  const matchedStones = Array.isArray(body.matchedStones) ? body.matchedStones : [];

  const rows = await sql`
    insert into offers (
      client_id, contact, channel, type, shape, carat, color, clarity, cut, cert,
      price_type, price, priority, status, notes, thread, matched_stones, unread, created_by_office
    ) values (
      ${clientId}, ${String(body.contact ?? "")}, ${String(body.channel ?? "")}, ${type},
      ${shape}, ${carat}, ${color}, ${clarity}, ${String(body.cut ?? "")}, ${String(body.cert ?? "")},
      ${priceType}, ${Number(body.price) || 0}, ${!!body.priority}, 'new', ${String(body.notes ?? "")},
      ${JSON.stringify([initialMessage])}, ${JSON.stringify(matchedStones)}, true, ${createdByOffice}
    )
    returning *
  `;
  const offer = rowToOffer(rows[0]);

  const clientRow = await sql`select entity_name from clients where id = ${clientId}`;
  const entityName = (clientRow[0]?.entity_name as string) || "client";
  await sql`
    insert into notifications (type, offer_id, text)
    values ('new_offer', ${offer.id}, ${"New offer from " + entityName + " — " + shape + " " + carat + "ct"})
  `;
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "offer_created", detail: `${entityName} — ${shape} ${carat}ct`, offerId: offer.id });

  res.status(201).json({ offer });
});

router.patch("/:id", blockSuperadmin, async (req, res) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as {
    version?: number; status?: string; priority?: boolean; markRead?: boolean;
    appendMessage?: ThreadMessage; matchedStonesAdd?: MatchedStone; matchedStonesRemove?: string;
    clientName?: string; contact?: string; channel?: string; type?: string;
    shape?: string; carat?: string; color?: string; clarity?: string; cut?: string; cert?: string;
    priceType?: string; price?: number; notes?: string;
  };

  const current = await sql`select * from offers where id = ${id}`;
  const row = current[0];
  if (!row) { res.status(404).json({ error: "Offer not found" }); return; }

  if (body.version !== undefined && Number(body.version) !== row.version) {
    res.status(409).json({ error: "This offer was changed by someone else — reload it.", offer: rowToOffer(row) });
    return;
  }

  let thread = (row.thread as ThreadMessage[]) ?? [];
  let unread = row.unread as boolean;
  if (body.appendMessage) {
    const entry = { ...body.appendMessage };
    if (entry.author === "company") entry.by = req.user!.name;
    thread = [...thread, entry];
    // Any new message is activity another office needs to see, not just client replies.
    unread = true;
  }

  let matchedStones = (row.matched_stones as MatchedStone[]) ?? [];
  if (body.matchedStonesAdd) {
    if (!matchedStones.some((m) => m.stoneId === body.matchedStonesAdd!.stoneId)) {
      matchedStones = [...matchedStones, body.matchedStonesAdd];
    }
  }
  if (body.matchedStonesRemove) {
    matchedStones = matchedStones.filter((m) => m.stoneId !== body.matchedStonesRemove);
  }

  const status = body.status ?? row.status;
  const priority = body.priority ?? row.priority;
  if (body.markRead) unread = false;

  let clientId = row.client_id;
  if (body.clientName !== undefined && body.clientName.trim()) {
    clientId = await resolveOrCreateClient(body.clientName.trim());
  }
  const type = body.type !== undefined ? body.type : row.type;
  const priceType = body.priceType !== undefined ? body.priceType : row.price_type;
  const price = body.price !== undefined ? Number(body.price) || 0 : row.price;
  const shape = body.shape !== undefined ? body.shape : row.shape;
  const carat = body.carat !== undefined ? body.carat : row.carat;
  const color = body.color !== undefined ? body.color : row.color;
  const clarity = body.clarity !== undefined ? body.clarity : row.clarity;
  const cut = body.cut !== undefined ? body.cut : row.cut;
  const cert = body.cert !== undefined ? body.cert : row.cert;
  const contact = body.contact !== undefined ? body.contact : row.contact;
  const channel = body.channel !== undefined ? body.channel : row.channel;
  const notes = body.notes !== undefined ? body.notes : row.notes;

  const updated = await sql`
    update offers set
      client_id = ${clientId}, type = ${type}, price_type = ${priceType}, price = ${price},
      shape = ${shape}, carat = ${carat}, color = ${color}, clarity = ${clarity}, cut = ${cut}, cert = ${cert},
      contact = ${contact}, channel = ${channel}, notes = ${notes},
      status = ${status}, priority = ${priority}, thread = ${JSON.stringify(thread)},
      matched_stones = ${JSON.stringify(matchedStones)}, unread = ${unread},
      version = version + 1, updated_at = now()
    where id = ${id} and version = ${row.version}
    returning *
  `;
  if (!updated[0]) {
    res.status(409).json({ error: "This offer was changed by someone else — reload it." });
    return;
  }

  if (body.appendMessage) {
    const clientRow = await sql`select c.entity_name from clients c join offers o on o.client_id = c.id where o.id = ${id}`;
    const entityName = (clientRow[0]?.entity_name as string) || "Client";
    const byName = body.appendMessage.author === "company" ? req.user!.name : "Client";
    await sql`
      insert into notifications (type, offer_id, text)
      values ('new_message', ${id}, ${byName + " on " + entityName + ": " + String(body.appendMessage.message).slice(0, 80)})
    `;
    await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "message_posted", detail: String(body.appendMessage.message).slice(0, 120), offerId: id });
  } else if (body.status !== undefined && body.status !== row.status) {
    await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "offer_status_changed", detail: `${row.status} → ${status}`, offerId: id });
  } else if (
    body.clientName !== undefined || body.contact !== undefined || body.channel !== undefined || body.type !== undefined ||
    body.shape !== undefined || body.carat !== undefined || body.color !== undefined || body.clarity !== undefined ||
    body.cut !== undefined || body.cert !== undefined || body.priceType !== undefined || body.price !== undefined || body.notes !== undefined
  ) {
    await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "offer_edited", detail: `${shape} ${carat}ct`, offerId: id });
  }

  res.status(200).json({ offer: rowToOffer(updated[0]) });
});

router.delete("/:id", blockSuperadmin, async (req, res) => {
  const id = req.params.id;
  const existing = await sql`select o.shape, o.carat, c.entity_name from offers o left join clients c on c.id = o.client_id where o.id = ${id}`;
  await sql`delete from notifications where offer_id = ${id}`;
  await sql`delete from offers where id = ${id}`;
  const e = existing[0];
  await logActivity({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: "offer_deleted", detail: e ? `${e.entity_name || "Unknown client"} — ${e.shape} ${e.carat}ct` : "" });
  res.status(200).json({ ok: true });
});

export default router;
