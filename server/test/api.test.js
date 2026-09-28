import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { normalizePhone, fillTemplate, DEFAULT_TEMPLATES } from "../../shared/core.js";

let server, base, dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "sauda-test-"));
  const app = await createApp({ dataDir, secret: "test-secret" });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

// Tiny client that keeps its own session cookie, like one browser.
function client() {
  let cookie = "";
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  };
}

const order = ({ customer, ...over } = {}) => ({
  items: [{ name: "Lawn suit", qty: 2, price: 3500 }],
  delivery: 250,
  ...over,
  customer: { name: "Ayesha Khan", phone: "0300-1234567", city: "Lahore", address: "House 12, Street 4, Johar Town", ...customer },
});

let seq = 0;
async function seller() {
  const api = client();
  const r = await api("POST", "/auth/register", { name: "Sana", shop: "Sana Couture", email: `sana${++seq}@example.com`, password: "password123" });
  assert.equal(r.status, 201);
  return api;
}

test("phone numbers are normalised to 03XXXXXXXXX", () => {
  for (const p of ["0300 1234567", "+92 300 1234567", "923001234567", "3001234567", "0092-300-1234567"]) {
    assert.equal(normalizePhone(p), "03001234567");
  }
  assert.equal(normalizePhone("042 35761234"), "");
  assert.equal(normalizePhone("12345"), "");
});

test("orders need a login", async () => {
  const api = client();
  assert.equal((await api("GET", "/orders")).status, 401);
  assert.equal((await api("POST", "/orders", order())).status, 401);
});

test("register, log out and log back in", async () => {
  const api = client();
  const reg = await api("POST", "/auth/register", { name: "Ali", shop: "Ali Shoes", email: "Ali@Example.com", password: "password123" });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, "ali@example.com");
  assert.ok(reg.body.user.templates.confirm);
  assert.equal(reg.body.user.passwordHash, undefined);

  const dup = await api("POST", "/auth/register", { name: "Ali", shop: "Ali Shoes", email: "ali@example.com", password: "password123" });
  assert.equal(dup.status, 400);

  await api("POST", "/auth/logout");
  assert.equal((await api("GET", "/auth/me")).body.user, null);
  assert.equal((await api("POST", "/auth/login", { email: "ali@example.com", password: "wrong-pass" })).status, 401);
  const ok = await api("POST", "/auth/login", { email: "ALI@example.com", password: "password123" });
  assert.equal(ok.status, 200);
  assert.equal((await api("GET", "/auth/me")).body.user.shop, "Ali Shoes");
});

test("too many wrong passwords block the login", async () => {
  const api = client();
  await api("POST", "/auth/register", { name: "Zara", shop: "Zara Bakes", email: "zara@example.com", password: "password123" });
  const other = client();
  for (let i = 0; i < 5; i++) await other("POST", "/auth/login", { email: "zara@example.com", password: "nope-nope" });
  assert.equal((await other("POST", "/auth/login", { email: "zara@example.com", password: "password123" })).status, 429);
});

test("creating an order checks the fields and works out the total", async () => {
  const api = await seller();
  const bad = await api("POST", "/orders", order({ customer: { phone: "12345" }, items: [] }));
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.phone);
  assert.ok(bad.body.fields.items);

  const r = await api("POST", "/orders", order({ items: [{ name: "Lawn suit", qty: 2, price: 3500 }, { name: "Dupatta", qty: 1, price: "1200" }] }));
  assert.equal(r.status, 201);
  assert.equal(r.body.customer.phone, "03001234567");
  assert.equal(r.body.subtotal, 8200);
  assert.equal(r.body.total, 8450);
  assert.equal(r.body.status, "new");
  assert.equal(r.body.number, 1001);
  assert.equal((await api("POST", "/orders", order())).body.number, 1002);
});

test("sellers only see and change their own orders", async () => {
  const a = await seller();
  const b = await seller();
  const mine = (await a("POST", "/orders", order())).body;

  assert.equal((await b("GET", "/orders")).body.length, 0);
  assert.equal((await b("GET", `/orders/${mine.id}`)).status, 404);
  assert.equal((await b("PATCH", `/orders/${mine.id}`, { status: "cancelled" })).status, 404);
  assert.equal((await b("PUT", `/orders/${mine.id}`, order())).status, 404);
  assert.equal((await b("DELETE", `/orders/${mine.id}`)).status, 404);
  assert.equal((await b("GET", "/customers")).body.length, 0);
  assert.equal((await b("POST", "/orders", order())).body.number, 1001, "numbers are per seller");

  assert.equal((await a("GET", `/orders/${mine.id}`)).body.status, "new");
});

test("status changes keep courier, tracking and history", async () => {
  const api = await seller();
  const o = (await api("POST", "/orders", order())).body;
  assert.equal((await api("PATCH", `/orders/${o.id}`, { status: "lost" })).status, 400);
  await api("PATCH", `/orders/${o.id}`, { status: "confirmed" });
  const shipped = (await api("PATCH", `/orders/${o.id}`, { status: "shipped", courier: "TCS", tracking: "TCS-778812" })).body;
  assert.equal(shipped.courier, "TCS");
  assert.equal(shipped.tracking, "TCS-778812");
  assert.deepEqual(shipped.history.map((h) => h.status), ["new", "confirmed", "shipped"]);

  const edited = (await api("PUT", `/orders/${o.id}`, order({ delivery: 0 }))).body;
  assert.equal(edited.total, 7000);
  assert.equal(edited.status, "shipped", "editing details keeps the status");
  assert.equal(edited.tracking, "TCS-778812");

  assert.equal((await api("DELETE", `/orders/${o.id}`)).status, 200);
  assert.equal((await api("GET", `/orders/${o.id}`)).status, 404);
});

test("customer history flags numbers that refused parcels", async () => {
  const api = await seller();
  const risky = { customer: { phone: "0321 7654321", name: "Bilal" } };
  const first = (await api("POST", "/orders", order(risky))).body;
  const second = (await api("POST", "/orders", order(risky))).body;
  await api("PATCH", `/orders/${first.id}`, { status: "returned" });
  await api("PATCH", `/orders/${second.id}`, { status: "delivered" });

  let h = (await api("GET", "/customers/+923217654321")).body;
  assert.equal(h.orders, 2);
  assert.equal(h.returned, 1);
  assert.equal(h.risk, "high");
  assert.equal(h.recent.length, 2);

  h = (await api("GET", "/customers/03009998887")).body;
  assert.equal(h.risk, "new");
  assert.equal((await api("GET", "/customers/abc")).status, 400);

  const list = (await api("GET", "/customers")).body;
  assert.equal(list.find((c) => c.phone === "03217654321").spent, 7250);
});

test("search finds orders by name, phone, number and item", async () => {
  const api = await seller();
  const o = (await api("POST", "/orders", order({ customer: { name: "Hira Malik", phone: "0333 5556667" }, items: [{ name: "Silk scarf", qty: 1, price: 900 }] }))).body;
  await api("POST", "/orders", order());
  for (const q of ["hira", "03335556", "+92 333 555", String(o.number), "scarf"]) {
    const r = (await api("GET", `/orders?q=${encodeURIComponent(q)}`)).body;
    assert.equal(r.length, 1, q);
  }
  assert.equal((await api("GET", "/orders?status=new")).body.length, 2);
  assert.equal((await api("GET", "/orders?status=shipped")).body.length, 0);
});

test("dashboard counts today's orders, cash to collect and return rate", async () => {
  const api = await seller();
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await api("POST", "/orders", order())).body.id);
  await api("PATCH", `/orders/${ids[0]}`, { status: "shipped" });
  await api("PATCH", `/orders/${ids[1]}`, { status: "delivered" });
  await api("PATCH", `/orders/${ids[2]}`, { status: "returned" });
  const d = (await api("GET", "/dashboard")).body;
  assert.equal(d.today, 4);
  assert.equal(d.toConfirm, 1);
  assert.equal(d.cashToCollect, 7250);
  assert.equal(d.salesMonth, 7250);
  assert.equal(d.returnRate, 50);
  assert.equal(d.days.length, 14);
  assert.equal(d.days.at(-1).orders, 4);
});

test("settings update the shop name and message templates", async () => {
  const api = await seller();
  assert.equal((await api("PUT", "/settings", { shop: "", name: "Sana", templates: {} })).status, 400);
  const r = await api("PUT", "/settings", { shop: "Sana Studio", name: "Sana", templates: { ...DEFAULT_TEMPLATES, confirm: "Hi {name}, order #{number} = Rs {total}" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.shop, "Sana Studio");

  const o = (await api("POST", "/orders", order())).body;
  assert.equal(fillTemplate(r.body.user.templates.confirm, o, "Sana Studio"), "Hi Ayesha, order #1001 = Rs 7,250");
});
