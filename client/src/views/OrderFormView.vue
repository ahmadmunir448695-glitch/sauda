<script setup>
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { toast, useTitle } from "../lib/state.js";
import { refreshCounts } from "../lib/orders.js";
import { money, when } from "../lib/format.js";
import { CITIES, normalizePhone } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import StatusPill from "../components/StatusPill.vue";

// Add a new order, or edit one when an id is given.
const props = defineProps({ id: { type: String, default: "" } });
const router = useRouter();
useTitle(() => (props.id ? "Edit order" : "New order"));

const blankItem = () => ({ name: "", qty: 1, price: "" });
const form = reactive({
  customer: { name: "", phone: "", city: "", address: "" },
  items: [blankItem()],
  delivery: 250,
  source: "Instagram",
  note: "",
});
const number = ref(null);
const fields = ref({});
const error = ref("");
const busy = ref(false);
const loaded = ref(!props.id);

if (props.id) {
  api("GET", `/orders/${props.id}`)
    .then((o) => {
      Object.assign(form, { customer: { ...o.customer }, items: o.items.map((i) => ({ ...i })), delivery: o.delivery, source: o.source, note: o.note });
      number.value = o.number;
      loaded.value = true;
    })
    .catch((err) => (error.value = err.message));
}

const subtotal = computed(() => form.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
const total = computed(() => subtotal.value + (Number(form.delivery) || 0));

// Look up this phone number's past orders while typing.
const history = ref(null);
let lookupTimer;
watch(
  () => form.customer.phone,
  (v) => {
    clearTimeout(lookupTimer);
    const phone = normalizePhone(v);
    if (!phone) return (history.value = null);
    lookupTimer = setTimeout(async () => {
      try {
        const h = await api("GET", `/customers/${phone}`);
        if (props.id) h.recent = h.recent.filter((r) => r.id !== props.id);
        history.value = h;
        // Fill in a returning customer's details if the fields are still empty.
        if (h.orders && !props.id) {
          if (!form.customer.name) form.customer.name = h.name;
          if (!form.customer.city) form.customer.city = h.city;
          if (!form.customer.address) form.customer.address = h.address;
        }
      } catch {
        history.value = null;
      }
    }, 250);
  }
);
const pastOrders = computed(() => (history.value ? history.value.orders - (props.id ? 1 : 0) : 0));

function removeItem(i) {
  form.items.splice(i, 1);
  if (!form.items.length) form.items.push(blankItem());
}

async function save() {
  busy.value = true;
  error.value = "";
  fields.value = {};
  try {
    const body = { ...form, items: form.items.filter((i) => i.name || i.price) };
    const o = props.id ? await api("PUT", `/orders/${props.id}`, body) : await api("POST", "/orders", body);
    refreshCounts();
    toast(props.id ? `Order #${o.number} saved` : `Order #${o.number} added`);
    router.replace(`/orders/${o.id}`);
  } catch (err) {
    error.value = err.message;
    fields.value = err.fields || {};
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <RouterLink :to="props.id ? `/orders/${props.id}` : '/orders'" class="back-link"><Icon name="back" />{{ props.id ? "Back to order" : "Orders" }}</RouterLink>
  <div class="page-head">
    <h1>{{ props.id ? `Edit order #${number || ""}` : "New order" }}</h1>
  </div>

  <form v-if="loaded" novalidate @submit.prevent="save">
    <section class="card">
      <div class="card-head"><h2>Customer</h2></div>
      <div class="form-grid">
        <label class="field" :class="{ bad: fields.phone }">Phone (WhatsApp)
          <input v-model="form.customer.phone" type="tel" inputmode="tel" placeholder="0300 1234567" autocomplete="off" />
          <span v-if="fields.phone" class="err">{{ fields.phone }}</span>
        </label>
        <label class="field" :class="{ bad: fields.name }">Name
          <input v-model="form.customer.name" autocomplete="off" />
          <span v-if="fields.name" class="err">{{ fields.name }}</span>
        </label>

        <div v-if="history" class="full history-box" :class="pastOrders ? (history.risk === 'high' || history.risk === 'watch' ? history.risk : 'ok') : 'new'" role="status">
          <template v-if="!pastOrders">
            <strong>New customer</strong>
            <span class="muted">No earlier orders from this number.</span>
          </template>
          <template v-else>
            <strong v-if="history.risk === 'high'">⚠ Careful: this number returned {{ history.returned }} of {{ history.orders }} orders</strong>
            <strong v-else-if="history.risk === 'watch'">This number returned {{ history.returned }} parcel{{ history.returned > 1 ? "s" : "" }} before</strong>
            <strong v-else>Returning customer ✓ {{ history.delivered }} delivered, {{ money(history.spent) }} spent</strong>
            <span v-if="history.risk !== 'ok'" class="muted">Confirm on WhatsApp before shipping, or ask for the delivery charge in advance.</span>
            <ul>
              <li v-for="r in history.recent" :key="r.id">
                <RouterLink :to="`/orders/${r.id}`" class="or-num">#{{ r.number }}</RouterLink>
                <span>{{ when(r.createdAt) }}</span>
                <span class="num">{{ money(r.total) }}</span>
                <StatusPill :status="r.status" />
              </li>
            </ul>
          </template>
        </div>

        <label class="field" :class="{ bad: fields.city }">City
          <input v-model="form.customer.city" list="cities" autocomplete="off" />
          <datalist id="cities"><option v-for="c in CITIES" :key="c" :value="c" /></datalist>
          <span v-if="fields.city" class="err">{{ fields.city }}</span>
        </label>
        <label class="field">Came from
          <select v-model="form.source">
            <option v-for="s in ['Instagram', 'Facebook', 'WhatsApp', 'TikTok', 'Website', 'Other']" :key="s">{{ s }}</option>
          </select>
        </label>
        <label class="field full" :class="{ bad: fields.address }">Delivery address
          <textarea v-model="form.customer.address" rows="2" placeholder="House, street, area, landmark"></textarea>
          <span v-if="fields.address" class="err">{{ fields.address }}</span>
        </label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Items</h2></div>
      <div class="items">
        <div class="item-row item-head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Price (Rs)</span><span></span></div>
        <template v-for="(it, i) in form.items" :key="i">
          <div class="item-row">
            <input v-model="it.name" class="input" :class="{ bad: fields[`item${i}`] }" :aria-label="`Item ${i + 1}`" placeholder="e.g. Lawn 3-piece suit" />
            <input v-model.number="it.qty" class="input num" type="number" inputmode="numeric" min="1" max="99" :aria-label="`Quantity for item ${i + 1}`" />
            <input v-model.number="it.price" class="input num" type="number" inputmode="numeric" min="0" placeholder="0" :aria-label="`Price for item ${i + 1}`" />
            <button type="button" class="icon-btn" :aria-label="`Remove item ${i + 1}`" @click="removeItem(i)"><Icon name="x" /></button>
          </div>
          <span v-if="fields[`item${i}`]" class="err">{{ fields[`item${i}`] }}</span>
        </template>
        <span v-if="fields.items" class="err">{{ fields.items }}</span>
        <button type="button" class="btn btn-ghost btn-sm add-item" @click="form.items.push(blankItem())"><Icon name="plus" />Add another item</button>
      </div>

      <div class="form-grid" style="margin-top:16px">
        <label class="field" :class="{ bad: fields.delivery }">Delivery charge (Rs) <small>Put 0 for free delivery</small>
          <input v-model.number="form.delivery" type="number" inputmode="numeric" min="0" class="num" />
          <span v-if="fields.delivery" class="err">{{ fields.delivery }}</span>
        </label>
        <div class="totals" style="align-self:end">
          <div><span>Items</span><span class="num">{{ money(subtotal) }}</span></div>
          <div><span>Delivery</span><span class="num">{{ money(Number(form.delivery) || 0) }}</span></div>
          <div class="grand"><span>Cash to collect</span><span class="num">{{ money(total) }}</span></div>
        </div>
        <label class="field full" :class="{ bad: fields.note }">Note <small>Only you see this</small>
          <input v-model="form.note" placeholder="e.g. Call before delivery, gift wrap" />
          <span v-if="fields.note" class="err">{{ fields.note }}</span>
        </label>
      </div>
    </section>

    <p v-if="error && !Object.keys(fields).length" class="err" role="alert" style="margin-top:12px">{{ error }}</p>
    <p v-else-if="Object.keys(fields).length" class="err" role="alert" style="margin-top:12px">Please fix the fields marked in red.</p>
    <div class="form-actions sticky-actions">
      <RouterLink :to="props.id ? `/orders/${props.id}` : '/orders'" class="btn btn-ghost">Cancel</RouterLink>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : props.id ? "Save changes" : `Add order · ${money(total)}` }}</button>
    </div>
  </form>
  <p v-else-if="error" class="err">{{ error }}</p>
</template>
