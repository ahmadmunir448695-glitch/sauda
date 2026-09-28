<script setup>
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/state.js";
import { money, when } from "../lib/format.js";
import { prettyPhone, waLink } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import RiskBadge from "../components/RiskBadge.vue";

useTitle(() => "Customers");
const list = ref(null);
const error = ref("");
const q = ref("");
const sort = ref("recent");
api("GET", "/customers").then((l) => (list.value = l)).catch((err) => (error.value = err.message));

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const digits = needle.replace(/[^\d]/g, "");
  const rows = (list.value || []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.city.toLowerCase().includes(needle) || (digits.length >= 3 && c.phone.includes(digits))
  );
  const by = {
    recent: (a, b) => b.lastOrder.localeCompare(a.lastOrder),
    spent: (a, b) => b.spent - a.spent,
    orders: (a, b) => b.orders - a.orders,
    returns: (a, b) => b.returned - a.returned || b.orders - a.orders,
  }[sort.value];
  return [...rows].sort(by);
});
const flagged = computed(() => (list.value || []).filter((c) => c.returned).length);
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Customers</h1>
      <p class="muted">
        {{ list ? `${list.length} customer${list.length === 1 ? "" : "s"}` : "Loading…" }}<template v-if="flagged"> · <b style="color:var(--s-returned)">{{ flagged }} with returns</b></template>
      </p>
    </div>
  </div>
  <div class="toolbar">
    <label class="search-box">
      <span class="sr-only">Search customers</span>
      <Icon name="search" />
      <input v-model="q" type="search" placeholder="Search name, phone or city" autocomplete="off" />
    </label>
    <label class="field" style="flex:0 0 190px">
      <span class="sr-only">Sort by</span>
      <select v-model="sort">
        <option value="recent">Latest order first</option>
        <option value="spent">Most spent</option>
        <option value="orders">Most orders</option>
        <option value="returns">Most returns</option>
      </select>
    </label>
  </div>
  <p v-if="error" class="err">{{ error }}</p>

  <template v-if="shown.length">
    <div class="table-wrap cust">
      <table class="list">
        <thead>
          <tr><th>Customer</th><th>Phone</th><th>City</th><th class="r">Orders</th><th class="r">Delivered</th><th class="r">Returned</th><th class="r">Spent</th><th>Last order</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="c in shown" :key="c.phone">
            <td><span class="cust-name">{{ c.name }}</span> <RiskBadge :customer="c" /></td>
            <td class="num">{{ prettyPhone(c.phone) }}</td>
            <td>{{ c.city }}</td>
            <td class="r">{{ c.orders }}</td>
            <td class="r">{{ c.delivered }}</td>
            <td class="r" :style="{ color: c.returned ? 'var(--s-returned)' : '', fontWeight: c.returned ? 800 : '' }">{{ c.returned }}</td>
            <td class="r">{{ money(c.spent) }}</td>
            <td class="muted">{{ when(c.lastOrder) }}</td>
            <td style="white-space:nowrap">
              <RouterLink class="btn btn-ghost btn-sm" :to="{ path: '/orders', query: { q: c.phone } }">Orders</RouterLink>
              <a class="icon-btn" style="margin-left:6px;vertical-align:middle;color:var(--wa)" :href="waLink(c.phone, `Assalam o Alaikum ${c.name.split(' ')[0]}!`)" target="_blank" rel="noopener" :aria-label="`WhatsApp ${c.name}`"><Icon name="wa" /></a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="cust-cards">
      <li v-for="c in shown" :key="c.phone" class="cust-card">
        <div class="row"><span class="cust-name">{{ c.name }}</span><RiskBadge :customer="c" /></div>
        <div class="row small muted"><span class="num">{{ prettyPhone(c.phone) }} · {{ c.city }}</span><span>{{ when(c.lastOrder) }}</span></div>
        <div class="figs"><span><b>{{ c.orders }}</b> orders</span><span><b>{{ c.delivered }}</b> delivered</span><span><b :style="{ color: c.returned ? 'var(--s-returned)' : '' }">{{ c.returned }}</b> returned</span><span><b>{{ money(c.spent) }}</b> spent</span></div>
        <div class="row" style="justify-content:flex-start;gap:8px">
          <RouterLink class="btn btn-ghost btn-sm" :to="{ path: '/orders', query: { q: c.phone } }">See orders</RouterLink>
          <a class="btn btn-wa btn-sm" :href="waLink(c.phone, `Assalam o Alaikum ${c.name.split(' ')[0]}!`)" target="_blank" rel="noopener"><Icon name="wa" />WhatsApp</a>
        </div>
      </li>
    </ul>
  </template>
  <div v-else-if="list" class="order-list empty">
    <Icon name="users" />
    <strong>{{ q ? "No customers match your search" : "No customers yet" }}</strong>
    <span v-if="!q">Customers appear here as soon as you add their first order.</span>
  </div>
</template>
