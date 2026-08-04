import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const AUTOMAIL_FOLDER = "Stock List";
const ATTACHMENT_NAME = "AutoMail.xlsx";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export interface FetchedAutoMail {
  buffer: Buffer;
  emailDate: Date;
  fileName: string;
}

/**
 * Connects to the mailbox via IMAP (app password auth — this Workspace tenant
 * allows it, confirmed working, unlike the general case) and grabs the
 * AutoMail.xlsx attachment from the newest message in the "Stock List" folder
 * — a Gmail filter already routes the recurring "Stock List" emails from
 * noreply@kgirdharlal.com there automatically.
 */
export async function fetchLatestAutoMail(): Promise<FetchedAutoMail> {
  const user = requireEnv("GMAIL_ADDRESS");
  const pass = requireEnv("GMAIL_APP_PASSWORD");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(AUTOMAIL_FOLDER);
    try {
      const uids = await client.search({ all: true }, { uid: true });
      if (!uids || !uids.length) throw new Error(`No messages found in the "${AUTOMAIL_FOLDER}" folder.`);
      const latestUid = uids[uids.length - 1];

      const { content } = await client.download(latestUid, undefined, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of content) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);

      const parsed = await simpleParser(raw);
      const attachment = parsed.attachments.find((a) => a.filename === ATTACHMENT_NAME);
      if (!attachment) {
        throw new Error(`Newest message in "${AUTOMAIL_FOLDER}" has no ${ATTACHMENT_NAME} attachment.`);
      }

      return {
        buffer: attachment.content as Buffer,
        emailDate: parsed.date ?? new Date(),
        fileName: attachment.filename ?? ATTACHMENT_NAME
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
