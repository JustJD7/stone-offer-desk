import { sql } from "./db";

/** Find a client by name (case-insensitive) or create it — mirrors the
 *  frontend's old resolveOrCreateClient, now done server-side so concurrent
 *  offices creating the same new client name converge on one row. */
export async function resolveOrCreateClient(name: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await sql`select id from clients where lower(entity_name) = lower(${trimmed})`;
  if (existing[0]) return existing[0].id as string;
  try {
    const inserted = await sql`insert into clients (entity_name, source) values (${trimmed}, 'manual') returning id`;
    return inserted[0].id as string;
  } catch {
    // Someone else inserted the same name in the tiny window above — fall back to it.
    const retry = await sql`select id from clients where lower(entity_name) = lower(${trimmed})`;
    if (retry[0]) return retry[0].id as string;
    throw new Error(`Could not resolve or create client "${trimmed}".`);
  }
}
