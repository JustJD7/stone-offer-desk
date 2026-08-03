/**
 * Runs on a GitHub Actions schedule (see .github/workflows/ingest-automail.yml),
 * every 3 hours — NOT on Vercel, so it isn't bound by serverless request
 * timeouts or body-size limits. Finds the newest AutoMail .xlsx attachment in
 * the connected Gmail mailbox, parses it, and atomically replaces the live
 * `inventory` table.
 */
import "dotenv/config";
import { google, gmail_v1 } from "googleapis";
import { parseWorkbookBuffer, buildInventoryFromRows } from "../lib/xlsxParse";
import { stageAndSwapInventory } from "../lib/inventorySwap";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = requireEnv("GMAIL_REFRESH_TOKEN");
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function findXlsxPart(parts: gmail_v1.Schema$MessagePart[]): gmail_v1.Schema$MessagePart | undefined {
  for (const part of parts) {
    if (part.filename && /\.xlsx$/i.test(part.filename) && part.body?.attachmentId) return part;
    if (part.parts) {
      const found = findXlsxPart(part.parts);
      if (found) return found;
    }
  }
  return undefined;
}

function findHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = (headers || []).find((h) => (h.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

async function findLatestXlsxAttachment(
  gmail: gmail_v1.Gmail
): Promise<{ fileName: string; buffer: Buffer; subject: string }> {
  const query = process.env.GMAIL_SEARCH_QUERY || "has:attachment filename:xlsx";
  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 5 });
  const messages = list.data.messages || [];
  if (!messages.length) throw new Error(`No messages found matching Gmail search: "${query}"`);

  // messages.list returns newest-first; walk until one actually has a readable .xlsx part.
  for (const m of messages) {
    if (!m.id) continue;
    const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
    const parts = full.data.payload?.parts || [];
    const attachmentPart = findXlsxPart(parts);
    if (!attachmentPart?.body?.attachmentId) continue;

    const attachment = await gmail.users.messages.attachments.get({
      userId: "me", messageId: m.id, id: attachmentPart.body.attachmentId
    });
    if (!attachment.data.data) continue;

    return {
      fileName: attachmentPart.filename || "AutoMail.xlsx",
      buffer: Buffer.from(attachment.data.data, "base64url"),
      subject: findHeader(full.data.payload?.headers, "Subject")
    };
  }
  throw new Error(`Found ${messages.length} matching email(s) but none had a readable .xlsx attachment.`);
}

async function main() {
  console.log("[ingest-automail] starting…");
  const gmail = await getGmailClient();

  const { fileName, buffer, subject } = await findLatestXlsxAttachment(gmail);
  console.log(`[ingest-automail] found "${fileName}" (subject: "${subject}", ${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const { headers, rows } = parseWorkbookBuffer(buffer);
  if (!rows.length) throw new Error("Parsed workbook has no data rows — refusing to overwrite live inventory.");

  const stones = buildInventoryFromRows(headers, rows);
  console.log(`[ingest-automail] parsed ${stones.length} stones`);

  await stageAndSwapInventory(stones, { fileName, source: "gmail-worker" });
  console.log(`[ingest-automail] inventory refreshed successfully — ${stones.length} stones now live.`);
}

main().catch((err) => {
  console.error("[ingest-automail] FAILED:", err);
  process.exit(1);
});
