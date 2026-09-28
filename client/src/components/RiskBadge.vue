<script setup>
// Warning for customers who refused parcels before.
defineProps({ customer: { type: Object, required: true } });
</script>

<template>
  <span v-if="customer.risk === 'high'" class="risk risk-high" :title="`Returned ${customer.returned} of ${customer.orders} orders`">⚠ Returned {{ customer.returned }}×</span>
  <span v-else-if="customer.risk === 'watch'" class="risk risk-watch" :title="`Returned ${customer.returned} of ${customer.orders} orders`">Returned {{ customer.returned }}×</span>
</template>
