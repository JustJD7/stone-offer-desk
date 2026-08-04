// Single Vercel serverless function wrapping the whole Express app (see
// server/app.ts). vercel.json rewrites every request here, so this one
// function handles both the API routes and serving public/index.html,
// exactly like the plain Node server does everywhere else.
//
// The app is imported lazily inside the handler (rather than
// `import app from "../server/app"` at the top) and any import-time crash
// is caught and returned as real JSON here — a startup exception thrown at
// module load normally just shows Vercel's generic FUNCTION_INVOCATION_FAILED
// with no detail, which made a real bug here impossible to diagnose remotely.
import type { IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<any> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!appPromise) appPromise = import("../server/app.js").then((m) => m.default);
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    appPromise = null; // don't cache a failed import — retry on the next request
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Startup crash", detail: message }));
  }
}
