/**
 * One-time local helper: run this once from your own machine to obtain the
 * Gmail refresh token the GitHub Actions worker needs.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run gmail-auth
 *
 * Requires the OAuth client (created in Google Cloud Console) to have
 * http://127.0.0.1 listed as an authorized redirect URI (see the setup guide).
 */
import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

async function main() {
  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"]
  });

  console.log("\nOpen this URL in a browser, signed into the mailbox that receives AutoMail, and approve access:\n");
  console.log(authUrl + "\n");
  console.log(`Waiting for the redirect back to ${REDIRECT_URI} ...\n`);

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", REDIRECT_URI);
      const c = url.searchParams.get("code");
      const errParam = url.searchParams.get("error");
      res.end(c ? "Signed in — you can close this tab and return to the terminal." : "Something went wrong — check the terminal.");
      server.close();
      if (c) resolve(c);
      else reject(new Error(errParam || "No authorization code received."));
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token was returned — Google only issues one on first consent. " +
      "Revoke this app's access at https://myaccount.google.com/permissions and run this again."
    );
  }

  console.log("\nSuccess! Save this as the GMAIL_REFRESH_TOKEN secret in your GitHub repo settings:\n");
  console.log(tokens.refresh_token + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
