<script setup>
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/state.js";
import { money } from "../lib/format.js";
import Icon from "../components/Icon.vue";
import StockBadge from "../components/StockBadge.vue";

useTitle(() => "Stock");
const route = useRoute();
const router = useRouter();
const list = ref(null);
const error = ref("");
const q = ref("");
api("GET", "/products").then((l) => (list.value = l)).catch((err) => (error.value = err.message));

const show = computed(() => (["low", "out"].includes(route.query.show) ? route.query.show : ""));
const setShow = (s) => router.replace({ query: { ...route.query, show: s || undefined } });
const countFor = (s) => (list.value || []).filter((p) => !s || p.level === s).length;

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return (list.value || []).filter((p) => (!show.value || p.level === show.value) && (!needle || p.name.toLowerCase().includes(needle)));
});
const pieces = computed(() => (list.value || []).reduce((s, p) => s + Math.max(0, p.stock), 0));
const value = computed(() => (list.value || []).reduce((s, p) => s + Math.max(0, p.stock) * p.cost, 0));
const margin = (p) => (p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0);
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Stock</h1>
      <p class="muted">
        <template v-if="!list">Loading…</template>
        <template v-else>{{ list.length }} product{{ list.length === 1 ? "" : "s" }} · {{ pieces }} piece{{ pieces === 1 ? "" : "s" }} worth {{ money(value) }} at cost</template>
      </p>
    </div>
    <RouterLink to="/stock/new" class="btn btn-primary"><Icon name="plus" />Add product</RouterLink>
  </div>

  <template v-if="list && list.length">
    <div class="toolbar">
      <label class="search-box">
        <span class="sr-only">Search products</span>
        <Icon name="search" />
        <input v-model="q" type="search" placeholder="Search products" autocomplete="off" />
      </label>
    </div>
    <div class="tabs" role="group" aria-label="Filter by stock">
      <button type="button" :aria-pressed="!show" @click="setShow('')">All <b>{{ countFor("") }}</b></button>
      <button type="button" :aria-pressed="show === 'low'" @click="setShow('low')">Running low <b>{{ countFor("low") }}</b></button>
      <button type="button" :aria-pressed="show === 'out'" @click="setShow('out')">Sold out <b>{{ countFor("out") }}</b></button>
    </div>
  </template>
  <p v-if="error" class="err">{{ error }}</p>

  <template v-if="shown.length">
    <div class="table-wrap products">
      <table class="list">
        <thead>
          <tr><th>Product</th><th class="r">Price</th><th class="r">Cost</th><th class="r">You make</th><th class="r">Sold, 30 days</th><th>In stock</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in shown" :key="p.id" class="link-row" @click="router.push(`/stock/${p.id}`)">
            <td><RouterLink :to="`/stock/${p.id}`" class="cust-name" @click.stop>{{ p.name }}</RouterLink></td>
            <td class="r">{{ money(p.price) }}</td>
            <td class="r muted">{{ money(p.cost) }}</td>
            <td class="r">{{ money(p.price - p.cost) }} <span class="muted small">{{ margin(p) }}%</span></td>
            <td class="r">{{ p.sold30 }}</td>
            <td><StockBadge :product="p" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="product-cards">
      <li v-for="p in shown" :key="p.id">
        <RouterLink :to="`/stock/${p.id}`" class="cust-card">
          <div class="row"><span class="cust-name">{{ p.name }}</span><StockBadge :product="p" /></div>
          <div class="figs">
            <span><b>{{ money(p.price) }}</b> price</span>
            <span><b>{{ money(p.price - p.cost) }}</b> you make ({{ margin(p) }}%)</span>
            <span><b>{{ p.sold30 }}</b> sold in 30 days</span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </template>
  <div v-else-if="list" class="order-list empty">
    <Icon name="box" />
    <template v-if="list.length">
      <strong>{{ q ? "No products match your search" : show === "out" ? "Nothing is sold out" : "Nothing is running low" }}</strong>
    </template>
    <template v-else>
      <strong>No products yet</strong>
      <span>Add what you sell with what it costs you. Sauda takes pieces out of stock as orders come in, puts them back when a parcel is returned, and works out your profit.</span>
      <RouterLink to="/stock/new" class="btn btn-primary"><Icon name="plus" />Add a product</RouterLink>
    </template>
  </div>
</template>
