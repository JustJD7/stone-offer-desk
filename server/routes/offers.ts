import { Router } from "express";
import { sql } from "../../lib/db";
import { rowToOffer } from "../../lib/mappers";
import { resolveOrCreateClient } from "../../lib/clients";

const router = Router();

interface ThreadMessage { author: "client" | "company"; message: string; ts: string; price?: number }
interface MatchedStone { stoneId: string; [key: string]: unknown }

router.get("/", async (_req, res) => {
  const rows = await sql`select * from offers order by created_at desc`;
  res.status(200).json({ offers: rows.map(rowToOffer) });
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clientName = String(body.clientName ?? "").trim();
  const type = String(body.type ?? "");
  const priceType = String(body.priceType ?? "");
  if (!clientName || (type !== "sell" && type !== "buy") || !["per_carat", "total", "back"].includes(priceType)) {
    res.status(400).json({ error: "clientName, a valid type, and a valid priceType are required." });
    return;
  }

  const clientId = await resolveOrCreateClient(clientName);
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
      ${JSON.stringify([initialMessage])}, ${JSON.stringify(matchedStones)}, true, 'shared'
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

  res.status(201).json({ offer });
});

router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as {
    version?: number; status?: string; priority?: boolean; markRead?: boolean;
    appendMessage?: ThreadMessage; matchedStonesAdd?: MatchedStone; matchedStonesRemove?: string;
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
    thread = [...thread, body.appendMessage];
    if (body.appendMessage.author === "client") unread = true;
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

  const updated = await sql`
    update offers set
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

  if (body.appendMessage && body.appendMessage.author === "client") {
    const clientRow = await sql`select c.entity_name from clients c join offers o on o.client_id = c.id where o.id = ${id}`;
    const entityName = (clientRow[0]?.entity_name as string) || "Client";
    await sql`
      insert into notifications (type, offer_id, text)
      values ('new_message', ${id}, ${entityName + ": " + String(body.appendMessage.message).slice(0, 80)})
    `;
  }

  res.status(200).json({ offer: rowToOffer(updated[0]) });
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  await sql`delete from notifications where offer_id = ${id}`;
  await sql`delete from offers where id = ${id}`;
  res.status(200).json({ ok: true });
});

export default router;
