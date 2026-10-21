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

// ---------- Stock and cost ----------
const product = (over = {}) => ({ name: "Lawn suit", price: 3500, cost: 2000, stock: 10, lowStock: 3, ...over });
const stockOf = async (api, id) => (await api("GET", `/products/${id}`)).body.stock;

test("products check their fields and names are unique per seller", async () => {
  const api = await seller();
  const bad = await api("POST", "/products", { name: "", price: "", cost: -5, stock: 2.5 });
  assert.equal(bad.status, 400);
  for (const f of ["name", "price", "cost", "stock"]) assert.ok(bad.body.fields[f], f);

  const p = await api("POST", "/products", product());
  assert.equal(p.status, 201);
  assert.equal(p.body.stock, 10);
  assert.equal(p.body.level, "ok");
  assert.deepEqual(p.body.moves.map((m) => [m.reason, m.change]), [["start", 10]]);

  assert.ok((await api("POST", "/products", product({ name: " lawn  SUIT " }))).body.fields.name);
  const other = (await api("POST", "/products", product({ name: "Dupatta" }))).body;
  assert.equal((await api("PUT", `/products/${other.id}`, product({ name: "Lawn suit" }))).status, 400);

  // Editing changes the details but never the stock count.
  const edited = (await api("PUT", `/products/${p.body.id}`, product({ price: 3800, stock: 999 }))).body;
  assert.equal(edited.price, 3800);
  assert.equal(edited.stock, 10);

  const list = (await api("GET", "/products")).body;
  assert.deepEqual(list.map((x) => x.name), ["Dupatta", "Lawn suit"]);
  assert.equal(list[0].moves, undefined, "the list leaves out the stock log");

  assert.equal((await api("DELETE", `/products/${other.id}`)).status, 200);
  assert.equal((await api("GET", `/products/${other.id}`)).status, 404);
});

test("sellers only see and change their own products", async () => {
  const a = await seller();
  const b = await seller();
  const p = (await a("POST", "/products", product())).body;
  assert.equal((await b("GET", "/products")).body.length, 0);
  assert.equal((await b("GET", `/products/${p.id}`)).status, 404);
  assert.equal((await b("PUT", `/products/${p.id}`, product())).status, 404);
  assert.equal((await b("POST", `/products/${p.id}/stock`, { add: 5 })).status, 404);
  assert.equal((await b("DELETE", `/products/${p.id}`)).status, 404);
  assert.equal((await b("POST", "/products", product())).status, 201, "names are unique per seller only");

  // Another seller's product id on an order is ignored: no link, no cost, no stock taken.
  const o = (await b("POST", "/orders", order({ items: [{ name: "Lawn suit", qty: 2, price: 3500, productId: p.id }] }))).body;
  assert.equal(o.items[0].productId, undefined);
  assert.equal(o.items[0].cost, undefined);
  assert.equal(await stockOf(a, p.id), 10);
});

test("receiving, taking out and counting stock are logged", async () => {
  const api = await seller();
  const p = (await api("POST", "/products", product({ stock: 4 }))).body;
  assert.equal((await api("POST", `/products/${p.id}/stock`, { add: 0 })).status, 400);
  assert.equal((await api("POST", `/products/${p.id}/stock`, { count: -1 })).status, 400);

  assert.equal((await api("POST", `/products/${p.id}/stock`, { add: 6 })).body.stock, 10);
  assert.equal((await api("POST", `/products/${p.id}/stock`, { add: -2 })).body.stock, 8);
  const counted = (await api("POST", `/products/${p.id}/stock`, { count: 2 })).body;
  assert.equal(counted.stock, 2);
  assert.equal(counted.level, "low");
  assert.deepEqual(
    counted.moves.map((m) => [m.reason, m.change, m.stock]),
    [["count", -6, 2], ["remove", -2, 8], ["restock", 6, 10], ["start", 4, 4]]
  );
  assert.equal((await api("POST", `/products/${p.id}/stock`, { count: 0 })).body.level, "out");
});

test("orders take stock and give it back when cancelled, returned, edited or deleted", async () => {
  const api = await seller();
  const p = (await api("POST", "/products", product())).body;
  const items = (qty) => [{ name: "Lawn suit", qty, price: 3500, productId: p.id }, { name: "Gift wrap", qty: 1, price: 100 }];

  const o = (await api("POST", "/orders", order({ items: items(2) }))).body;
  assert.equal(o.items[0].cost, 2000, "the order keeps the cost from the day it was placed");
  assert.equal(o.items[1].productId, undefined);
  assert.equal(await stockOf(api, p.id), 8);

  await api("PATCH", `/orders/${o.id}`, { status: "confirmed" });
  assert.equal(await stockOf(api, p.id), 8, "moving along doesn't take stock twice");
  await api("PATCH", `/orders/${o.id}`, { status: "cancelled" });
  assert.equal(await stockOf(api, p.id), 10);
  await api("PATCH", `/orders/${o.id}`, { status: "new" });
  assert.equal(await stockOf(api, p.id), 8, "reopening takes it again");

  // A later cost change doesn't rewrite this order's cost, even when it is edited.
  await api("PUT", `/products/${p.id}`, product({ cost: 2500 }));
  const edited = (await api("PUT", `/orders/${o.id}`, order({ items: items(5) }))).body;
  assert.equal(edited.items[0].cost, 2000);
  assert.equal(await stockOf(api, p.id), 5);

  await api("PATCH", `/orders/${o.id}`, { status: "shipped" });
  await api("PATCH", `/orders/${o.id}`, { status: "returned" });
  assert.equal(await stockOf(api, p.id), 10, "a returned parcel comes back to stock");
  await api("PATCH", `/orders/${o.id}`, { status: "delivered" });
  assert.equal(await stockOf(api, p.id), 5);

  await api("DELETE", `/orders/${o.id}`);
  const after = (await api("GET", `/products/${p.id}`)).body;
  assert.equal(after.stock, 10);
  assert.ok(after.moves.some((m) => m.reason === "order" && m.number === o.number));

  // Selling more than is in stock is allowed (pre-orders) and shows as out of stock.
  await api("POST", "/orders", order({ items: items(12) }));
  const oversold = (await api("GET", `/products/${p.id}`)).body;
  assert.equal(oversold.stock, -2);
  assert.equal(oversold.level, "out");
  assert.equal(oversold.sold30, 12);

  // Orders keep the item after its product is deleted.
  await api("DELETE", `/products/${p.id}`);
  const kept = (await api("GET", "/orders")).body[0];
  assert.equal(kept.items[0].cost, 2500, "placed after the cost went up");
  assert.equal((await api("PATCH", `/orders/${kept.id}`, { status: "cancelled" })).status, 200);
});

test("dashboard shows this month's profit and low stock", async () => {
  const api = await seller();
  assert.equal((await api("PUT", "/settings", { shop: "Sana", name: "Sana", courierCharge: -1, templates: DEFAULT_TEMPLATES })).status, 400);
  const s = await api("PUT", "/settings", { shop: "Sana", name: "Sana", courierCharge: "200", templates: DEFAULT_TEMPLATES });
  assert.equal(s.body.user.courierCharge, 200);

  const suit = (await api("POST", "/products", product({ stock: 5 }))).body;
  await api("POST", "/products", product({ name: "Dupatta", stock: 0 }));
  const sold = (await api("POST", "/orders", order({ items: [{ name: "Lawn suit", qty: 2, price: 3500, productId: suit.id }] }))).body;
  const refused = (await api("POST", "/orders", order({ items: [{ name: "Lawn suit", qty: 1, price: 3500, productId: suit.id }] }))).body;
  const unlinked = (await api("POST", "/orders", order())).body;
  await api("PATCH", `/orders/${sold.id}`, { status: "delivered" });
  await api("PATCH", `/orders/${refused.id}`, { status: "returned" });
  await api("PATCH", `/orders/${unlinked.id}`, { status: "delivered" });

  const { profit, stock } = (await api("GET", "/dashboard")).body;
  assert.equal(profit.sales, 7250 * 2);
  assert.equal(profit.itemCost, 4000);
  assert.equal(profit.courier, 400);
  assert.equal(profit.returnLoss, 200);
  assert.equal(profit.profit, 14500 - 4000 - 400 - 200);
  assert.equal(profit.noCost, 1, "one delivered order has items with no cost price");

  assert.equal(stock.products, 2);
  assert.equal(stock.pieces, 3);
  assert.equal(stock.value, 6000);
  assert.deepEqual([stock.out, stock.low], [1, 1]);
  assert.deepEqual(stock.alerts.map((p) => p.name), ["Dupatta", "Lawn suit"]);
});
