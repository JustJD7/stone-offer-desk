import { Router } from "express";
import { sql } from "../../lib/db.js";

const router = Router();

function rowToActivity(r: any) {
  return {
    id: r.id, actorName: r.actor_name, actorRole: r.actor_role,
    action: r.action, detail: r.detail, offerId: r.offer_id, ts: r.created_at
  };
}

router.get("/", async (req, res) => {
  const role = req.user!.role;
  let rows;
  if (role === "superadmin") {
    rows = await sql`select * from activity_log order by created_at desc limit 300`;
  } else if (role === "admin") {
    rows = await sql`select * from activity_log where actor_role != 'superadmin' order by created_at desc limit 300`;
  } else {
    rows = await sql`select * from activity_log where actor_id = ${req.user!.id} order by created_at desc limit 300`;
  }
  res.status(200).json({ activity: rows.map(rowToActivity) });
});

export default router;
