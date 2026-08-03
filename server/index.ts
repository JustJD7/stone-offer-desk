import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRouter from "./routes/auth";
import offersRouter from "./routes/offers";
import clientsRouter from "./routes/clients";
import inventoryRouter from "./routes/inventory";
import notificationsRouter from "./routes/notifications";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Railway/most PaaS sit behind a proxy — needed for correct secure-cookie handling
app.set("etag", false); // API responses are session-specific and always changing — never let a 304 substitute for real data

// Inventory import chunks can be a few MB; default express.json() limit (100kb) is too small.
app.use(express.json({ limit: "20mb" }));

// Belt-and-suspenders alongside app.set("etag", false): make sure no proxy/browser
// caches these either, since a stale cached response would look identical to a fresh one.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/offers", offersRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/notifications", notificationsRouter);

app.use(express.static(publicDir, { etag: false, lastModified: false, cacheControl: false }));
app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Stone Offer Desk listening on port ${port}`);
});
