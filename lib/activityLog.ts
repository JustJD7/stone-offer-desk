import { sql } from "./db.js";
import type { UserRole } from "./session.js";

export interface LogActivityParams {
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  detail?: string;
  offerId?: string;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  await sql`
    insert into activity_log (actor_id, actor_name, actor_role, action, detail, offer_id)
    values (${params.actorId}, ${params.actorName}, ${params.actorRole}, ${params.action}, ${params.detail ?? ""}, ${params.offerId ?? null})
  `;
}
