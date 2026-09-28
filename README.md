# Sauda: order manager for Instagram sellers

Sauda (سودا, "a deal") is a simple order book for people who sell on **Instagram, Facebook, WhatsApp and TikTok** in Pakistan and deliver **cash on delivery**. Orders come in through DMs; Sauda keeps them in one place, sends the WhatsApp messages for you, and warns you before you ship to someone who refused parcels before.

Built with **Vue 3 + Vite** on the front end and **Node.js (Express)** on the back end.

## What it does

- **Add an order in seconds**: customer, WhatsApp number, city, address, items and delivery charge. The total is worked out for you.
- **Returns warning**: as soon as you type a phone number, Sauda shows that customer's past orders. Numbers that returned parcels are flagged in red, and returning customers' details fill in by themselves.
- **One-tap WhatsApp messages**: confirm the order, share the courier and tracking number, and say thank you after delivery. The messages are yours to edit (Urdu, Roman Urdu or English) with tags like `{name}`, `{total}` and `{tracking}`.
- **Order steps**: New → Confirmed → Shipped (courier + tracking) → Delivered, or Returned / Cancelled, with a history of every change.
- **Dashboard**: orders today, orders waiting for confirmation, cash still with couriers, sales this month, return rate and a 14-day chart.
- **Customers**: everyone who ordered, with orders, deliveries, returns and total spent. Search, sort by most returns, and message them on WhatsApp.
- **Private per seller**: each seller has an account and only ever sees their own orders and customers.
- Works on phones first (bottom tab bar, big buttons), with a sidebar on computers.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

This starts the API on http://localhost:3002 and the app on **http://localhost:5174**. Open the second one and create an account.

For production:

```bash
npm run build     # builds the Vue app into client/dist
npm start         # one server on http://localhost:3002 serves the app and the API
```

| Setting | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3002). |
| `DATA_DIR` | Where accounts and orders are saved (default `server/data`, not in git). |
| `SESSION_SECRET` | Secret for signing login cookies. If unset, one is generated and saved in the data folder. |

Run it behind HTTPS in production: login cookies are marked `Secure` when `NODE_ENV=production`.

## Where things live

```
shared/core.js          Order rules used by both server and preview: phone numbers, checks,
                        customer history, dashboard numbers, WhatsApp message templates
server/src/app.js       API routes
server/src/auth.js      Password hashing (scrypt), signed session cookies, login limits
server/src/storage.js   Small JSON-file store with atomic writes
server/test/            API tests
client/src/views/       Pages: Login, Dashboard, Orders, Order, New/Edit order, Customers, Settings
client/src/components/  Navigation, order row, status pill, returns badge, icons
client/src/lib/         API client, app state, formatting, in-browser preview API
```

## API

All routes except the `auth` ones need a logged-in seller, and only touch that seller's data.

| Method | Path | What |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Accounts |
| GET | `/api/auth/me` | Current seller |
| PUT | `/api/settings` | Shop name, your name, WhatsApp messages |
| GET / POST | `/api/orders` | List (`?status=`, `?q=`) or add orders |
| GET / PUT / PATCH / DELETE | `/api/orders/:id` | Read, edit, change status (`{status, courier, tracking}`), delete |
| GET | `/api/customers`, `/api/customers/:phone` | Customer list, one number's history and returns flag |
| GET | `/api/dashboard` | Dashboard numbers |

Phone numbers are stored as `03XXXXXXXXX`; `0300 1234567`, `+92 300 1234567` and `923001234567` are all accepted.

## Tests

```bash
npm test
```

Covers accounts, login blocking, order checks and totals, seller privacy, status changes, the returns flag, search and the dashboard.

## Preview build

`npm run build:preview` makes a self-contained copy in `client/dist-preview` that runs without the server, with a demo shop (**demo@sauda.pk / demo1234**) full of sample orders. Everything is saved in the visitor's browser only. It's for showing the app; use `npm run build` + `npm start` for real use.

## Font

Plus Jakarta Sans, bundled from `client/src/assets/fonts/`, free under the SIL Open Font License.
