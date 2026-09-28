<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { app, toast, useTitle } from "../lib/state.js";
import { refreshCounts, setStatus } from "../lib/orders.js";
import { money, fullDate } from "../lib/format.js";
import { COURIERS, STATUS_LABELS, fillTemplate, prettyPhone, templateFor, waLink } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import StatusPill from "../components/StatusPill.vue";
import RiskBadge from "../components/RiskBadge.vue";

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const order = ref(null);
const customer = ref(null);
const error = ref("");
const busy = ref(false);
useTitle(() => (order.value ? `Order #${order.value.number}` : "Order"));

async function load() {
  try {
    order.value = await api("GET", `/orders/${props.id}`);
    customer.value = await api("GET", `/customers/${order.value.customer.phone}`);
  } catch (err) {
    error.value = err.message;
  }
}
load();

// Shipping details for the "Mark as shipped" step.
const courier = ref("");
const tracking = ref("");
watch(order, (o) => {
  if (!o) return;
  let last = "";
  try {
    last = localStorage.getItem("sauda-last-courier") || "";
  } catch {}
  courier.value = o.courier || last || "TCS";
  tracking.value = o.tracking || "";
});

async function move(status, extra = {}) {
  busy.value = true;
  try {
    order.value = await setStatus(order.value, status, extra);
    if (extra.courier) {
      try {
        localStorage.setItem("sauda-last-courier", extra.courier);
      } catch {}
    }
    customer.value = await api("GET", `/customers/${order.value.customer.phone}`);
    toast(`Order #${order.value.number}: ${STATUS_LABELS[status].toLowerCase()}`);
    template.value = templateFor(status);
  } catch (err) {
    toast(err.message);
  } finally {
    busy.value = false;
  }
}

// Deleting takes two taps: the first arms the button for a few seconds.
const armed = ref(false);
let armTimer;
async function remove() {
  if (!armed.value) {
    armed.value = true;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => (armed.value = false), 4000);
    return;
  }
  await api("DELETE", `/orders/${order.value.id}`);
  refreshCounts();
  toast(`Order #${order.value.number} deleted`);
  router.replace("/orders");
}

// WhatsApp messages
const template = ref("confirm");
watch(order, (o, old) => o && !old && (template.value = templateFor(o.status)), { immediate: true });
const message = computed(() => (order.value ? fillTemplate(app.user.templates[template.value], order.value, app.user.shop) : ""));
const waHref = computed(() => waLink(order.value.customer.phone, message.value));
async function copy() {
  try {
    await navigator.clipboard.writeText(message.value);
    toast("Message copied");
  } catch {
    toast("Couldn't copy. Select the text and copy it.");
  }
}

const pieces = computed(() => order.value.items.reduce((s, i) => s + i.qty, 0));
const steps = ["new", "confirmed", "shipped", "delivered"];
const reached = computed(() => {
  const o = order.value;
  if (!o) return -1;
  if (o.status === "returned") return 2;
  if (o.status === "cancelled") return o.history.some((h) => h.status === "shipped") ? 2 : o.history.some((h) => h.status === "confirmed") ? 1 : 0;
  return steps.indexOf(o.status);
});
const failed = computed(() => ["returned", "cancelled"].includes(order.value?.status));
</script>

<template>
  <RouterLink to="/orders" class="back-link"><Icon name="back" />Orders</RouterLink>
  <p v-if="error" class="err">{{ error }}</p>
  <template v-if="order">
    <div class="page-head">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Order #{{ order.number }} <StatusPill :status="order.status" /></h1>
        <p class="muted small">{{ fullDate(order.createdAt) }} · from {{ order.source }}</p>
      </div>
      <div style="display:flex;gap:8px">
        <RouterLink :to="`/orders/${order.id}/edit`" class="btn btn-ghost btn-sm"><Icon name="edit" />Edit</RouterLink>
        <button type="button" class="btn btn-danger btn-sm" @click="remove"><Icon name="trash" />{{ armed ? "Tap again to delete" : "Delete" }}</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-col">
        <section class="card">
          <div class="steps" aria-label="Order progress">
            <div v-for="(s, i) in steps" :key="s" class="step" :class="{ done: i <= reached, fail: failed && i === reached + 1 }">
              <i></i>{{ failed && i === reached + 1 ? STATUS_LABELS[order.status] : STATUS_LABELS[s] }}
            </div>
          </div>

          <div class="next-actions">
            <template v-if="order.status === 'new'">
              <p class="small muted">Send the order details on WhatsApp. When the customer replies "yes", mark it confirmed.</p>
              <a class="btn btn-wa" :href="waLink(order.customer.phone, fillTemplate(app.user.templates.confirm, order, app.user.shop))" target="_blank" rel="noopener"><Icon name="wa" />Ask customer to confirm</a>
              <button type="button" class="btn btn-primary" :disabled="busy" @click="move('confirmed')"><Icon name="check" />Customer confirmed</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="move('cancelled')">Cancel order</button>
            </template>

            <template v-else-if="order.status === 'confirmed'">
              <p class="small muted">Book the parcel with your courier, then add the tracking number.</p>
              <div class="ship-form">
                <label class="field">Courier
                  <select v-model="courier"><option v-for="c in COURIERS" :key="c">{{ c }}</option></select>
                </label>
                <label class="field">Tracking number <small>optional</small>
                  <input v-model="tracking" autocomplete="off" />
                </label>
              </div>
              <button type="button" class="btn btn-primary" :disabled="busy" @click="move('shipped', { courier, tracking })"><Icon name="truck" />Mark as shipped</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="move('cancelled')">Cancel order</button>
            </template>

            <template v-else-if="order.status === 'shipped'">
              <p class="small muted">With {{ order.courier || "the courier" }}<template v-if="order.tracking"> · tracking <b>{{ order.tracking }}</b></template>. Did the customer take the parcel?</p>
              <button type="button" class="btn btn-primary" :disabled="busy" @click="move('delivered')"><Icon name="check" />Delivered, cash received</button>
              <button type="button" class="btn btn-danger" :disabled="busy" @click="move('returned')"><Icon name="alert" />Customer refused, returned</button>
            </template>

            <template v-else>
              <p class="small muted">
                {{ order.status === "delivered" ? "Done! Send a thank-you and ask for a review." : order.status === "returned" ? "This number is now flagged on future orders." : "This order was cancelled." }}
              </p>
              <button v-if="order.status !== 'delivered'" type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="move('new')">Reopen as new order</button>
            </template>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Items</h2><span class="muted small">{{ pieces }} piece{{ pieces === 1 ? "" : "s" }}</span></div>
          <table class="line-items">
            <tbody>
              <tr v-for="(it, i) in order.items" :key="i">
                <td>{{ it.name }}<span v-if="it.qty > 1" class="muted"> × {{ it.qty }}</span></td>
                <td>{{ money(it.qty * it.price) }}</td>
              </tr>
              <tr><td class="muted">Delivery</td><td>{{ order.delivery ? money(order.delivery) : "Free" }}</td></tr>
            </tbody>
          </table>
          <div class="totals" style="margin-top:12px"><div class="grand" style="border:0;padding:0"><span>Cash to collect</span><span class="num">{{ money(order.total) }}</span></div></div>
          <p v-if="order.note" class="small" style="margin-top:12px"><b>Note:</b> {{ order.note }}</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>History</h2></div>
          <ol class="timeline">
            <li v-for="(h, i) in [...order.history].reverse()" :key="i"><StatusPill :status="h.status" /><span class="muted">{{ fullDate(h.at) }}</span></li>
          </ol>
        </section>
      </div>

      <div class="detail-col">
        <section class="card">
          <div class="card-head"><h2>Customer</h2><RiskBadge v-if="customer" :customer="customer" /></div>
          <dl class="kv">
            <dt>Name</dt><dd>{{ order.customer.name }}</dd>
            <dt>Phone</dt><dd><a :href="`tel:${order.customer.phone}`">{{ prettyPhone(order.customer.phone) }}</a></dd>
            <dt>City</dt><dd>{{ order.customer.city }}</dd>
            <dt>Address</dt><dd>{{ order.customer.address }}</dd>
            <template v-if="customer && customer.orders > 1">
              <dt>History</dt>
              <dd>{{ customer.orders }} orders · {{ customer.delivered }} delivered · {{ customer.returned }} returned</dd>
            </template>
          </dl>
        </section>

        <section class="card">
          <div class="card-head"><h2>WhatsApp message</h2></div>
          <div class="wa-list">
            <div class="seg" role="tablist" aria-label="Message" style="grid-template-columns:repeat(3,1fr)">
              <button v-for="t in [['confirm', 'Confirm'], ['shipped', 'Shipped'], ['delivered', 'Thank you']]" :key="t[0]" type="button" role="tab" :aria-selected="template === t[0]" @click="template = t[0]">{{ t[1] }}</button>
            </div>
            <div class="wa-preview">{{ message }}</div>
            <div style="display:flex;gap:8px">
              <a class="btn btn-wa" style="flex:1" :href="waHref" target="_blank" rel="noopener"><Icon name="wa" />Open in WhatsApp</a>
              <button type="button" class="btn btn-ghost" @click="copy">Copy</button>
            </div>
            <RouterLink to="/settings" class="small muted">Change these messages in Settings</RouterLink>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>
