<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/state.js";
import { STATUSES, STATUS_LABELS } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import OrderRow from "../components/OrderRow.vue";

useTitle(() => "Orders");
const route = useRoute();
const router = useRouter();
const status = computed(() => (STATUSES.includes(route.query.status) ? route.query.status : ""));
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const all = ref(null);
const customers = ref(new Map());
const error = ref("");

async function load() {
  try {
    const [orders, list] = await Promise.all([api("GET", "/orders"), api("GET", "/customers")]);
    all.value = orders;
    customers.value = new Map(list.map((c) => [c.phone, c]));
  } catch (err) {
    error.value = err.message;
  }
}
load();

// Search runs on the server's rules too, but filtering the loaded list keeps typing instant.
const searched = ref(null);
let timer;
watch(q, (v) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    router.replace({ query: { ...route.query, q: v.trim() || undefined } });
    searched.value = v.trim() ? await api("GET", `/orders?q=${encodeURIComponent(v.trim())}`) : null;
  }, 180);
}, { immediate: !!q.value });

const base = computed(() => searched.value || all.value || []);
const shown = computed(() => base.value.filter((o) => !status.value || o.status === status.value));
const countFor = (s) => base.value.filter((o) => !s || o.status === s).length;
const setStatusTab = (s) => router.replace({ query: { ...route.query, status: s || undefined } });
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Orders</h1>
      <p class="muted">{{ all ? `${all.length} order${all.length === 1 ? "" : "s"} in total` : "Loading…" }}</p>
    </div>
    <RouterLink to="/orders/new" class="btn btn-primary"><Icon name="plus" />New order</RouterLink>
  </div>

  <div class="toolbar">
    <label class="search-box">
      <span class="sr-only">Search orders</span>
      <Icon name="search" />
      <input v-model="q" type="search" placeholder="Search name, phone, order #, item or tracking" autocomplete="off" />
    </label>
  </div>
  <div class="tabs" role="group" aria-label="Filter by status">
    <button type="button" :aria-pressed="!status" @click="setStatusTab('')">All <b>{{ countFor("") }}</b></button>
    <button v-for="s in STATUSES" :key="s" type="button" :aria-pressed="status === s" @click="setStatusTab(s)">{{ STATUS_LABELS[s] }} <b>{{ countFor(s) }}</b></button>
  </div>

  <p v-if="error" class="err">{{ error }}</p>
  <ul v-if="shown.length" class="order-list">
    <li v-for="o in shown" :key="o.id"><OrderRow :order="o" :customer="customers.get(o.customer.phone)" /></li>
  </ul>
  <div v-else-if="all" class="order-list empty">
    <Icon name="box" />
    <strong>{{ q ? "No orders match your search" : status ? `No ${STATUS_LABELS[status].toLowerCase()} orders` : "No orders yet" }}</strong>
    <span v-if="!q && !status">Add the first order from your DMs. It takes about 10 seconds.</span>
    <RouterLink v-if="!q && !status" to="/orders/new" class="btn btn-primary"><Icon name="plus" />Add an order</RouterLink>
  </div>
</template>
