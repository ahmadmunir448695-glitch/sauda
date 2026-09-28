<script setup>
import { STATUS_LABELS } from "../../../shared/core.js";
defineProps({ status: { type: String, required: true } });
</script>

<template>
  <span class="pill" :class="`s-${status}`">{{ STATUS_LABELS[status] }}</span>
</template>
