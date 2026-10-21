<script setup>
import { RouterLink, useRoute, useRouter } from "vue-router";
import { app, logout } from "../lib/state.js";
import { counts } from "../lib/orders.js";
import Icon from "./Icon.vue";

const router = useRouter();
const route = useRoute();
// A section stays highlighted on its inner pages, like an order or a product.
const inSection = (to) => (to === "/" ? route.path === "/" : route.path === to || (route.path.startsWith(to + "/") && route.path !== "/orders/new"));
async function signOut() {
  await logout();
  router.push("/login");
}
const links = [
  { to: "/", label: "Dashboard", icon: "home" },
  { to: "/orders", label: "Orders", icon: "orders", count: true },
  { to: "/stock", label: "Stock", icon: "box" },
  { to: "/customers", label: "Customers", icon: "users" },
  { to: "/settings", label: "Settings", icon: "settings" },
];
</script>

<template>
  <nav class="sidenav" aria-label="Main">
    <RouterLink to="/" class="brand">
      <span class="brand-mark">S</span>
      <span><span class="brand-name">Sauda</span><span class="brand-shop">{{ app.user.shop }}</span></span>
    </RouterLink>
    <div class="side-new"><RouterLink to="/orders/new" class="btn"><Icon name="plus" />New order</RouterLink></div>
    <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="side-link" :class="{ 'router-link-active': inSection(l.to) }" active-class="" exact-active-class="">
      <Icon :name="l.icon" />{{ l.label }}
      <span v-if="l.count && counts.new" class="count" :title="`${counts.new} new orders to confirm`">{{ counts.new }}</span>
    </RouterLink>
    <div class="side-foot">
      <button type="button" class="side-link" style="background:none;border:0;text-align:left" @click="signOut"><Icon name="logout" />Log out</button>
    </div>
  </nav>

  <header class="topbar">
    <RouterLink to="/" class="brand">
      <span class="brand-mark">S</span>
      <span><span class="brand-name">Sauda</span><span class="brand-shop">{{ app.user.shop }}</span></span>
    </RouterLink>
    <RouterLink to="/settings" class="top-icon" aria-label="Settings"><Icon name="settings" /></RouterLink>
  </header>

  <nav class="tabbar" aria-label="Main">
    <RouterLink to="/" class="tab" exact-active-class="router-link-active" active-class=""><Icon name="home" />Home</RouterLink>
    <RouterLink to="/orders" class="tab" :class="{ 'router-link-active': inSection('/orders') }" active-class="">
      <Icon name="orders" />Orders<span v-if="counts.new" class="dot">{{ counts.new }}</span>
    </RouterLink>
    <RouterLink to="/orders/new" class="tab tab-add" aria-label="New order"><span class="plus"><Icon name="plus" /></span></RouterLink>
    <RouterLink to="/stock" class="tab" :class="{ 'router-link-active': inSection('/stock') }" active-class=""><Icon name="box" />Stock</RouterLink>
    <RouterLink to="/customers" class="tab"><Icon name="users" />Customers</RouterLink>
  </nav>
</template>
