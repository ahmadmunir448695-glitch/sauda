<script setup>
import { computed, reactive, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { toast, useTitle } from "../lib/state.js";
import { money, when } from "../lib/format.js";
import { MOVE_LABELS } from "../../../shared/core.js";
import Icon from "../components/Icon.vue";
import StockBadge from "../components/StockBadge.vue";

// Add a product, or edit one and change its stock when an id is given.
const props = defineProps({ id: { type: String, default: "" } });
const router = useRouter();
const product = ref(null);
useTitle(() => (props.id ? product.value?.name || "Product" : "Add product"));

const form = reactive({ name: "", price: "", cost: "", stock: "", lowStock: 3 });
const fields = ref({});
const error = ref("");
const busy = ref(false);
const loaded = ref(!props.id);

function show(p) {
  product.value = p;
  Object.assign(form, { name: p.name, price: p.price, cost: p.cost, lowStock: p.lowStock });
  loaded.value = true;
}
if (props.id) api("GET", `/products/${props.id}`).then(show).catch((err) => (error.value = err.message));

const perPiece = computed(() => (Number(form.price) || 0) - (Number(form.cost) || 0));
const margin = computed(() => (Number(form.price) ? Math.round((perPiece.value / Number(form.price)) * 100) : 0));

async function save() {
  busy.value = true;
  error.value = "";
  fields.value = {};
  try {
    if (props.id) {
      show(await api("PUT", `/products/${props.id}`, form));
      toast("Product saved");
    } else {
      const p = await api("POST", "/products", form);
      toast(`${p.name} added`);
      router.replace("/stock");
    }
  } catch (err) {
    error.value = err.message;
    fields.value = err.fields || {};
  } finally {
    busy.value = false;
  }
}

// Receiving new pieces, taking some out (damaged, gifted) or setting the count after counting.
const qty = ref("");
const qtyError = ref("");
const moving = ref(false);
async function changeStock(kind) {
  const n = Number(qty.value);
  const body = kind === "count" ? { count: qty.value === "" ? "" : n } : { add: kind === "add" ? n : -n };
  moving.value = true;
  qtyError.value = "";
  try {
    show(await api("POST", `/products/${props.id}/stock`, body));
    qty.value = "";
    toast(kind === "count" ? `Stock set to ${product.value.stock}` : `${kind === "add" ? "Added" : "Took out"} ${n} piece${n === 1 ? "" : "s"}`);
  } catch (err) {
    qtyError.value = err.fields?.qty || err.message;
  } finally {
    moving.value = false;
  }
}

const moveLabel = (m) => (m.reason === "order" ? (m.change < 0 ? `Order #${m.number}` : `Back from order #${m.number}`) : MOVE_LABELS[m.reason]);

// Deleting takes two taps, like an order.
const armed = ref(false);
let armTimer;
async function remove() {
  if (!armed.value) {
    armed.value = true;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => (armed.value = false), 4000);
    return;
  }
  await api("DELETE", `/products/${props.id}`);
  toast(`${product.value.name} deleted`);
  router.replace("/stock");
}
</script>

<template>
  <RouterLink to="/stock" class="back-link"><Icon name="back" />Stock</RouterLink>
  <div class="page-head">
    <h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      {{ props.id ? product?.name || "" : "Add product" }}
      <StockBadge v-if="product" :product="product" />
    </h1>
    <button v-if="product" type="button" class="btn btn-danger btn-sm" @click="remove"><Icon name="trash" />{{ armed ? "Tap again to delete" : "Delete" }}</button>
  </div>
  <p v-if="error && !loaded" class="err">{{ error }}</p>

  <div v-if="loaded" class="detail-grid" :class="{ single: !product }">
    <form class="detail-col" novalidate @submit.prevent="save">
      <section class="card">
        <div class="card-head"><h2>Details</h2></div>
        <div class="form-grid">
          <label class="field full" :class="{ bad: fields.name }">Name <small>As you write it on orders</small>
            <input v-model="form.name" placeholder="e.g. Lawn 3-piece suit" autocomplete="off" />
            <span v-if="fields.name" class="err">{{ fields.name }}</span>
          </label>
          <label class="field" :class="{ bad: fields.price }">Selling price (Rs)
            <input v-model.number="form.price" type="number" inputmode="numeric" min="0" class="num" />
            <span v-if="fields.price" class="err">{{ fields.price }}</span>
          </label>
          <label class="field" :class="{ bad: fields.cost }">Cost price (Rs) <small>What one piece costs you</small>
            <input v-model.number="form.cost" type="number" inputmode="numeric" min="0" class="num" />
            <span v-if="fields.cost" class="err">{{ fields.cost }}</span>
          </label>
          <label v-if="!props.id" class="field" :class="{ bad: fields.stock }">In stock now <small>Pieces you have</small>
            <input v-model.number="form.stock" type="number" inputmode="numeric" min="0" class="num" placeholder="0" />
            <span v-if="fields.stock" class="err">{{ fields.stock }}</span>
          </label>
          <label class="field" :class="{ bad: fields.lowStock }">Warn me at <small>Pieces left before it shows as running low</small>
            <input v-model.number="form.lowStock" type="number" inputmode="numeric" min="0" class="num" />
            <span v-if="fields.lowStock" class="err">{{ fields.lowStock }}</span>
          </label>
          <div v-if="form.price !== '' && form.cost !== ''" class="totals full">
            <div class="grand" style="border:0;padding:0" :style="{ color: perPiece < 0 ? 'var(--danger)' : '' }">
              <span>{{ perPiece < 0 ? "You lose on each piece" : "You make on each piece" }}</span>
              <span class="num">{{ money(Math.abs(perPiece)) }} · {{ margin }}%</span>
            </div>
            <span class="small muted">Before the courier charge. Old orders keep the cost they had when they were placed.</span>
          </div>
        </div>
      </section>
      <p v-if="error && Object.keys(fields).length" class="err" role="alert">Please fix the fields marked in red.</p>
      <p v-else-if="error" class="err" role="alert">{{ error }}</p>
      <div class="form-actions sticky-actions">
        <RouterLink to="/stock" class="btn btn-ghost">Cancel</RouterLink>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : props.id ? "Save changes" : "Add product" }}</button>
      </div>
    </form>

    <div v-if="product" class="detail-col stock-col">
      <section class="card">
        <div class="card-head"><h2>Stock</h2><span class="muted small">{{ product.sold30 }} sold in 30 days</span></div>
        <p class="stock-count num" :class="`stock-${product.level}`">{{ product.stock }} <span>piece{{ product.stock === 1 ? "" : "s" }}</span></p>
        <p class="small muted" style="margin-bottom:12px">Orders take pieces out by themselves. Cancelled and returned orders put them back.</p>
        <form class="stock-move" novalidate @submit.prevent="changeStock('add')">
          <label class="field" :class="{ bad: qtyError }">Pieces
            <input v-model.number="qty" type="number" inputmode="numeric" min="0" class="num" placeholder="0" />
          </label>
          <button type="submit" class="btn btn-primary" :disabled="moving"><Icon name="plus" />Add</button>
          <button type="button" class="btn btn-ghost" :disabled="moving" @click="changeStock('remove')"><Icon name="minus" />Take out</button>
        </form>
        <span v-if="qtyError" class="err">{{ qtyError }}</span>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" :disabled="moving" @click="changeStock('count')">Counted it? Set stock to this number</button>
      </section>

      <section class="card">
        <div class="card-head"><h2>Stock history</h2></div>
        <ol v-if="product.moves.length" class="moves">
          <li v-for="(m, i) in product.moves" :key="i">
            <span class="mv-change num" :class="m.change > 0 ? 'up' : 'down'">{{ m.change > 0 ? "+" : "−" }}{{ Math.abs(m.change) }}</span>
            <RouterLink v-if="m.orderId" :to="`/orders/${m.orderId}`">{{ moveLabel(m) }}</RouterLink>
            <span v-else>{{ moveLabel(m) }}</span>
            <span class="muted small">{{ when(m.at) }}</span>
            <span class="muted small num">{{ m.stock }} left</span>
          </li>
        </ol>
        <p v-else class="small muted">No changes yet.</p>
      </section>
    </div>
  </div>
</template>
