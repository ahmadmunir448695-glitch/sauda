<script setup>
import { RouterLink, useRouter } from "vue-router";
import { app, logout } from "../lib/state.js";
import { counts } from "../lib/orders.js";
import Icon from "./Icon.vue";

const router = useRouter();
async function signOut() {
  await logout();
  router.push("/login");
}
const links = [
  { to: "/", label: "Dashboard", icon: "home" },
  { to: "/orders", label: "Orders", icon: "orders", count: true },
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
    <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="side-link" :exact-active-class="l.to === '/' ? 'router-link-active' : ''" :active-class="l.to === '/' ? '' : 'router-link-active'">
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
  </header>

  <nav class="tabbar" aria-label="Main">
    <RouterLink to="/" class="tab" exact-active-class="router-link-active" active-class=""><Icon name="home" />Home</RouterLink>
    <RouterLink to="/orders" class="tab" :class="{ 'router-link-active': $route.path.startsWith('/orders') && $route.path !== '/orders/new' }" active-class="">
      <Icon name="orders" />Orders<span v-if="counts.new" class="dot">{{ counts.new }}</span>
    </RouterLink>
    <RouterLink to="/orders/new" class="tab tab-add" aria-label="New order"><span class="plus"><Icon name="plus" /></span></RouterLink>
    <RouterLink to="/customers" class="tab"><Icon name="users" />Customers</RouterLink>
    <RouterLink to="/settings" class="tab"><Icon name="settings" />Settings</RouterLink>
  </nav>
</template>
