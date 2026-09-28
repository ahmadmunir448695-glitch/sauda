// In-browser copy of the Node API for the self-contained preview build.
// Data lives in this browser's localStorage and starts with a demo shop full of sample orders.
import {
  checkOrder, checkStatusChange, checkSettings, newOrder, applyStatus, applyEdit, nextNumber,
  customerList, customerHistory, dashboard, filterOrders, DEFAULT_TEMPLATES,
} from "../../../shared/core.js";

const KEY = "sauda-preview-v1";
let memory = null; // used when localStorage is blocked

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) return saved;
  } catch {}
  return memory || seed();
}
function save(db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}

class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const invalid = (fields) => {
  throw new ApiError(400, Object.values(fields)[0], fields);
};

// Not real security: the preview only keeps data in this one browser.
async function hash(password) {
  const bytes = new TextEncoder().encode("sauda-preview:" + password);
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "plain:" + password;
  }
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const publicUser = (u) => ({ id: u.id, name: u.name, shop: u.shop, email: u.email, templates: u.templates });

export async function handle(method, url, body) {
  await new Promise((r) => setTimeout(r, 60));
  const db = load();
  const [pathPart, queryPart = ""] = url.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  const user = db.users.find((u) => u.id === db.session);
  const needUser = () => {
    if (!user) throw new ApiError(401, "Please log in first.");
  };
  const mine = () => db.orders.filter((o) => o.sellerId === user.id);
  const route = `${method} ${pathPart}`;
  let m;

  if (route === "GET /auth/me") return { user: user ? publicUser(user) : null };
  if (route === "POST /auth/logout") {
    db.session = null;
    save(db);
    return { ok: true };
  }
  if (route === "POST /auth/login") {
    const email = String(body?.email || "").trim().toLowerCase();
    const u = db.users.find((x) => x.email === email);
    if (!u || u.passwordHash !== (await hash(String(body?.password || "")))) throw new ApiError(401, "Wrong email or password.");
    db.session = u.id;
    save(db);
    return { user: publicUser(u) };
  }
  if (route === "POST /auth/register") {
    const { name, shop, password } = body || {};
    const email = String(body?.email || "").trim().toLowerCase();
    const fields = {};
    if (typeof name !== "string" || name.trim().length < 2) fields.name = "Enter your name.";
    if (typeof shop !== "string" || shop.trim().length < 2) fields.shop = "Enter your shop name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Enter a valid email address.";
    if (typeof password !== "string" || password.length < 8) fields.password = "Use at least 8 characters.";
    if (db.users.some((u) => u.email === email)) fields.email = "An account with this email already exists. Log in instead.";
    if (Object.keys(fields).length) invalid(fields);
    const u = { id: uid(), name: name.trim(), shop: shop.trim(), email, passwordHash: await hash(password), templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString() };
    db.users.push(u);
    db.session = u.id;
    save(db);
    return { user: publicUser(u) };
  }

  needUser();
  if (route === "PUT /settings") {
    const { value, errors } = checkSettings(body);
    if (errors) invalid(errors);
    Object.assign(user, value);
    save(db);
    return { user: publicUser(user) };
  }
  if (route === "GET /orders") return filterOrders(mine(), query);
  if (route === "POST /orders") {
    const { value, errors } = checkOrder(body);
    if (errors) invalid(errors);
    const o = newOrder(value, { id: uid(), number: nextNumber(mine()), sellerId: user.id });
    db.orders.push(o);
    save(db);
    return o;
  }
  if ((m = pathPart.match(/^\/orders\/([^/]+)$/))) {
    const o = mine().find((x) => x.id === m[1]);
    if (!o) throw new ApiError(404, "Order not found.");
    if (method === "GET") return o;
    if (method === "DELETE") {
      db.orders = db.orders.filter((x) => x !== o);
      save(db);
      return { ok: true };
    }
    const { value, errors } = method === "PUT" ? checkOrder(body) : checkStatusChange(body);
    if (errors) invalid(errors);
    method === "PUT" ? applyEdit(o, value) : applyStatus(o, value);
    save(db);
    return o;
  }
  if (route === "GET /customers") return customerList(mine());
  if ((m = pathPart.match(/^\/customers\/(.+)$/))) {
    const h = customerHistory(mine(), decodeURIComponent(m[1]));
    if (!h) invalid({ phone: "Enter a Pakistani mobile number, like 0300 1234567." });
    return h;
  }
  if (route === "GET /dashboard") return dashboard(mine());
  throw new ApiError(404, "Not found.");
}

// ---------- Demo shop ----------
export const DEMO_LOGIN = { email: "demo@sauda.pk", password: "demo1234" };
const DEMO_HASH = "2b8dab2321311acbeaee2290a60bb78264e0b3ee6a63e254ad0f513309f2e5b4"; // hash("demo1234")

function seed() {
  let n = 7;
  const rand = () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const first = ["Ayesha", "Fatima", "Hira", "Maryam", "Zainab", "Amna", "Mahnoor", "Iqra", "Rabia", "Areeba", "Noor", "Sadia", "Kinza", "Laiba", "Sana", "Bushra"];
  const last = ["Khan", "Malik", "Butt", "Sheikh", "Qureshi", "Chaudhry", "Raza", "Javed", "Aslam", "Iqbal"];
  const places = [
    ["Lahore", "House 45, Block C, Johar Town"], ["Lahore", "Flat 3, Gulberg III, near Liberty"], ["Lahore", "Street 9, DHA Phase 5"],
    ["Karachi", "B-17, Block 13-D, Gulshan-e-Iqbal"], ["Karachi", "Flat 402, Clifton Block 5"], ["Islamabad", "House 22, Street 14, G-11/2"],
    ["Rawalpindi", "Satellite Town, B Block, House 190"], ["Faisalabad", "Madina Town, Street 3, House 55"], ["Multan", "Gulgasht Colony, House 12"],
    ["Sialkot", "Model Town, House 7"], ["Peshawar", "Hayatabad Phase 3, Street 8"], ["Gujranwala", "Satellite Town, House 31"],
  ];
  const products = [
    ["Lawn 3-piece suit", 4500], ["Embroidered kurta", 3200], ["Chiffon dupatta", 1500], ["Khussa (pair)", 2200],
    ["Silk scarf", 1200], ["Kids frock", 1800], ["Printed shawl", 2800], ["Cotton trouser", 1400],
  ];
  const couriers = ["TCS", "Leopards", "M&P", "PostEx", "Trax"];
  const sources = ["Instagram", "Instagram", "Instagram", "Facebook", "WhatsApp", "TikTok"];

  const demo = { id: "demo", name: "Noor Fatima", shop: "Noor Boutique", email: DEMO_LOGIN.email, passwordHash: DEMO_HASH, templates: { ...DEFAULT_TEMPLATES }, createdAt: new Date().toISOString() };

  // Customers: some come back, a few refuse parcels.
  const customers = Array.from({ length: 22 }, (_, i) => {
    const [city, address] = pick(places);
    return { name: `${pick(first)} ${pick(last)}`, phone: "03" + String(Math.floor(rand() * 5)) + String(10000000 + Math.floor(rand() * 89999999)).padStart(8, "0"), city, address, refuses: i === 3 || i === 11 };
  });

  const orders = [];
  const now = Date.now();
  for (let i = 0; i < 38; i++) {
    const c = i < 22 ? customers[i] : pick(customers);
    const ageDays = 38 - i < 6 ? rand() * 1.2 : (38 - i) * 0.55 + rand();
    const created = new Date(now - ageDays * 864e5).toISOString();
    const items = [];
    for (let k = 1 + Math.floor(rand() * 2.2); k > 0; k--) {
      const [name, price] = pick(products);
      if (!items.some((it) => it.name === name)) items.push({ name, qty: rand() < 0.2 ? 2 : 1, price });
    }
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const delivery = subtotal >= 5000 ? 0 : 250;
    const o = {
      id: `demo-${i}`, number: 1001 + i, sellerId: demo.id,
      customer: { name: c.name, phone: c.phone, city: c.city, address: c.address },
      items, delivery, subtotal, total: subtotal + delivery, note: i % 9 === 4 ? "Please call before delivery" : "", source: pick(sources),
      status: "new", courier: "", tracking: "", createdAt: created, updatedAt: created, history: [{ status: "new", at: created }],
    };
    const at = (d) => new Date(new Date(created).getTime() + d * 864e5).toISOString();
    const steps = ageDays < 1 ? [] : ageDays < 2 ? ["confirmed"] : ageDays < 4.5 ? ["confirmed", "shipped"] : ["confirmed", "shipped", c.refuses ? "returned" : rand() < 0.08 ? "returned" : "delivered"];
    if (ageDays > 3 && rand() < 0.05) steps.splice(0, steps.length, "cancelled");
    steps.forEach((s, k) => {
      const courier = pick(couriers);
      applyStatus(o, { status: s, courier: s === "shipped" ? courier : "", tracking: s === "shipped" ? `${courier.slice(0, 2).toUpperCase()}${String(Math.floor(rand() * 9e8) + 1e8)}` : "" }, at(0.2 + k * 1.1));
    });
    orders.push(o);
  }

  const db = { users: [demo], orders, session: demo.id };
  save(db);
  return db;
}

export function resetPreview() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  memory = null;
}
