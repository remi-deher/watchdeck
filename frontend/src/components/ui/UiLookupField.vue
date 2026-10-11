<template>
  <div class="ui-lookup">
    <!-- Ce qui est retenu, d'abord : quand la détection a déjà trouvé la bonne fiche, il n'y a
         rien à saisir, juste à confirmer d'un coup d'œil. -->
    <div class="ui-lookup__selected" :class="{ 'is-empty': !modelValue }">
      <span class="ui-lookup__image">
        <img v-if="modelValue?.image && !failed" :src="modelValue.image" alt="" @error="failed = true">
        <component :is="icon" v-else aria-hidden="true" />
      </span>
      <span class="ui-lookup__text">
        <strong>{{ modelValue ? modelValue.title : emptyLabel }}</strong>
        <small v-if="modelValue?.subtitle">{{ modelValue.subtitle }}</small>
        <span v-if="modelValue?.note" class="ui-lookup__chip"><Check aria-hidden="true" />{{ modelValue.note }}</span>
      </span>
      <button v-if="modelValue && !open" type="button" class="ui-lookup__change" @click="open = true">Changer…</button>
    </div>

    <div v-if="open || !modelValue" class="ui-lookup__panel">
      <div class="ui-lookup__row">
        <input :id="id" v-model="query" class="input" type="search" :placeholder="placeholder" :aria-describedby="describedBy" @keydown.enter.prevent="run">
        <UiButton :loading="busy" @click="run"><template #icon><Search /></template>Chercher</UiButton>
      </div>
      <p v-if="searched && !results.length && !busy" class="ui-lookup__none">Aucun résultat pour « {{ searchedQuery }} ».</p>
      <p v-if="failure" class="ui-lookup__none is-error" role="alert">{{ failure }}</p>
      <ul v-if="results.length" class="ui-lookup__list">
        <li v-for="item in results" :key="item.key">
          <button type="button" class="ui-lookup__result" :class="{ 'is-selected': item.key === modelValue?.key }" :disabled="item.disabled" :title="item.disabled ? item.reason : undefined" @click="pick(item)">
            <span class="ui-lookup__image is-small">
              <img v-if="item.image" :src="item.image" alt="">
              <component :is="icon" v-else aria-hidden="true" />
            </span>
            <span class="ui-lookup__text"><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span>
            <Check v-if="item.key === modelValue?.key" class="ui-lookup__check" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, type Component } from 'vue';
import { Check, Clapperboard, Search } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { humanizeError } from '@/utils/apiError';

/** Un résultat de recherche. `disabled` + `reason` : trouvé, mais pas retenable (dit pourquoi). */
export interface LookupItem {
  key: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  /** Mention sous le titre de l'élément retenu (« Détecté automatiquement »). */
  note?: string;
  disabled?: boolean;
  reason?: string;
  /** Ce que la page retient de l'élément. */
  payload?: any;
}

const props = withDefaults(defineProps<{
  modelValue?: LookupItem | null;
  search: (query: string) => Promise<LookupItem[]>;
  placeholder?: string;
  emptyLabel?: string;
  icon?: Component;
  id?: string;
  describedBy?: string;
  /** Texte cherché d'emblée à l'ouverture de la recherche. */
  initialQuery?: string;
}>(), { modelValue: null, placeholder: 'Chercher…', emptyLabel: 'Rien de sélectionné', icon: () => Clapperboard, id: undefined, describedBy: undefined, initialQuery: '' });
const emit = defineEmits<{ 'update:modelValue': [item: LookupItem] }>();

const query = ref(props.initialQuery || props.modelValue?.title || '');
const results = ref<LookupItem[]>([]);
const busy = ref(false);
const searched = ref(false);
const searchedQuery = ref('');
const failure = ref('');
const open = ref(false);
const failed = ref(false);
watch(() => props.modelValue, () => { failed.value = false; });

async function run(): Promise<void> {
  busy.value = true;
  failure.value = '';
  try {
    results.value = await props.search(query.value);
    searchedQuery.value = query.value;
    searched.value = true;
  } catch (cause) {
    failure.value = humanizeError(cause);
  } finally {
    busy.value = false;
  }
}
function pick(item: LookupItem): void {
  if (item.disabled) return;
  emit('update:modelValue', item);
  open.value = false;
}
</script>

<style scoped lang="scss">
.ui-lookup { display: grid; gap: var(--space-3); min-width: 0; }
.ui-lookup__selected { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: var(--space-4); align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
.ui-lookup__selected.is-empty { grid-template-columns: 56px minmax(0, 1fr); }
.ui-lookup__selected.is-empty strong { color: var(--muted); font-weight: 600; }
.ui-lookup__image { display: grid; place-items: center; width: 56px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); background: linear-gradient(150deg, var(--surface-3), var(--surface-2)); color: color-mix(in srgb, var(--muted) 60%, transparent); }
.ui-lookup__image.is-small { width: 34px; border-radius: var(--radius-xs, 6px); }
.ui-lookup__image img { width: 100%; height: 100%; object-fit: cover; }
.ui-lookup__image svg { width: 20px; height: 20px; }
.ui-lookup__text { display: grid; gap: 3px; min-width: 0; }
.ui-lookup__text strong { overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.ui-lookup__text small { color: var(--muted); font-size: var(--fs-xs); }
.ui-lookup__chip { display: inline-flex; align-items: center; gap: 5px; justify-self: start; padding: 2px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--green-solid) 18%, transparent); color: var(--green-text); font-size: var(--fs-xs); font-weight: 600; }
.ui-lookup__chip svg { width: 12px; height: 12px; }
.ui-lookup__change { padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; cursor: pointer; }
.ui-lookup__change:hover { text-decoration: underline; }
.ui-lookup__panel { display: grid; gap: var(--space-3); padding: 14px; border: 1px solid var(--border); border-radius: var(--panel-radius, var(--radius-md)); background: var(--surface-2); }
.ui-lookup__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.ui-lookup__none { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.ui-lookup__none.is-error { color: var(--red-text); }
.ui-lookup__list { display: grid; gap: 6px; max-height: 196px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.ui-lookup__result { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; width: 100%; padding: 8px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.ui-lookup__result:hover:not(:disabled) { background: rgb(var(--ink) / 4.5%); }
.ui-lookup__result:disabled { cursor: not-allowed; opacity: .5; }
.ui-lookup__result.is-selected { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.ui-lookup__check { width: 16px; height: 16px; color: var(--accent); }
</style>
