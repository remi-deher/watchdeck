<template>
  <!-- Onglets « consulter » : les parties d'un meme element (une fiche, un bloc de
       reglages). Soulignes, dans le contenu, pour ne pas se lire comme la navigation de la
       page (AppSubnav, la capsule en haut) ni comme un filtre (UiSegmentedControl).
       Pattern Tabs de Reka UI : role tablist, fleches, et un panneau relie a son onglet.
       Le panneau de l'onglet actif est l'emplacement par defaut (`{ tab }`). -->
  <TabsRoot class="ui-tabs" :model-value="modelValue" @update:model-value="choisir">
    <TabsList class="ui-tabs__list" :aria-label="ariaLabel">
      <TabsTrigger v-for="item in items" :key="item.key" class="ui-tabs__tab" :value="item.key" :disabled="item.disabled">
        <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <small v-if="item.count != null">{{ item.count }}</small>
      </TabsTrigger>
    </TabsList>
    <TabsContent v-for="item in items" :key="item.key" class="ui-tabs__panel" :value="item.key">
      <slot :tab="item.key" />
    </TabsContent>
  </TabsRoot>
</template>

<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';

export interface UiTabItem {
  key: string;
  label: string;
  icon?: any;
  count?: number | null;
  disabled?: boolean;
}

const props = defineProps<{ modelValue: string; items: UiTabItem[]; ariaLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function choisir(value: unknown): void {
  const key = String(value ?? '');
  if (key && key !== props.modelValue) emit('update:modelValue', key);
}
</script>

<style scoped lang="scss">
.ui-tabs { display: grid; gap: var(--space-4); min-width: 0; }
.ui-tabs__list { display: flex; gap: var(--space-5); overflow-x: auto; border-bottom: 1px solid var(--border); scrollbar-width: none; }
.ui-tabs__list::-webkit-scrollbar { display: none; }
.ui-tabs__tab { position: relative; display: inline-flex; flex: none; align-items: center; gap: 6px; min-height: var(--touch-target, 44px); padding: 0; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; cursor: pointer; }
.ui-tabs__tab:hover { color: var(--text); }
.ui-tabs__tab[data-state='active'] { border-bottom-color: var(--accent); color: var(--text); }
.ui-tabs__tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
.ui-tabs__tab[data-disabled] { opacity: .45; cursor: not-allowed; }
.ui-tabs__tab svg { width: 15px; height: 15px; }
.ui-tabs__tab small { padding: 1px 6px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-xs); }
.ui-tabs__panel { min-width: 0; }
.ui-tabs__panel:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: var(--radius-sm); }
</style>
