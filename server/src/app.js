import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createJsonStore } from "./storage.js";
import { hashPassword, verifyPassword, createSessions, createLoginLimiter } from "./auth.js";
import {
  checkOrder, checkStatusChange, checkSettings, newOrder, applyStatus, applyEdit, nextNumber,
  customerList, customerHistory, dashboard, filterOrders, DEFAULT_TEMPLATES,
} from "../../shared/core.js";

const isEmail = (s) => typeof s === "string" && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// `dataDir` is where users and orders are saved. `clientDir` is the built Vue app to serve, if it exists.
export async function createApp({ dataDir, clientDir, secret } = {}) {
  const db = createJsonStore(dataDir);

  // Session signing secret: env var, otherwise one generated and kept in the data folder.
  let sessionSecret = secret;
  if (!sessionSecret) {
    sessionSecret = (await db.read("secret.json", null))?.secret;
    if (!sessionSecret) {
      sessionSecret = randomBytes(32).toString("hex");
      await db.update("secret.json", {}, (s) => (s.secret = sessionSecret));
    }
  }
  const sessions = createSessions(sessionSecret);
  const limiter = createLoginLimiter();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "64kb" }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const publicUser = (u) => ({ id: u.id, name: u.name, shop: u.shop, email: u.email, templates: u.templates });
  const invalid = (res, fields) => res.status(400).json({ error: Object.values(fields)[0], fields });

  app.use(
    wrap(async (req, res, next) => {
      const session = sessions.read(req);
      if (session) req.user = (await db.read("users.json", [])).find((u) => u.id === session.uid);
      next();
    })
  );
  const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Please log in first." }));
  // Every order query goes through this, so a seller only ever sees their own orders.
  const myOrders = async (req) => (await db.read("orders.json", [])).filter((o) => o.sellerId === req.user.id);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // ---------- Accounts ----------
  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const { name, shop, email, password } = req.body || {};
      const fields = {};
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60) fields.name = "Enter your name.";
      if (typeof shop !== "string" || shop.trim().length < 2 || shop.trim().length > 40) fields.shop = "Enter your shop name.";
      if (!isEmail(cleanEmail)) fields.email = "Enter a valid email address.";
      if (typeof password !== "string" || password.length < 8 || password.length > 200) fields.password = "Use at least 8 characters.";
      if (Object.keys(fields).length) return invalid(res, fields);

      const passwordHash = await hashPassword(password);
      const user = await db.update("users.json", [], (list) => {
        if (list.some((u) => u.email === cleanEmail)) return null;
        const u = {
          id: randomUUID(), name: name.trim(), shop: shop.trim(), email: cleanEmail, passwordHash,
          templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString(),
        };
        list.push(u);
        return u;
      });
      if (!user) return invalid(res, { email: "An account with this email already exists. Log in instead." });
      sessions.issue(res, user);
      res.status(201).json({ user: publicUser(user) });
    })
  );

  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (limiter.blocked(req, email)) return res.status(429).json({ error: "Too many wrong passwords. Try again in 15 minutes." });
      const user = (await db.read("users.json", [])).find((u) => u.email === email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        limiter.fail(req, email);
        return res.status(401).json({ error: "Wrong email or password." });
      }
      limiter.reset(req, email);
      sessions.issue(res, user);
      res.json({ user: publicUser(user) });
    })
  );

  app.post("/api/auth/logout", (req, res) => {
    sessions.clear(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  app.put(
    "/api/settings",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkSettings(req.body);
      if (errors) return invalid(res, errors);
      const user = await db.update("users.json", [], (list) => Object.assign(list.find((u) => u.id === req.user.id), value));
      res.json({ user: publicUser(user) });
    })
  );

  // ---------- Orders ----------
  app.get(
    "/api/orders",
    requireUser,
    wrap(async (req, res) => res.json(filterOrders(await myOrders(req), { status: req.query.status, q: req.query.q })))
  );

  app.get(
    "/api/orders/:id",
    requireUser,
    wrap(async (req, res) => {
      const order = (await myOrders(req)).find((o) => o.id === req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found." });
      res.json(order);
    })
  );

  app.post(
    "/api/orders",
    requireUser,
    wrap(async (req, res) => {
      const { value, errors } = checkOrder(req.body);
      if (errors) return invalid(res, errors);
      const order = await db.update("orders.json", [], (list) => {
        const mine = list.filter((o) => o.sellerId === req.user.id);
        const o = newOrder(value, { id: randomUUID(), number: nextNumber(mine), sellerId: req.user.id });
        list.push(o);
        return o;
      });
      res.status(201).json(order);
    })
  );

  // Changes to an order: `edit` replaces the details, `status` moves it along.
  const changeOrder = (kind) =>
    wrap(async (req, res) => {
      const { value, errors } = kind === "edit" ? checkOrder(req.body) : checkStatusChange(req.body);
      if (errors) return invalid(res, errors);
      const order = await db.update("orders.json", [], (list) => {
        const o = list.find((x) => x.id === req.params.id && x.sellerId === req.user.id);
        return o ? (kind === "edit" ? applyEdit(o, value) : applyStatus(o, value)) : null;
      });
      if (!order) return res.status(404).json({ error: "Order not found." });
      res.json(order);
    });
  app.put("/api/orders/:id", requireUser, changeOrder("edit"));
  app.patch("/api/orders/:id", requireUser, changeOrder("status"));

  app.delete(
    "/api/orders/:id",
    requireUser,
    wrap(async (req, res) => {
      const removed = await db.update("orders.json", [], (list) => {
        const i = list.findIndex((o) => o.id === req.params.id && o.sellerId === req.user.id);
        return i === -1 ? false : (list.splice(i, 1), true);
      });
      if (!removed) return res.status(404).json({ error: "Order not found." });
      res.json({ ok: true });
    })
  );

  // ---------- Customers and dashboard ----------
  app.get("/api/customers", requireUser, wrap(async (req, res) => res.json(customerList(await myOrders(req)))));

  app.get(
    "/api/customers/:phone",
    requireUser,
    wrap(async (req, res) => {
      const history = customerHistory(await myOrders(req), req.params.phone);
      if (!history) return invalid(res, { phone: "Enter a Pakistani mobile number, like 0300 1234567." });
      res.json(history);
    })
  );

  app.get("/api/dashboard", requireUser, wrap(async (req, res) => res.json(dashboard(await myOrders(req)))));

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  // Serve the built Vue app in production.
  if (clientDir && existsSync(path.join(clientDir, "index.html"))) {
    app.use(express.static(clientDir, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });

  return app;
}
