// Order rules shared by the Node server and the in-browser preview:
// phone numbers, order checks, customer history, dashboard numbers and WhatsApp messages.

export const STATUSES = ["new", "confirmed", "shipped", "delivered", "returned", "cancelled"];
export const STATUS_LABELS = {
  new: "New",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};
export const COURIERS = ["TCS", "Leopards", "M&P", "PostEx", "Trax", "Call Courier", "BlueEx", "Rider", "Other"];
export const CITIES = [
  "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta",
  "Sialkot", "Gujranwala", "Hyderabad", "Bahawalpur", "Sargodha", "Sukkur", "Abbottabad", "Gujrat",
  "Sahiwal", "Okara", "Sheikhupura", "Rahim Yar Khan", "Mardan", "Kasur", "Jhelum", "Mirpur",
];

export const DEFAULT_TEMPLATES = {
  confirm:
    "Assalam o Alaikum {name}! 🌸\n{shop} se aap ka order #{number} mila hai:\n{items}\nTotal: Rs {total} (cash on delivery)\nAddress: {address}, {city}\n\nPlease \"YES\" reply kar ke order confirm kar dein. Shukriya!",
  shipped:
    "Assalam o Alaikum {name}! Aap ka order #{number} {courier} se bhej diya gaya hai. 📦\nTracking: {tracking}\nParcel aane par Rs {total} cash ready rakhein. Shukriya!\n– {shop}",
  delivered:
    "Shukriya {name}! 💛 Umeed hai aap ko order pasand aaya. Apni picture ya review share karein to humein bohat khushi hogi.\n– {shop}",
};
export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
export const PLACEHOLDERS = ["name", "shop", "number", "items", "total", "address", "city", "courier", "tracking"];

// Pakistan has no daylight saving: local time is always UTC+5.
const PK_OFFSET_MS = 5 * 3600 * 1000;
export const pkDay = (date) => new Date(new Date(date).getTime() + PK_OFFSET_MS).toISOString().slice(0, 10);

// Accepts 0300 1234567, +92 300-1234567, 923001234567 or 3001234567; returns "03001234567" or "".
export function normalizePhone(input) {
  let d = String(input ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "0" + d : "";
}
export const prettyPhone = (p) => (p && p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4)}` : p || "");
export const waNumber = (p) => "92" + String(p).slice(1);
export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

const str = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const int = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

// Checks an order form. Returns { value } or { errors: { field: message } }.
export function checkOrder(body = {}) {
  const errors = {};
  const c = body.customer || {};
  const name = str(c.name);
  const phone = normalizePhone(c.phone);
  const city = str(c.city);
  const address = str(c.address);
  if (name.length < 2 || name.length > 60) errors.name = "Enter the customer's name.";
  if (!phone) errors.phone = "Enter a Pakistani mobile number, like 0300 1234567.";
  if (city.length < 2 || city.length > 40) errors.city = "Enter the city.";
  if (address.length < 5 || address.length > 200) errors.address = "Enter the full delivery address.";

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = [];
  rawItems.forEach((it, i) => {
    const iname = str(it?.name);
    const qty = int(it?.qty);
    const price = int(it?.price);
    if (!iname && !it?.price) return; // blank row
    if (iname.length < 1 || iname.length > 80) errors[`item${i}`] = "Enter what the customer ordered.";
    else if (!Number.isInteger(qty) || qty < 1 || qty > 99) errors[`item${i}`] = "Quantity must be 1 to 99.";
    else if (!Number.isInteger(price) || price < 0 || price > 10_000_000) errors[`item${i}`] = "Enter the price in rupees.";
    else items.push({ name: iname, qty, price });
  });
  if (!items.length && !Object.keys(errors).some((k) => k.startsWith("item"))) errors.items = "Add at least one item.";
  if (items.length > 20) errors.items = "An order can have up to 20 items.";

  const delivery = body.delivery === undefined || body.delivery === "" ? 0 : int(body.delivery);
  if (!Number.isInteger(delivery) || delivery < 0 || delivery > 10_000) errors.delivery = "Delivery charge must be 0 to 10,000.";
  const note = str(body.note);
  if (note.length > 300) errors.note = "Keep the note under 300 characters.";
  const source = ["Instagram", "Facebook", "WhatsApp", "TikTok", "Website", "Other"].includes(body.source) ? body.source : "Instagram";

  if (Object.keys(errors).length) return { errors };
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  return {
    value: { customer: { name, phone, city, address }, items, delivery, subtotal, total: subtotal + delivery, note, source },
  };
}

// Status change with optional courier and tracking number.
export function checkStatusChange(body = {}) {
  const errors = {};
  const status = body.status;
  if (!STATUSES.includes(status)) errors.status = "Unknown status.";
  const courier = str(body.courier);
  const tracking = str(body.tracking);
  if (courier && courier.length > 30) errors.courier = "Courier name is too long.";
  if (tracking.length > 40) errors.tracking = "Tracking number is too long.";
  if (Object.keys(errors).length) return { errors };
  return { value: { status, courier, tracking } };
}

export function checkSettings(body = {}) {
  const errors = {};
  const shop = str(body.shop);
  const name = str(body.name);
  if (shop.length < 2 || shop.length > 40) errors.shop = "Enter your shop name.";
  if (name.length < 2 || name.length > 60) errors.name = "Enter your name.";
  const templates = {};
  for (const k of TEMPLATE_KEYS) {
    const t = typeof body.templates?.[k] === "string" ? body.templates[k].trim() : "";
    if (t.length < 5 || t.length > 1000) errors[k] = "Write a message (5 to 1,000 characters).";
    templates[k] = t;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { shop, name, templates } };
}

export function newOrder(value, { id, number, sellerId, now = new Date().toISOString() }) {
  return { id, number, sellerId, ...value, status: "new", courier: "", tracking: "", createdAt: now, updatedAt: now, history: [{ status: "new", at: now }] };
}

export function applyStatus(order, { status, courier, tracking }, now = new Date().toISOString()) {
  if (courier !== undefined && courier !== "") order.courier = courier;
  if (tracking !== undefined && tracking !== "") order.tracking = tracking;
  if (order.status !== status) {
    order.status = status;
    order.history.push({ status, at: now });
  }
  order.updatedAt = now;
  return order;
}

export function applyEdit(order, value, now = new Date().toISOString()) {
  Object.assign(order, value, { updatedAt: now });
  return order;
}

export const nextNumber = (orders) => orders.reduce((m, o) => Math.max(m, o.number), 1000) + 1;

// ---------- Customers ----------
// One entry per phone number, newest order first.
export function customerList(orders) {
  const map = new Map();
  for (const o of [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const p = o.customer.phone;
    let c = map.get(p);
    if (!c) {
      c = { phone: p, name: o.customer.name, city: o.customer.city, address: o.customer.address, orders: 0, delivered: 0, returned: 0, cancelled: 0, spent: 0, lastOrder: o.createdAt };
      map.set(p, c);
    }
    c.orders++;
    if (o.status === "delivered") {
      c.delivered++;
      c.spent += o.total;
    }
    if (o.status === "returned") c.returned++;
    if (o.status === "cancelled") c.cancelled++;
  }
  return [...map.values()].map((c) => ({ ...c, risk: riskLevel(c) }));
}

// "high" once someone has refused more parcels than they accepted, "watch" after any refusal.
export function riskLevel({ delivered, returned }) {
  if (!returned) return "ok";
  return returned >= delivered ? "high" : "watch";
}

export function customerHistory(orders, phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const mine = orders.filter((o) => o.customer.phone === p);
  if (!mine.length) return { phone: p, orders: 0, delivered: 0, returned: 0, cancelled: 0, spent: 0, risk: "new", recent: [] };
  const c = customerList(mine)[0];
  const recent = mine
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((o) => ({ id: o.id, number: o.number, status: o.status, total: o.total, createdAt: o.createdAt }));
  return { ...c, recent };
}

// ---------- Dashboard ----------
export function dashboard(orders, now = new Date()) {
  const today = pkDay(now);
  const month = today.slice(0, 7);
  const active = orders.filter((o) => o.status !== "cancelled");
  const count = (s) => orders.filter((o) => o.status === s).length;
  const deliveredMonth = orders.filter((o) => o.status === "delivered" && lastChange(o, "delivered").slice(0, 7) === month);
  const returnedMonth = orders.filter((o) => o.status === "returned" && lastChange(o, "returned").slice(0, 7) === month);
  const done = deliveredMonth.length + returnedMonth.length;

  // Orders per day for the last 14 days (Pakistan time).
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = pkDay(new Date(now).getTime() - i * 864e5);
    days.push({ day: d, orders: active.filter((o) => pkDay(o.createdAt) === d).length });
  }

  return {
    today: orders.filter((o) => pkDay(o.createdAt) === today).length,
    counts: Object.fromEntries(STATUSES.map((s) => [s, count(s)])),
    toConfirm: count("new"),
    toShip: count("confirmed"),
    cashToCollect: orders.filter((o) => o.status === "shipped").reduce((s, o) => s + o.total, 0),
    salesMonth: deliveredMonth.reduce((s, o) => s + o.total, 0),
    deliveredMonth: deliveredMonth.length,
    returnedMonth: returnedMonth.length,
    returnRate: done ? Math.round((returnedMonth.length / done) * 100) : 0,
    days,
  };
}
const lastChange = (o, status) => pkDay([...o.history].reverse().find((h) => h.status === status)?.at || o.updatedAt);

// ---------- WhatsApp messages ----------
export function fillTemplate(template, order, shop) {
  const items = order.items.map((it) => `• ${it.name}${it.qty > 1 ? ` × ${it.qty}` : ""}`).join("\n");
  const values = {
    name: order.customer.name.split(" ")[0],
    shop,
    number: order.number,
    items,
    total: order.total.toLocaleString("en-PK"),
    address: order.customer.address,
    city: order.customer.city,
    courier: order.courier || "courier",
    tracking: order.tracking || "jald share karenge",
  };
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// Which message fits the order's current stage.
export const templateFor = (status) => (status === "shipped" ? "shipped" : status === "delivered" ? "delivered" : "confirm");

export function filterOrders(orders, { status = "", q = "" } = {}) {
  const needle = String(q).trim().toLowerCase();
  const digits = needle.replace(/[^\d]/g, "");
  return orders
    .filter((o) => !status || o.status === status)
    .filter((o) => {
      if (!needle) return true;
      if (String(o.number) === needle.replace(/^#/, "")) return true;
      if (digits.length >= 4 && (o.customer.phone.includes(digits) || o.customer.phone.includes(digits.replace(/^92/, "0")))) return true;
      const hay = `${o.customer.name} ${o.customer.city} ${o.tracking} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase();
      return hay.includes(needle);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
