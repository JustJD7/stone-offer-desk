import { Router } from "express";
import { sql } from "../../lib/db";
import { rowToNotification } from "../../lib/mappers";

const router = Router();

router.get("/", async (req, res) => {  const [rows, unreadRows] = await Promise.all([
    sql`select * from notifications order by created_at desc limit 100`,
    sql`select count(*)::int as count from notifications where read = false`
  ]);
  res.status(200).json({ notifications: rows.map(rowToNotification), unreadCount: unreadRows[0].count });
});

router.post("/read-all", async (req, res) => {  await sql`update notifications set read = true where read = false`;
  res.status(200).json({ ok: true });
});

router.post("/:id/read", async (req, res) => {  const id = req.params.id;
  await sql`update notifications set read = true where id = ${id}`;
  res.status(200).json({ ok: true });
});

export default router;
