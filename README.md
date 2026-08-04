# Stone Offer Desk

Live, multi-office version of the Offer Desk prototype (`G:\CRM\prototypes\offer-dashboard.html`): the same Kanban pipeline, negotiation threads, inventory browser, and client directory, now backed by a shared Postgres database instead of one browser's local storage.

There's no login — anyone with the app's URL can use it. Keep that URL and the repo's visibility in mind accordingly.

## Stack

- **Frontend:** `public/index.html` — a single static page (same UI as the prototype), talking to the API below instead of `localStorage`.
- **Server:** `server/app.ts` — a plain Express app serving both the API and the static frontend. `server/index.ts` runs it standalone (local dev, or any plain Node host); `api/index.ts` + `vercel.json` wrap the same app for Vercel's serverless runtime.
- **Database:** Postgres (`db/schema.sql`) — currently Neon; works with any standard Postgres.
- **AutoMail ingestion:** a Gmail mailbox (IMAP, `lib/gmailImap.ts`) with a filter routing the recurring "Stock List" emails into a folder of the same name. Refreshed either on demand (the Inventory tab's "🔄 Refresh from Email" button) or hourly via `worker/ingest-automail.ts`, run by `.github/workflows/ingest-automail.yml` on GitHub Actions (independent of wherever the app itself is hosted).

## Getting this running

See **[SETUP.md](./SETUP.md)** for the full step-by-step (Vercel + GitHub environment variables).

## Local development

```
npm install
cp .env.example .env   # fill in DATABASE_URL, GMAIL_ADDRESS, GMAIL_APP_PASSWORD
npm run dev             # runs the Express server with auto-restart on file changes
```

## Scripts

- `npm start` — run the server (what a plain Node host would run in production).
- `npm run ingest-automail` — run the AutoMail ingestion by hand (useful for testing outside the scheduled GitHub Action).
