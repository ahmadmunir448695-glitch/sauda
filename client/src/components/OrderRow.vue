<script setup>
import { RouterLink } from "vue-router";
import StatusPill from "./StatusPill.vue";
import RiskBadge from "./RiskBadge.vue";
import { money, when } from "../lib/format.js";

defineProps({ order: { type: Object, required: true }, customer: { type: Object, default: null } });
</script>

<template>
  <RouterLink :to="`/orders/${order.id}`" class="order-row">
    <div class="or-top">
      <span class="or-num">#{{ order.number }}</span>
      <span class="or-name">{{ order.customer.name }}</span>
      <RiskBadge v-if="customer" :customer="customer" />
    </div>
    <span class="or-total">{{ money(order.total) }}</span>
    <span class="or-meta">{{ order.customer.city }} · {{ order.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ") }}</span>
    <span class="or-side"><span class="or-when">{{ when(order.createdAt) }}</span><StatusPill :status="order.status" /></span>
  </RouterLink>
</template>
