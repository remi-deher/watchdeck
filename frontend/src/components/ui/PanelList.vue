<template>
  <div class="panel-list" role="list">
    <article v-for="(item, index) in items" :key="resolveKey(item, index)" class="detail-row panel-list-item" role="listitem">
      <slot :item="item" :index="index" />
    </article>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
const props = withDefaults(defineProps<{
  items?: T[];
  itemKey?: keyof T | ((item: T, index: number) => string | number);
}>(), {
  items: () => [],
  itemKey: 'id',
});

function resolveKey(item: T, index: number): string | number {
  if (typeof props.itemKey === 'function') return props.itemKey(item, index);
  return item[props.itemKey] ?? index;
}
</script>

<style scoped lang="scss">
.panel-list { display: grid; }
.panel-list-item:last-child { border-bottom: 0; }
</style>
