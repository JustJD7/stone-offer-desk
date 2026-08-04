// Local dev / any plain Node host (e.g. Railway) entry point.
// Vercel doesn't use this file — see api/index.ts, which exports the same
// app from ./app for Vercel's serverless runtime to invoke directly.
import app from "./app.js";

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Stone Offer Desk listening on port ${port}`);
});
