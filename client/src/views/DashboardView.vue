<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { app, toast, useTitle } from "../lib/state.js";
import { setStatus } from "../lib/orders.js";
import { money, shortDay } from "../lib/format.js";
import { STATUSES, STATUS_LABELS, fillTemplate, waLink } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import OrderRow from "../components/OrderRow.vue";
import StockBadge from "../components/StockBadge.vue";

useTitle(() => "Dashboard");
const stats = ref(null);
const toConfirm = ref([]);
const error = ref("");

async function load() {
  try {
    const [d, fresh] = await Promise.all([api("GET", "/dashboard"), api("GET", "/orders?status=new")]);
    stats.value = d;
    toConfirm.value = fresh.slice(0, 5);
  } catch (err) {
    error.value = err.message;
  }
}
load();

const greeting = computed(() => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
});
const maxDay = computed(() => Math.max(1, ...(stats.value?.days || []).map((d) => d.orders)));
const totalOpen = computed(() => (stats.value ? STATUSES.reduce((s, k) => s + stats.value.counts[k], 0) : 0));

const confirmLink = (o) => waLink(o.customer.phone, fillTemplate(app.user.templates.confirm, o, app.user.shop));
async function markConfirmed(o) {
  await setStatus(o, "confirmed");
  toast(`Order #${o.number} confirmed`);
  load();
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ greeting }}, {{ app.user.name.split(" ")[0] }}</h1>
      <p class="muted">Here's how {{ app.user.shop }} is doing.</p>
    </div>
    <RouterLink to="/orders/new" class="btn btn-primary"><Icon name="plus" />New order</RouterLink>
  </div>

  <p v-if="error" class="err">{{ error }}</p>
  <template v-if="stats">
    <div class="stats">
      <div class="stat">
        <span class="stat-label">Orders today</span>
        <span class="stat-value">{{ stats.today }}</span>
        <span class="stat-note">Pakistan time</span>
      </div>
      <RouterLink class="stat" :class="{ hot: stats.toConfirm }" :to="{ path: '/orders', query: { status: 'new' } }">
        <span class="stat-label">To confirm</span>
        <span class="stat-value">{{ stats.toConfirm }}</span>
        <span class="stat-note">{{ stats.toShip }} confirmed, waiting to ship</span>
      </RouterLink>
      <RouterLink class="stat" :to="{ path: '/orders', query: { status: 'shipped' } }">
        <span class="stat-label">Cash with couriers</span>
        <span class="stat-value">{{ money(stats.cashToCollect) }}</span>
        <span class="stat-note">{{ stats.counts.shipped }} parcel{{ stats.counts.shipped === 1 ? "" : "s" }} on the way</span>
      </RouterLink>
      <div class="stat" :class="{ bad: stats.returnRate >= 15 }">
        <span class="stat-label">Sales this month</span>
        <span class="stat-value">{{ money(stats.salesMonth) }}</span>
        <span class="stat-note">{{ stats.deliveredMonth }} delivered · <b>{{ stats.returnRate }}% returned</b></span>
      </div>
    </div>

    <div class="dash-grid">
      <div class="dash-col">
        <section class="card">
          <div class="card-head">
            <h2>Waiting for confirmation</h2>
            <RouterLink :to="{ path: '/orders', query: { status: 'new' } }">See all</RouterLink>
          </div>
          <div v-if="!toConfirm.length" class="empty" style="padding:22px 10px">
            <Icon name="check" />
            <strong>All caught up</strong>
            <span>New orders you add will wait here until the customer confirms.</span>
          </div>
          <ul v-else class="order-list" style="box-shadow:none;border:1px solid var(--line)">
            <li v-for="o in toConfirm" :key="o.id">
              <OrderRow :order="o" />
              <div style="display:flex;gap:8px;padding:0 16px 12px;flex-wrap:wrap">
                <a class="btn btn-wa btn-sm" :href="confirmLink(o)" target="_blank" rel="noopener"><Icon name="wa" />Ask to confirm</a>
                <button type="button" class="btn btn-ghost btn-sm" @click="markConfirmed(o)"><Icon name="check" />Customer confirmed</button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <div class="card-head"><h2>Profit this month</h2><RouterLink v-if="!stats.profit.courierCharge" to="/settings">Add courier charge</RouterLink></div>
          <div v-if="!stats.profit.sales && !stats.profit.returnLoss" class="small muted">Your profit shows here once orders are delivered this month.</div>
          <template v-else>
            <div class="totals profit-box" style="margin-top:0">
              <div><span>Sales delivered</span><span class="num">{{ money(stats.profit.sales) }}</span></div>
              <div><span>Cost of items</span><span class="num">− {{ money(stats.profit.itemCost) }}</span></div>
              <div v-if="stats.profit.courier"><span>Courier charges</span><span class="num">− {{ money(stats.profit.courier) }}</span></div>
              <div v-if="stats.profit.returnLoss"><span>Lost on returns</span><span class="num loss">− {{ money(stats.profit.returnLoss) }}</span></div>
              <div class="grand"><span>Profit</span><span class="num" :class="{ loss: stats.profit.profit < 0 }">{{ money(stats.profit.profit) }}</span></div>
            </div>
            <p v-if="stats.profit.noCost" class="small muted" style="margin-top:10px">
              {{ stats.profit.noCost }} delivered order{{ stats.profit.noCost === 1 ? " has" : "s have" }} items that aren't in your <RouterLink to="/stock">stock list</RouterLink>, so their cost isn't counted and profit looks higher than it is.
            </p>
            <p v-if="!stats.profit.courierCharge" class="small muted" style="margin-top:10px">Add what your courier charges you per parcel in <RouterLink to="/settings">Settings</RouterLink> to count it.</p>
          </template>
        </section>
      </div>

      <div class="dash-col">
        <section class="card">
          <div class="card-head"><h2>Orders, last 14 days</h2></div>
          <div class="chart" role="img" :aria-label="`Orders per day: ${stats.days.map((d) => d.orders).join(', ')}`">
            <div v-for="(d, i) in stats.days" :key="d.day" class="bar" :class="{ today: i === stats.days.length - 1 }">
              <b>{{ d.orders || "" }}</b>
              <i :style="{ height: (d.orders / maxDay) * 100 + '%' }"></i>
            </div>
          </div>
          <div class="chart-days" aria-hidden="true">
            <span v-for="(d, i) in stats.days" :key="d.day">{{ i === stats.days.length - 1 ? "Today" : shortDay(d.day) }}</span>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Stock</h2><RouterLink to="/stock">Open stock</RouterLink></div>
          <div v-if="!stats.stock.products" class="empty" style="padding:12px 10px">
            <span>Add what you sell with what it costs you to track stock and see your real profit.</span>
            <RouterLink to="/stock/new" class="btn btn-ghost btn-sm"><Icon name="plus" />Add a product</RouterLink>
          </div>
          <template v-else>
            <p class="small muted">{{ stats.stock.pieces }} pieces worth {{ money(stats.stock.value) }} at cost</p>
            <ul v-if="stats.stock.alerts.length" class="stock-alerts">
              <li v-for="p in stats.stock.alerts" :key="p.id"><RouterLink :to="`/stock/${p.id}`">{{ p.name }}</RouterLink><StockBadge :product="p" /></li>
            </ul>
            <p v-else class="small" style="margin-top:8px;font-weight:600;color:var(--s-delivered)">✓ Everything is well stocked</p>
            <RouterLink v-if="stats.stock.low + stats.stock.out > stats.stock.alerts.length" class="small" to="/stock">
              See all {{ stats.stock.low + stats.stock.out }} that need restocking
            </RouterLink>
          </template>
        </section>
        <section class="card">
          <div class="card-head"><h2>All orders by status</h2><RouterLink to="/orders">Open list</RouterLink></div>
          <div class="pipeline">
            <RouterLink v-for="s in STATUSES" :key="s" class="pipe-row" :to="{ path: '/orders', query: { status: s } }" :style="{ color: `var(--s-${s})` }">
              <span style="color:var(--ink)">{{ STATUS_LABELS[s] }}</span>
              <span class="pipe-track"><i :style="{ width: (stats.counts[s] / Math.max(1, totalOpen)) * 100 + '%' }"></i></span>
              <span class="num" style="color:var(--ink)">{{ stats.counts[s] }}</span>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>
