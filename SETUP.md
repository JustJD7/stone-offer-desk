# Stone Offer Desk — going live with GitHub + Railway

## What's already done

- The app runs as a normal Node/Express server (`server/index.ts`) — no Vercel-specific code left.
- The database layer uses plain Postgres (`pg`), so it works with Railway's built-in Postgres (or Neon, or any Postgres).
- It's been tested locally end-to-end (login, create/edit/delete an offer, notifications) against a real database.

## What's left — and why it needs you

Creating accounts, authorizing a CLI, and linking GitHub↔Railway all require a human to click through at least one confirmation step (that's how these services verify a real person is doing it) — I can prepare everything up to that point, but these specific clicks have to be yours.

---

### 1. Create the GitHub repo (a few clicks)

1. Go to [github.com/new](https://github.com/new).
2. Name it anything (e.g. `stone-offer-desk`). Private or public, your choice.
3. **Do not** check "Add a README" or ".gitignore" — this project already has its own.
4. Click **Create repository**.
5. Copy the repo URL it shows you (looks like `https://github.com/<you>/stone-offer-desk.git`) and send it to me.

I'll then push all the code to it (I've already got it committed locally and ready to go).

### 2. Railway — connect the repo and add Postgres

1. Go to [railway.com](https://railway.com) → sign in with GitHub (using `jaydeep@aspeco.ae`) — this is the one-time authorization step only you can do, since it's Railway asking GitHub "can this person link their account."
2. **New Project → Deploy from GitHub repo** → pick the repo from step 1. Railway will detect it's a Node app automatically and start a build — let that first build fail or wait, it just needs one more thing:
3. In the same project, click **+ New → Database → Add PostgreSQL**. Railway provisions it in a few seconds.
4. Click into your app's service (not the Postgres one) → **Variables** tab → add:
   - `DATABASE_URL` → click "Add Reference" / use the variable picker to reference the Postgres service's connection string (Railway shows this as an autocomplete option once both services are in the same project — usually `${{Postgres.DATABASE_URL}}`).
   - `SESSION_SECRET` → any long random string (I can generate one for you to paste in).
5. Trigger a redeploy (Railway usually does this automatically after adding variables). Once it's green/live, Railway gives you a public URL like `https://stone-offer-desk-production.up.railway.app`.

### 3. Run the schema + create an office login

Once you have the Railway Postgres connection string (copy it from the Postgres service's **Connect** tab), send it to me (or save it into `stone-offer-desk/.env` as `DATABASE_URL=...` yourself) and I'll:
- Run `db/schema.sql` against it
- Create your first office login so you can test the live URL

### 4. Smoke test

Open the Railway URL, log in, create an offer, drag it across the pipeline, confirm the celebration fires when you mark one Accepted.

---

## Later: Gmail auto-refresh (Phase 2)

Unchanged from before — still needs the Google Cloud OAuth setup (Workspace mailbox, so it's the API/OAuth route, not IMAP). The ingestion worker (`worker/ingest-automail.ts`) runs on a GitHub Actions schedule regardless of whether the app itself is on Vercel or Railway, so nothing here changes once you're ready for it — just add `DATABASE_URL` (pointing at your Railway Postgres this time) and the `GMAIL_*` secrets as GitHub Actions repo secrets. I'll walk through the Google Cloud Console steps in detail when you're ready for this part.
