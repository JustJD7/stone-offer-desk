# Stone Offer Desk — running on Vercel + GitHub

## Already done

- Code lives at `github.com/JustJD7/stone-offer-desk`, connected to a Vercel project.
- Database: Neon Postgres, schema already applied, reachable via the `DATABASE_URL` you set in Vercel.
- No login — the app opens directly for anyone with the URL.

## Whenever the code changes

I push commits to the GitHub repo; Vercel auto-deploys on every push to `main`. Nothing else to do on your end for code updates.

## Environment variables (Vercel → your project → Settings → Environment Variables)

Only one is required:

- **`DATABASE_URL`** — the Neon (or other Postgres) connection string.

Set it for the **Production** environment at minimum. After adding/changing it, trigger a redeploy (**Deployments** tab → **⋯** on the latest one → **Redeploy**) — env var changes don't apply to already-built deployments.

---

## Later: Gmail auto-refresh (Phase 2)

Still not wired up. This automates AutoMail inventory updates every 3 hours instead of using the manual "Upload" button in the Inventory tab. It needs:

1. A Google Cloud project with the Gmail API enabled and an OAuth2 client (your mailbox is Google Workspace, so this is the OAuth route, not a simple IMAP password — Workspace blocks that).
2. Running `scripts/gmail-auth.ts` once locally to get a refresh token.
3. Adding `DATABASE_URL`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (and optionally `GMAIL_SEARCH_QUERY`) as **GitHub Actions repo secrets** (Settings → Secrets and variables → Actions) — the ingestion worker (`worker/ingest-automail.ts`) runs on a GitHub Actions schedule (`.github/workflows/ingest-automail.yml`), not on Vercel, since Vercel's free tier can't run a job every 3 hours and a mailbox-fetch-and-parse job is a poor fit for a serverless function anyway.

I'll walk through the Google Cloud Console steps in detail when you're ready for this part.
