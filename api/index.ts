// Single Vercel serverless function wrapping the whole Express app (see
// server/app.ts). vercel.json rewrites every request here, so this one
// function handles both the API routes and serving public/index.html,
// exactly like the plain Node server does everywhere else.
import app from "../server/app";

export default app;
