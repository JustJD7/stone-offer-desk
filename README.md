# Stone Offer Desk

Live, multi-office version of the Offer Desk prototype (`G:\CRM\prototypes\offer-dashboard.html`): the same Kanban pipeline, negotiation threads, inventory browser, and client directory, now backed by a shared Postgres database instead of one browser's local storage.

## Stack

- **Frontend:** `public/index.html` — a single static page (same UI as the prototype), talking to the API below instead of `localStorage`.
- **Server:** `server/index.ts` + `server/routes/*.ts` — a plain Node/Express server, serving both the API and the static frontend.
- **Database:** Postgres (`db/schema.sql`) — works with Railway's built-in Postgres, Neon, or any standard Postgres.
- **AutoMail ingestion:** `worker/ingest-automail.ts`, run every 3 hours by `.github/workflows/ingest-automail.yml` on GitHub Actions (runs independently of wherever the app itself is hosted).

## Getting this running

See **[SETUP.md](./SETUP.md)** for the full step-by-step (GitHub, Railway, and the Gmail OAuth setup for automatic inventory refresh).

## Local development

```
npm install
cp .env.example .env   # fill in DATABASE_URL and SESSION_SECRET
npm run create-office -- --username=demo --password=demo1234 --display="Demo Office"
npm run dev             # runs the Express server with auto-restart on file changes
```

## Scripts

- `npm start` — run the server (what Railway runs in production).
- `npm run create-office -- --username=... --password=... [--display="..."]` — add/update an office login.
- `npm run gmail-auth` — one-time local OAuth flow to get a Gmail refresh token (see SETUP.md, Phase 2).
- `npm run ingest-automail` — run the AutoMail ingestion worker by hand (useful for testing before wiring up the scheduled GitHub Action).
