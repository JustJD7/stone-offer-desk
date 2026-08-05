# Stone Offer Desk — running on Vercel + GitHub

## Already done

- Code lives at `github.com/JustJD7/stone-offer-desk`, connected to a Vercel project.
- Database: Neon Postgres, schema already applied.
- Login required — name + password, per office/person. Three roles:
  - **user** — add/edit/remove offers; the Activity tab shows only their own actions.
  - **admin** — everything a user can do, plus the Admin panel (add/remove users, reset passwords), Excel export, and an Activity tab showing everyone's actions except the hidden superadmin's.
  - **superadmin** (hidden) — hidden from every user list and from admins' Activity tab entirely; view-only (can't create/edit/delete offers or post chat, so it never shows up as an offer's author) but sees literally everything, including admin activity. Credentials for this account were given to you directly, not stored in this repo.
- AutoMail inventory can be refreshed two ways:
  - **On demand:** the "🔄 Refresh from Email" button in the Inventory tab — fetches the newest `AutoMail.xlsx` from the mailbox's "Stock List" folder right now.
  - **Automatically, every hour:** a GitHub Actions workflow (`.github/workflows/ingest-automail.yml`) runs the same fetch unattended.

Both read from the "Stock List" folder in the mailbox — a Gmail filter already routes the recurring emails from `noreply@kgirdharlal.com` there, so the newest message in that folder is always the latest stock file.

## Whenever the code changes

I push commits to the GitHub repo; Vercel auto-deploys on every push to `main`. Nothing else to do on your end for code updates.

## Environment variables

**Vercel** (project → Settings → Environment Variables) — needed for the app itself, including the on-demand "Refresh from Email" button:
- **`DATABASE_URL`** — the Neon connection string.
- **`SESSION_SECRET`** — random string (32+ chars) that encrypts the login cookie. Already set locally in `.env`; add the same value in Vercel.
- **`GMAIL_ADDRESS`** — the mailbox address (`jaydeep@aspeco.ae`).
- **`GMAIL_APP_PASSWORD`** — the Gmail app password.

Set these for the **Production** environment at minimum, then redeploy (**Deployments** tab → **⋯** on the latest one → **Redeploy** — env var changes don't apply to already-built deployments).

**GitHub** (repo → Settings → Secrets and variables → Actions) — needed for the hourly automatic refresh:
- **`DATABASE_URL`**
- **`GMAIL_ADDRESS`**
- **`GMAIL_APP_PASSWORD`**

Same three values as above, just added as GitHub Actions secrets instead of Vercel variables — the hourly worker runs on GitHub's servers, not Vercel's.

To test the hourly job immediately instead of waiting: repo → **Actions** tab → "Ingest AutoMail inventory" → **Run workflow**. Check the run's log for `inventory refreshed successfully`.

One thing to keep in mind: GitHub automatically disables scheduled workflows in a repo after 60 days with no other activity (a push, PR, etc.) — if the hourly refresh silently stops, check the Actions tab and re-enable it there.
