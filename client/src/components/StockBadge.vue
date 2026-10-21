<script setup>
// How many pieces are left, coloured by stock level.
defineProps({ product: { type: Object, required: true } });
</script>

<template>
  <span class="stock" :class="`stock-${product.level}`">
    {{ product.stock < 0 ? `Oversold by ${-product.stock}` : product.stock === 0 ? "Sold out" : product.level === "low" ? `Only ${product.stock} left` : `${product.stock} in stock` }}
  </span>
</template>
