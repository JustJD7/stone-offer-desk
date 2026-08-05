import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import offersRouter from "./routes/offers.js";
import clientsRouter from "./routes/clients.js";
import inventoryRouter from "./routes/inventory.js";
import notificationsRouter from "./routes/notifications.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import activityRouter from "./routes/activity.js";
import { requireAuth, requireAdmin } from "./middleware/requireAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", false); // API responses change constantly — never let a 304 substitute for real data

// Inventory import chunks can be a few MB; default express.json() limit (100kb) is too small.
app.use(express.json({ limit: "20mb" }));

// Belt-and-suspenders alongside app.set("etag", false): make sure no proxy/browser
// caches these either, since a stale cached response would look identical to a fresh one.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/offers", requireAuth, offersRouter);
app.use("/api/clients", requireAuth, clientsRouter);
app.use("/api/inventory", requireAuth, inventoryRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);
app.use("/api/users", requireAdmin, usersRouter);
app.use("/api/activity", requireAuth, activityRouter);

app.use(express.static(publicDir, { etag: false, lastModified: false, cacheControl: false }));
app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
