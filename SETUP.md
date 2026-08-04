# Stone Offer Desk — running on Vercel + GitHub

## Already done

- Code lives at `github.com/JustJD7/stone-offer-desk`, connected to a Vercel project.
- Database: Neon Postgres, schema already applied.
- No login — the app opens directly for anyone with the URL.
- AutoMail inventory can be refreshed two ways:
  - **On demand:** the "🔄 Refresh from Email" button in the Inventory tab — fetches the newest `AutoMail.xlsx` from the mailbox's "Stock List" folder right now.
  - **Automatically, every hour:** a GitHub Actions workflow (`.github/workflows/ingest-automail.yml`) runs the same fetch unattended.

Both read from the "Stock List" folder in the mailbox — a Gmail filter already routes the recurring emails from `noreply@kgirdharlal.com` there, so the newest message in that folder is always the latest stock file.

## Whenever the code changes

I push commits to the GitHub repo; Vercel auto-deploys on every push to `main`. Nothing else to do on your end for code updates.

## Environment variables

**Vercel** (project → Settings → Environment Variables) — needed for the app itself, including the on-demand "Refresh from Email" button:
- **`DATABASE_URL`** — the Neon connection string.
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
