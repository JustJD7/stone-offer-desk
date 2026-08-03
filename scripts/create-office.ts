/**
 * One-off CLI to add (or update) an office login.
 *
 * Usage:
 *   npm run create-office -- --username=mumbai --password="a strong password" --display="Mumbai Office"
 *
 * Requires DATABASE_URL to be set (e.g. via a local .env loaded through `vercel env pull`,
 * or exported in your shell before running this).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "../lib/db";

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { username, password, display } = parseArgs();
  if (!username || !password) {
    console.error('Usage: npm run create-office -- --username=<name> --password=<password> [--display="Display Name"]');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const displayName = display || username;
  await sql`
    insert into offices (username, password_hash, display_name)
    values (${username}, ${hash}, ${displayName})
    on conflict (username) do update set password_hash = excluded.password_hash, display_name = excluded.display_name
  `;
  console.log(`Office "${username}" created/updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
