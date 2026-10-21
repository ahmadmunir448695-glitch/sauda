// Order rules shared by the Node server and the in-browser preview:
// phone numbers, order checks, customer history, stock and profit, dashboard numbers and WhatsApp messages.

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
    const productId = typeof it?.productId === "string" && it.productId.length <= 64 ? it.productId : "";
    if (!iname && !it?.price) return; // blank row
    if (iname.length < 1 || iname.length > 80) errors[`item${i}`] = "Enter what the customer ordered.";
    else if (!Number.isInteger(qty) || qty < 1 || qty > 99) errors[`item${i}`] = "Quantity must be 1 to 99.";
    else if (!Number.isInteger(price) || price < 0 || price > 10_000_000) errors[`item${i}`] = "Enter the price in rupees.";
    else items.push({ name: iname, qty, price, ...(productId ? { productId } : {}) });
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
  const courierCharge = body.courierCharge === undefined || body.courierCharge === "" ? 0 : int(body.courierCharge);
  if (!Number.isInteger(courierCharge) || courierCharge < 0 || courierCharge > 5000) errors.courierCharge = "Enter the courier charge, 0 to 5,000.";
  const templates = {};
  for (const k of TEMPLATE_KEYS) {
    const t = typeof body.templates?.[k] === "string" ? body.templates[k].trim() : "";
    if (t.length < 5 || t.length > 1000) errors[k] = "Write a message (5 to 1,000 characters).";
    templates[k] = t;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { shop, name, courierCharge, templates } };
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
// `products` and `courierCharge` (what the courier charges the seller per parcel) feed the stock and profit numbers.
export function dashboard(orders, { products = [], courierCharge = 0, now = new Date() } = {}) {
  const today = pkDay(now);
  const active = orders.filter((o) => o.status !== "cancelled");
  const count = (s) => orders.filter((o) => o.status === s).length;
  const { deliveredMonth, returnedMonth } = finishedThisMonth(orders, now);
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
    profit: profitSummary(orders, courierCharge, now),
    stock: stockSummary(products),
  };
}
const lastChange = (o, status) => pkDay([...o.history].reverse().find((h) => h.status === status)?.at || o.updatedAt);

// Orders delivered or returned this month (Pakistan time), counted by when that happened.
function finishedThisMonth(orders, now) {
  const month = pkDay(now).slice(0, 7);
  const finished = (s) => orders.filter((o) => o.status === s && lastChange(o, s).slice(0, 7) === month);
  return { deliveredMonth: finished("delivered"), returnedMonth: finished("returned") };
}

// ---------- Stock and profit ----------
// Products are what the seller keeps in stock. Order items can point at one (`productId`),
// and carry the product's cost from the day of the order, so later price changes don't rewrite old profit.
export const MOVE_LABELS = { start: "Opening stock", restock: "Stock received", remove: "Taken out", count: "Counted", order: "Order" };
const MAX_MOVES = 30;

export function checkProduct(body = {}, { isNew = false } = {}) {
  const errors = {};
  const name = str(body.name);
  const price = int(body.price);
  const cost = int(body.cost);
  const lowStock = body.lowStock === undefined || body.lowStock === "" ? 3 : int(body.lowStock);
  if (name.length < 1 || name.length > 80) errors.name = "Enter the product name.";
  if (!Number.isInteger(price) || price < 0 || price > 10_000_000) errors.price = "Enter the selling price in rupees.";
  if (!Number.isInteger(cost) || cost < 0 || cost > 10_000_000) errors.cost = "Enter what one piece costs you, in rupees.";
  if (!Number.isInteger(lowStock) || lowStock < 0 || lowStock > 9999) errors.lowStock = "Enter a number from 0 to 9,999.";
  const value = { name, price, cost, lowStock };
  // Stock is only set when adding a product; after that it moves through orders and stock changes.
  if (isNew) {
    const stock = body.stock === undefined || body.stock === "" ? 0 : int(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 99_999) errors.stock = "Enter how many pieces you have, 0 to 99,999.";
    value.stock = stock;
  }
  if (Object.keys(errors).length) return { errors };
  return { value };
}

// `{ add: n }` receives (or with a negative n, takes out) pieces; `{ count: n }` sets the stock after counting.
export function checkStockChange(body = {}) {
  if (body.count !== undefined) {
    const count = int(body.count);
    if (!Number.isInteger(count) || count < 0 || count > 99_999) return { errors: { qty: "Enter the count, 0 to 99,999." } };
    return { value: { count } };
  }
  const add = int(body.add);
  if (!Number.isInteger(add) || add === 0 || Math.abs(add) > 99_999) return { errors: { qty: "Enter how many pieces, 1 to 99,999." } };
  return { value: { add } };
}

export const sameName = (a, b) => str(a).toLowerCase() === str(b).toLowerCase();
export const findProduct = (products, name) => (str(name) ? products.find((p) => sameName(p.name, name)) : undefined);

export function newProduct(value, { id, sellerId, now = new Date().toISOString() }) {
  const p = { id, sellerId, ...value, stock: 0, createdAt: now, updatedAt: now, moves: [] };
  return moveStock(p, value.stock, "start", { now });
}

export function applyProductEdit(product, value, now = new Date().toISOString()) {
  return Object.assign(product, value, { updatedAt: now });
}

// Changes the stock and logs why, newest first. `order` is set when an order took or gave back the pieces.
export function moveStock(product, change, reason, { now = new Date().toISOString(), order } = {}) {
  if (!change) return product;
  product.stock += change;
  product.moves.unshift({ at: now, change, stock: product.stock, reason, ...(order ? { orderId: order.id, number: order.number } : {}) });
  product.moves.length = Math.min(product.moves.length, MAX_MOVES);
  product.updatedAt = now;
  return product;
}

export function applyStockChange(product, { add, count }, now = new Date().toISOString()) {
  if (count !== undefined) return moveStock(product, count - product.stock, "count", { now });
  return moveStock(product, add, add > 0 ? "restock" : "remove", { now });
}

export const stockLevel = (p) => (p.stock <= 0 ? "out" : p.stock <= p.lowStock ? "low" : "ok");

// An order holds its pieces until it is cancelled or returned (a returned parcel comes back to the seller).
export function stockHeld(order) {
  const held = new Map();
  if (!order || order.status === "cancelled" || order.status === "returned") return held;
  for (const it of order.items) if (it.productId) held.set(it.productId, (held.get(it.productId) || 0) + it.qty);
  return held;
}

// How each product's stock changes when an order goes from `before` to `after`.
// Either may be null (a new or deleted order). Returns [productId, change] pairs.
export function stockDelta(before, after) {
  const delta = new Map(stockHeld(before));
  for (const [id, qty] of stockHeld(after)) delta.set(id, (delta.get(id) || 0) - qty);
  return [...delta].filter(([, change]) => change);
}

// Links order items to the seller's products and stamps each with its cost.
// Unknown products are dropped; a product already on the order keeps the cost it had then.
export function linkItems(items, products, previous = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const oldCost = new Map(previous.filter((it) => it.productId).map((it) => [it.productId, it.cost]));
  return items.map(({ productId, cost, ...it }) => {
    if (!productId || (!byId.has(productId) && !oldCost.has(productId))) return it;
    return { ...it, productId, cost: oldCost.has(productId) ? oldCost.get(productId) : byId.get(productId).cost };
  });
}

// Cost of an order's items. `known` is false when some item has no cost price.
export function itemsCost(order) {
  let cost = 0;
  let known = true;
  for (const it of order.items) {
    if (it.cost === undefined) known = false;
    else cost += it.cost * it.qty;
  }
  return { cost, known };
}

// This month's profit: delivered sales, less what the items cost, the courier charge on every
// delivered parcel, and the courier charge lost on every returned one.
export function profitSummary(orders, courierCharge = 0, now = new Date()) {
  const { deliveredMonth, returnedMonth } = finishedThisMonth(orders, now);
  let sales = 0;
  let itemCost = 0;
  let noCost = 0;
  for (const o of deliveredMonth) {
    const c = itemsCost(o);
    sales += o.total;
    itemCost += c.cost;
    if (!c.known) noCost++;
  }
  const courier = courierCharge * deliveredMonth.length;
  const returnLoss = courierCharge * returnedMonth.length;
  return { sales, itemCost, courier, returnLoss, profit: sales - itemCost - courier - returnLoss, noCost, courierCharge };
}

// Products with their stock level and pieces sold in the last 30 days, A to Z.
export function productList(products, orders = [], now = new Date()) {
  const since = new Date(now).getTime() - 30 * 864e5;
  const sold = new Map();
  for (const o of orders) {
    if (new Date(o.createdAt).getTime() < since) continue;
    for (const [id, qty] of stockHeld(o)) sold.set(id, (sold.get(id) || 0) + qty);
  }
  return products
    .map(({ moves, ...p }) => ({ ...p, level: stockLevel(p), sold30: sold.get(p.id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// One product with its stock log.
export const productDetail = (product, orders = []) => ({ ...productList([product], orders)[0], moves: product.moves });

export function stockSummary(products) {
  const list = products.map((p) => ({ id: p.id, name: p.name, stock: p.stock, lowStock: p.lowStock, level: stockLevel(p) }));
  const alerts = list.filter((p) => p.level !== "ok").sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
  return {
    products: list.length,
    pieces: products.reduce((s, p) => s + Math.max(0, p.stock), 0),
    value: products.reduce((s, p) => s + Math.max(0, p.stock) * p.cost, 0),
    out: alerts.filter((p) => p.level === "out").length,
    low: alerts.filter((p) => p.level === "low").length,
    alerts: alerts.slice(0, 6),
  };
}

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
