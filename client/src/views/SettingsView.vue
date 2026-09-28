<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, isPreview } from "../lib/api.js";
import { app, logout, toast, useTitle } from "../lib/state.js";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, fillTemplate } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";

useTitle(() => "Settings");
const router = useRouter();
const form = reactive({ shop: app.user.shop, name: app.user.name, templates: { ...app.user.templates } });
const fields = ref({});
const busy = ref(false);

const labels = {
  confirm: ["Confirm order", "Sent when a new order comes in, asking the customer to reply YES."],
  shipped: ["Order shipped", "Sent when you hand the parcel to the courier."],
  delivered: ["Thank you", "Sent after delivery, asking for a review or picture."],
};
const sample = {
  number: 1042, total: 7250, courier: "TCS", tracking: "TC778812401",
  customer: { name: "Ayesha Khan", city: "Lahore", address: "House 12, Street 4, Johar Town" },
  items: [{ name: "Lawn 3-piece suit", qty: 1, price: 4500 }, { name: "Chiffon dupatta", qty: 1, price: 1500 }],
};
const previews = computed(() => Object.fromEntries(Object.keys(labels).map((k) => [k, fillTemplate(form.templates[k], sample, form.shop)])));

const tag = (ph) => "{" + ph + "}";
const boxes = {};
function insert(key, ph) {
  const el = boxes[key];
  const text = tag(ph);
  const t = form.templates[key];
  const at = el ? el.selectionStart : t.length;
  form.templates[key] = t.slice(0, at) + text + t.slice(el ? el.selectionEnd : t.length);
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(at + text.length, at + text.length);
  });
}

async function save() {
  busy.value = true;
  fields.value = {};
  try {
    app.user = (await api("PUT", "/settings", form)).user;
    toast("Settings saved");
  } catch (err) {
    fields.value = err.fields || {};
    toast(err.message);
  } finally {
    busy.value = false;
  }
}
async function signOut() {
  await logout();
  router.push("/login");
}
// Two taps, like deleting an order.
const resetArmed = ref(false);
async function resetDemo() {
  if (!resetArmed.value) {
    resetArmed.value = true;
    setTimeout(() => (resetArmed.value = false), 4000);
    return;
  }
  const { resetPreview } = await import("../lib/demoApi.js");
  resetPreview();
  location.reload();
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Settings</h1>
      <p class="muted">Logged in as {{ app.user.email }}</p>
    </div>
  </div>

  <form class="settings-grid" novalidate @submit.prevent="save">
    <section class="card">
      <div class="card-head"><h2>Your shop</h2></div>
      <div class="form-grid">
        <label class="field" :class="{ bad: fields.shop }">Shop name <small>Used in your WhatsApp messages</small>
          <input v-model="form.shop" />
          <span v-if="fields.shop" class="err">{{ fields.shop }}</span>
        </label>
        <label class="field" :class="{ bad: fields.name }">Your name
          <input v-model="form.name" />
          <span v-if="fields.name" class="err">{{ fields.name }}</span>
        </label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>WhatsApp messages</h2></div>
      <p class="small muted" style="margin-bottom:14px">Write them in your own words, in Urdu, Roman Urdu or English. Tap a tag to insert order details: it's filled in for each customer.</p>
      <div v-for="(l, key) in labels" :key="key" style="display:grid;gap:8px;margin-bottom:22px">
        <label class="field" :class="{ bad: fields[key] }">{{ l[0] }} <small>{{ l[1] }}</small>
          <textarea :ref="(el) => (boxes[key] = el)" v-model="form.templates[key]" rows="6"></textarea>
          <span v-if="fields[key]" class="err">{{ fields[key] }}</span>
        </label>
        <div class="chips">
          <button v-for="ph in PLACEHOLDERS" :key="ph" type="button" class="chip" @click="insert(key, ph)">{{ tag(ph) }}</button>
          <button v-if="form.templates[key] !== DEFAULT_TEMPLATES[key]" type="button" class="chip" style="color:var(--muted)" @click="form.templates[key] = DEFAULT_TEMPLATES[key]">Reset</button>
        </div>
        <details>
          <summary class="small muted" style="cursor:pointer">Preview</summary>
          <div class="wa-preview" style="margin-top:8px">{{ previews[key] }}</div>
        </details>
      </div>
    </section>

    <div class="form-actions sticky-actions">
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : "Save settings" }}</button>
    </div>
  </form>

  <section class="card settings-grid" style="margin-top:14px">
    <div class="card-head"><h2>Account</h2></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-ghost" @click="signOut"><Icon name="logout" />Log out</button>
      <button v-if="isPreview" type="button" class="btn btn-danger" @click="resetDemo">{{ resetArmed ? "Tap again: erase and start over" : "Reset preview data" }}</button>
    </div>
  </section>
</template>
