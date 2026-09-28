<script setup>
import { computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { app, loadSession } from "./lib/state.js";
import { refreshCounts } from "./lib/orders.js";
import { isPreview } from "./lib/api.js";
import AppNav from "./components/AppNav.vue";

const route = useRoute();
const signedIn = computed(() => app.user && !route.meta.guest);
watch(() => app.user?.id, (id) => id && refreshCounts(), { immediate: true });
</script>

<template>
  <div v-if="app.loadError" class="boot">
    <h1>Sauda couldn't load</h1>
    <p class="muted">{{ app.loadError }}</p>
    <button type="button" class="btn btn-primary" @click="(app.loadError = ''), loadSession()">Try again</button>
  </div>
  <div v-else-if="signedIn" class="shell">
    <AppNav />
    <p v-if="isPreview" class="preview-note">Preview: orders are saved in this browser only.</p>
    <main class="main"><RouterView /></main>
  </div>
  <template v-else>
    <p v-if="isPreview" class="preview-note" style="margin-left:0">Preview: orders are saved in this browser only.</p>
    <RouterView />
  </template>
  <div class="toast" :class="{ show: app.toast }" role="status" aria-live="polite">{{ app.toast }}</div>
</template>
