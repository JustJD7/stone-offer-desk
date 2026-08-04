# Stone Offer Desk

Live, multi-office version of the Offer Desk prototype (`G:\CRM\prototypes\offer-dashboard.html`): the same Kanban pipeline, negotiation threads, inventory browser, and client directory, now backed by a shared Postgres database instead of one browser's local storage.

There's no login — anyone with the app's URL can use it. Keep that URL and the repo's visibility in mind accordingly.

## Stack

- **Frontend:** `public/index.html` — a single static page (same UI as the prototype), talking to the API below instead of `localStorage`.
- **Server:** `server/app.ts` — a plain Express app serving both the API and the static frontend. `server/index.ts` runs it standalone (local dev, or any plain Node host); `api/index.ts` + `vercel.json` wrap the same app for Vercel's serverless runtime.
- **Database:** Postgres (`db/schema.sql`) — currently Neon; works with any standard Postgres.
- **AutoMail ingestion:** `worker/ingest-automail.ts`, run every 3 hours by `.github/workflows/ingest-automail.yml` on GitHub Actions (runs independently of wherever the app itself is hosted).

## Getting this running

See **[SETUP.md](./SETUP.md)** for the full step-by-step (Vercel + GitHub, and the Gmail OAuth setup for automatic inventory refresh).

## Local development

```
npm install
cp .env.example .env   # fill in DATABASE_URL
npm run dev             # runs the Express server with auto-restart on file changes
```

## Scripts

- `npm start` — run the server (what a plain Node host would run in production).
- `npm run gmail-auth` — one-time local OAuth flow to get a Gmail refresh token (see SETUP.md, Phase 2).
- `npm run ingest-automail` — run the AutoMail ingestion worker by hand (useful for testing before wiring up the scheduled GitHub Action).
