import { reactive } from "vue";
import { api } from "./api.js";

// Order counts per status for the navigation badges; refreshed after every change.
export const counts = reactive({ new: 0 });

export async function refreshCounts() {
  try {
    Object.assign(counts, (await api("GET", "/dashboard")).counts);
  } catch {}
}

export async function setStatus(order, status, extra = {}) {
  const updated = await api("PATCH", `/orders/${order.id}`, { status, ...extra });
  refreshCounts();
  return updated;
}
