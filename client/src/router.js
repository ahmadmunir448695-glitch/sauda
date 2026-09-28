import { createRouter, createWebHistory, createWebHashHistory } from "vue-router";
import { app } from "./lib/state.js";
import DashboardView from "./views/DashboardView.vue";

const routes = [
  { path: "/login", name: "login", component: () => import("./views/AuthView.vue"), meta: { guest: true } },
  { path: "/", name: "dashboard", component: DashboardView },
  { path: "/orders", name: "orders", component: () => import("./views/OrdersView.vue") },
  { path: "/orders/new", name: "new-order", component: () => import("./views/OrderFormView.vue") },
  { path: "/orders/:id", name: "order", component: () => import("./views/OrderView.vue"), props: true },
  { path: "/orders/:id/edit", name: "edit-order", component: () => import("./views/OrderFormView.vue"), props: true },
  { path: "/customers", name: "customers", component: () => import("./views/CustomersView.vue") },
  { path: "/settings", name: "settings", component: () => import("./views/SettingsView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  // The self-contained preview build has no server to answer deep links, so it uses #/ URLs.
  history: import.meta.env.MODE === "preview" ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
});

// Logged-out sellers go to the login page; logged-in ones skip it.
router.beforeEach((to) => {
  if (!app.ready) return true;
  if (!app.user && !to.meta.guest) return { path: "/login", query: to.fullPath !== "/" ? { next: to.fullPath } : {} };
  if (app.user && to.meta.guest) return "/";
  return true;
});
