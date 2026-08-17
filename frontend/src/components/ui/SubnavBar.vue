<template>
  <label v-if="items.length > 2" class="subnav-mobile-select">
    <span>{{ ariaLabel }}</span>
    <select :value="active" :aria-label="ariaLabel" @change="navigate(($event.target as HTMLSelectElement).value)">
      <option v-for="item in items" :key="item.key" :value="item.key">{{ item.count != null ? `${item.label} (${item.count})` : item.label }}</option>
    </select>
  </label>
  <nav class="subnav-bar" :class="{ 'has-mobile-select': items.length > 2 }" :aria-label="ariaLabel">
    <template v-for="(item, i) in items" :key="item.key">
      <span v-if="i > 0 && item.group && item.group !== items[i - 1].group" class="subnav-separator" aria-hidden="true" />
      <RouterLink
        :to="item.to"
        :class="{ active: item.key === active }"
        :aria-current="item.key === active ? 'page' : undefined"
      >
        <component :is="item.icon" v-if="item.icon" />
        <span>{{ item.label }}</span>
        <small v-if="item.count != null">{{ item.count }}</small>
      </RouterLink>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

export interface SubnavItem {
  key: string;
  label: string;
  to: string | Record<string, any>;
  icon?: any;
  count?: number | string | null;
  group?: string;
}

const props = withDefaults(
  defineProps<{
    items: SubnavItem[];
    active?: string;
    ariaLabel?: string;
  }>(),
  {
    active: '',
    ariaLabel: 'Navigation',
  }
);

const router = useRouter();

function navigate(key: string): void {
  const item = props.items.find((entry) => entry.key === key);
  if (item?.to) router.push(item.to);
}
</script>

<style scoped lang="scss">
.subnav-bar { display: flex; width: fit-content; max-width: 100%; gap: var(--space-1); margin: 0 auto 16px; padding: 5px; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); scrollbar-width: none; scroll-snap-type: x proximity; overscroll-behavior-x: contain; }
.subnav-bar::-webkit-scrollbar { display: none; }
.subnav-bar a { display: flex; align-items: center; gap: var(--space-2); flex: none; min-height: 44px; padding: 7px 11px; border-radius: var(--radius-sm); color: var(--muted); font-size: var(--fs-sm); font-weight: 650; text-decoration: none; white-space: nowrap; scroll-snap-align: start; }
.subnav-bar a:hover { color: var(--text); background: rgba(255, 255, 255, .04); }
.subnav-bar a.active { color: var(--text); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border); }
.subnav-bar svg { width: 15px; }
.subnav-bar a.active svg { color: var(--accent); }
.subnav-bar small { display: grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; border-radius: var(--radius-pill); background: rgba(229, 160, 13, .15); color: var(--accent); font-size: var(--fs-xs); }
.subnav-separator { flex: none; width: 1px; align-self: stretch; margin: 6px 2px; background: var(--border); }
.subnav-mobile-select { display: none; }
@media (max-width: 767.98px) {
  .subnav-bar.has-mobile-select { display: none; }
  .subnav-mobile-select { display: grid; gap: 5px; width: 100%; margin: 0 0 16px; }
  .subnav-mobile-select > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
  .subnav-mobile-select select { width: 100%; min-width: 0; min-height: 44px; padding: 0 38px 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--surface-2); color: var(--text); font: inherit; font-weight: 650; }
  .subnav-bar a { padding-inline: 10px; }
  .subnav-bar svg { display: none; }
}
</style>
