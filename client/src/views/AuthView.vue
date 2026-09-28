<script setup>
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, register, useTitle } from "../lib/state.js";
import { isPreview } from "../lib/api.js";
import Icon from "../components/Icon.vue";

useTitle(() => "Log in");
const route = useRoute();
const router = useRouter();
const mode = ref(route.query.mode === "signup" ? "signup" : "login");
const form = reactive({ name: "", shop: "", email: isPreview ? "demo@sauda.pk" : "", password: isPreview ? "demo1234" : "" });
const fields = ref({});
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  fields.value = {};
  try {
    if (mode.value === "login") await login(form.email, form.password);
    else await register({ ...form });
    router.replace(typeof route.query.next === "string" && route.query.next.startsWith("/") ? route.query.next : "/");
  } catch (err) {
    error.value = err.message;
    fields.value = err.fields || {};
  } finally {
    busy.value = false;
  }
}
function switchTo(m) {
  mode.value = m;
  error.value = "";
  fields.value = {};
  if (m === "signup" && isPreview) Object.assign(form, { email: "", password: "" });
}
</script>

<template>
  <div class="auth">
    <section class="auth-pitch">
      <div class="brand" style="padding:0">
        <span class="brand-mark">S</span><span class="brand-name">Sauda</span>
      </div>
      <h1>Every DM order, <em>in one place.</em></h1>
      <p>The order book for Instagram, Facebook and WhatsApp sellers. Add cash-on-delivery orders in seconds, confirm them on WhatsApp, and see who refuses parcels before you ship.</p>
      <ul>
        <li><Icon name="wa" />One tap sends a ready WhatsApp message: confirm order, tracking number, thank you.</li>
        <li><Icon name="shield" />Warns you when a phone number has returned parcels before.</li>
        <li><Icon name="truck" />Track every order from new to delivered, with courier and tracking.</li>
        <li><Icon name="home" />See today's orders, cash still with couriers and your return rate.</li>
      </ul>
    </section>

    <section class="auth-panel">
      <form class="auth-card" novalidate @submit.prevent="submit">
        <div class="seg" role="tablist" aria-label="Log in or sign up">
          <button type="button" role="tab" :aria-selected="mode === 'login'" @click="switchTo('login')">Log in</button>
          <button type="button" role="tab" :aria-selected="mode === 'signup'" @click="switchTo('signup')">Create account</button>
        </div>
        <p v-if="isPreview && mode === 'login'" class="demo-note">Demo shop: <b>demo@sauda.pk</b> / <b>demo1234</b> (already filled in).</p>

        <template v-if="mode === 'signup'">
          <label class="field" :class="{ bad: fields.name }">Your name
            <input v-model="form.name" autocomplete="name" required />
            <span v-if="fields.name" class="err">{{ fields.name }}</span>
          </label>
          <label class="field" :class="{ bad: fields.shop }">Shop name <small>As customers know it, e.g. your Instagram page</small>
            <input v-model="form.shop" autocomplete="organization" required />
            <span v-if="fields.shop" class="err">{{ fields.shop }}</span>
          </label>
        </template>
        <label class="field" :class="{ bad: fields.email }">Email
          <input v-model="form.email" type="email" autocomplete="email" inputmode="email" required />
          <span v-if="fields.email" class="err">{{ fields.email }}</span>
        </label>
        <label class="field" :class="{ bad: fields.password }">Password <small v-if="mode === 'signup'">At least 8 characters</small>
          <input v-model="form.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required />
          <span v-if="fields.password" class="err">{{ fields.password }}</span>
        </label>
        <p v-if="error && !Object.keys(fields).length" class="err" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="busy">
          {{ busy ? "Please wait…" : mode === "login" ? "Log in" : "Create my shop" }}
        </button>
      </form>
    </section>
  </div>
</template>
