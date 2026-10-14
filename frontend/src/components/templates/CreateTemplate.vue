<template>
  <!-- Gabarit « Creer » : repond a « comment je mets ca en place ? ». Toujours en fenetre
       (ModalShell), pilote par une definition (`definition`, voir create/types.ts) :
         1. les etapes : numerotees, l'etape en cours en avant, les etapes faites cochees et
            cliquables pour y revenir ; on ne saute pas en avant. Une seule etape : pas de
            barre ;
         2. une etape = un ecran, titre d'intention, champs rendus par les composants
            communs selon leur type ;
         3. « Continuer » valide l'etape (erreurs sous les champs) ; le test, quand la
            definition en a un, est exige, et tout champ qui le concerne le rend caduc ;
         4. le recapitulatif, chaque ligne modifiable, avant « Creer » ;
         5. le resultat et ses suites, ou « Creer un autre ».
       Pas de brouillon : fermer en cours de saisie demande confirmation. -->
  <ModalShell :open="open" :title="mode === 'edit' ? (definition.editTitle || `Modifier ${definition.noun}`) : `Ajouter ${definition.noun}`" :subtitle="definition.subtitle" :error="error" :busy="busy" panel-class="create-modal" @close="requestClose">
    <ol v-if="showStepper" class="create__steps" aria-label="Étapes">
      <li v-for="(entry, index) in allSteps" :key="entry.key" :class="{ 'is-current': index === stepIndex && !result, 'is-done': index < furthest || result }">
        <button type="button" :disabled="index >= furthest || Boolean(result)" :aria-current="index === stepIndex ? 'step' : undefined" @click="goTo(index)">
          <span class="create__dot"><Check v-if="index < furthest || result" aria-hidden="true" /><template v-else>{{ index + 1 }}</template></span>
          <span>{{ entry.label }}</span>
        </button>
      </li>
    </ol>

    <div v-if="result" class="create__result" role="status">
      <CheckCircle2 aria-hidden="true" />
      <div><strong>{{ result.message }}</strong><p v-if="result.detail">{{ result.detail }}</p></div>
    </div>

    <section v-else-if="isSummary" class="create__summary" aria-label="Récapitulatif">
      <h3>Tout est prêt ?</h3>
      <dl>
        <div v-for="row in summaryRows" :key="row.key">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
          <UiButton size="sm" variant="ghost" @click="goTo(row.stepIndex)">Modifier</UiButton>
        </div>
      </dl>
    </section>

    <section v-else-if="current" class="create__step">
      <h3>{{ titleOf(current) }}</h3>
      <p v-if="current.description" class="create__description">{{ current.description }}</p>

      <p v-if="entering" class="create__entering" role="status">{{ loadingOf(current) }}</p>
      <template v-for="field in (entering ? [] : visibleFields(current))" :key="field.key">
        <p v-if="field.type === 'note'" class="create__note" :class="`is-${field.tone || 'info'}`" role="note">{{ noteOf(field) }}</p>
        <UiField v-else-if="field.type === 'lookup'" v-slot="{ id }" :label="field.label" :hint="field.help" :error="errors[field.key]" :required="field.required">
          <UiLookupField v-model="values[field.key]" :id="id" :search="field.search!" :placeholder="field.placeholder" />
        </UiField>
        <fieldset v-else-if="field.type === 'checklist'" class="create__checklist">
          <legend>{{ field.label }}</legend>
          <p v-if="field.help" class="create__description">{{ field.help }}</p>
          <ul>
            <li v-for="option in optionsOf(field)" :key="option.value">
              <UiCheckboxField :model-value="checked(field, option.value)" :label="option.label" :hint="option.description" :disabled="option.disabled" @update:model-value="toggle(field, option.value, $event)" />
              <UiButton v-if="option.action" size="sm" variant="ghost" :disabled="option.disabled" @click="field.onAction?.(option.value, values)">{{ option.action }}</UiButton>
            </li>
          </ul>
          <p v-if="errors[field.key]" class="create__error">{{ errors[field.key] }}</p>
        </fieldset>
        <UiRadioCards v-else-if="field.type === 'cards'" v-model="values[field.key]" :label="field.label" :options="optionsOf(field)" />
        <ToggleSwitch v-else-if="field.type === 'toggle'" v-model="values[field.key]" :label="field.label" />
        <SecretField v-else-if="field.type === 'secret'" v-model="values[field.key]" :label="field.label" :hint="field.help" />
        <UiField v-else v-slot="{ id }" :label="field.label" :hint="field.help" :error="errors[field.key]" :required="field.required">
          <UiSelect v-if="field.type === 'select'" :id="id" v-model="values[field.key]" :options="optionsOf(field)" :aria-label="field.label" />
          <textarea v-else-if="field.type === 'textarea'" :id="id" v-model="values[field.key]" class="input" :rows="field.rows || 3" :placeholder="field.placeholder" :required="field.required" />
          <UiFileDrop v-else-if="field.type === 'file'" :id="id" v-model="values[field.key]" :accept="field.accept" :placeholder="field.placeholder" />
          <template v-else-if="field.type === 'suggest'">
            <input :id="id" v-model="values[field.key]" class="input" type="text" :list="`${id}-options`" autocomplete="off" :placeholder="field.placeholder" :required="field.required" />
            <datalist :id="`${id}-options`"><option v-for="item in suggestionsOf(field)" :key="item" :value="item" /></datalist>
          </template>
          <div v-else-if="field.browse" class="create__browse">
            <input :id="id" v-model="values[field.key]" class="input" :type="INPUT_TYPES[field.type]" :placeholder="field.placeholder" :required="field.required" />
            <UiButton :aria-label="`Parcourir pour ${field.label}`" @click="browseFor(field)">Parcourir…</UiButton>
          </div>
          <input v-else :id="id" v-model="values[field.key]" class="input" :type="INPUT_TYPES[field.type]" :placeholder="field.placeholder" :required="field.required" />
        </UiField>
        <p v-if="(field.type === 'secret' || field.type === 'cards' || field.type === 'toggle') && errors[field.key]" class="create__error">{{ errors[field.key] }}</p>
      </template>

      <div v-if="definition.test && definition.test.step === current.key" class="create__test">
        <UiButton size="sm" :loading="testing" @click="runTest"><template #icon><PlugZap /></template>Tester</UiButton>
        <p v-if="testResult" class="create__test-result" :class="testResult.ok ? 'is-ok' : 'is-error'" aria-live="polite">
          <component :is="testResult.ok ? CheckCircle2 : XCircle" aria-hidden="true" />{{ testResult.message }}
        </p>
        <p v-else-if="errors.__test" class="create__error">{{ errors.__test }}</p>
      </div>
    </section>

    <template #actions>
      <template v-if="result">
        <UiButton v-for="link in result.links || []" :key="link.label" :to="link.to" :href="link.href" @click="close">{{ link.label }}</UiButton>
        <UiButton v-if="mode === 'create'" variant="primary" @click="restart">Ajouter {{ definition.another }}</UiButton>
        <UiButton v-else variant="primary" @click="close">Fermer</UiButton>
      </template>
      <template v-else>
        <UiButton :disabled="stepIndex === 0 || busy" @click="goTo(stepIndex - 1)">Retour</UiButton>
        <UiButton v-for="extra in secondaryHere" :key="extra.key" :disabled="busy || entering" @click="submitWith(extra.key)">{{ extra.label }}</UiButton>
        <UiButton variant="primary" :loading="busy" @click="next()">{{ isLast ? (submitLabel || (mode === 'edit' ? 'Enregistrer' : 'Créer')) : 'Continuer' }}</UiButton>
      </template>
    </template>
  </ModalShell>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Check, CheckCircle2, PlugZap, XCircle } from '@lucide/vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import SecretField from '@/components/ui/SecretField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiField from '@/components/ui/UiField.vue';
import UiFileDrop from '@/components/ui/UiFileDrop.vue';
import UiLookupField from '@/components/ui/UiLookupField.vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { useConfirm } from '@/composables/useConfirm';
import { humanizeError } from '@/utils/apiError';
import type { CreateDefinition, CreateField, CreateResult, CreateStep, CreateTestResult, CreateValues } from './create/types';

export type { CreateDefinition, CreateField, CreateResult, CreateStep, CreateTestResult, CreateValues } from './create/types';

/* `edit` : la meme fenetre et la meme definition pour modifier une ressource existante,
   ouverte sur ses valeurs actuelles (`values`). */
/* `start` : la cle de l'etape sur laquelle la fenetre s'ouvre (reprendre une tache : directement a l'apercu). */
const props = withDefaults(defineProps<{ open: boolean; definition: CreateDefinition; mode?: 'create' | 'edit'; values?: CreateValues | null; start?: string }>(), { mode: 'create', values: null, start: '' });
const emit = defineEmits<{ close: []; created: [result: CreateResult, values: CreateValues] }>();

const INPUT_TYPES: Record<string, string> = { text: 'text', url: 'url', email: 'email', number: 'number' };

const values = reactive<CreateValues>({});
const errors = reactive<Record<string, string>>({});
const stepIndex = ref(0);
const furthest = ref(0);
const busy = ref(false);
const error = ref('');
const result = ref<CreateResult | null>(null);
const entering = ref(false);
const testing = ref(false);
const testResult = ref<CreateTestResult | null>(null);

function restart(): void {
  for (const key of Object.keys(values)) delete values[key];
  Object.assign(values, props.definition.initial(), props.values || {});
  for (const key of Object.keys(errors)) delete errors[key];
  const startIndex = Math.max(0, props.definition.steps.findIndex((entry) => entry.key === props.start));
  stepIndex.value = startIndex;
  furthest.value = startIndex;
  error.value = '';
  result.value = null;
  testResult.value = null;
  /* Apres la mise en place des etapes (le premier appel part avant leur definition). */
  queueMicrotask(() => { void enter(steps.value[startIndex]); });
}
watch(() => [props.open, props.definition], ([open]) => { if (open) restart(); }, { immediate: true });

/* Etapes presentes selon les reponses, plus le recapitulatif quand il y a plus d'une etape. */
const steps = computed(() => props.definition.steps.filter((entry) => !entry.when || entry.when(values)));
const hasSummary = computed(() => steps.value.length > 1);
const allSteps = computed(() => [
  ...steps.value.map((entry) => ({ key: entry.key, label: entry.label })),
  ...(hasSummary.value ? [{ key: '__summary', label: 'Récapitulatif' }] : []),
]);
const showStepper = computed(() => allSteps.value.length > 1);
const isSummary = computed(() => hasSummary.value && stepIndex.value === steps.value.length);
const current = computed<CreateStep | null>(() => steps.value[stepIndex.value] || null);
const submitLabel = computed(() => (typeof props.definition.submitLabel === 'function' ? props.definition.submitLabel(values) : props.definition.submitLabel));
const isLast = computed(() => stepIndex.value === allSteps.value.length - 1);
/* Les actions secondaires visibles ici : celles de l'etape en cours, ou de la derniere par defaut. */
const secondaryHere = computed(() => (props.definition.secondaryActions || []).filter((extra) => (extra.from ? extra.from === current.value?.key : isLast.value)));
const loadingOf = (entry: CreateStep | null): string => {
  const text = entry?.loading;
  return (typeof text === 'function' ? text(values) : text) || 'Chargement…';
};

function titleOf(entry: CreateStep): string {
  return typeof entry.title === 'function' ? entry.title(values) : entry.title;
}
const stepFields = (entry: CreateStep): CreateField[] => (typeof entry.fields === 'function' ? entry.fields(values) : entry.fields);
const visibleFields = (entry: CreateStep) => stepFields(entry).filter((field) => !field.when || field.when(values));
const noteOf = (field: CreateField) => (typeof field.text === 'function' ? field.text(values) : field.text || '');
const suggestionsOf = (field: CreateField) => (typeof field.suggestions === 'function' ? field.suggestions(values) : field.suggestions || []);
const optionsOf = (field: CreateField) => (typeof field.options === 'function' ? field.options(values) : field.options || []);

/* Une erreur disparait des que son champ change. */
watch(() => ({ ...values }), (now, before) => {
  for (const key of Object.keys(now)) {
    if (now[key] === before?.[key]) continue;
    delete errors[key];
    for (const step of props.definition.steps) stepFields(step).find((field) => field.key === key)?.onChange?.(now[key], values);
  }
});

/* Test caduc des qu'un champ qui le concerne change. */
watch(() => (props.definition.test?.fields || []).map((key) => values[key]), () => { testResult.value = null; });

function validateStep(entry: CreateStep): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  for (const field of visibleFields(entry)) {
    const value = values[field.key];
    const empty = value === undefined || value === null || String(value).trim() === '';
    if (field.required && empty) errors[field.key] = 'Ce champ est requis.';
    else if (field.type === 'url' && !empty && !/^https?:\/\/.+/i.test(String(value))) errors[field.key] = 'L’adresse doit commencer par http:// ou https://.';
    else if (field.type === 'email' && !empty && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) errors[field.key] = 'Adresse email invalide.';
    else {
      const message = field.validate?.(value, values);
      if (message) errors[field.key] = message;
    }
  }
  if (!Object.keys(errors).length && props.definition.test?.step === entry.key && !testResult.value?.ok) {
    errors.__test = 'Testez la connexion avant de continuer.';
  }
  return !Object.keys(errors).length;
}

async function runTest(): Promise<void> {
  if (!props.definition.test || !current.value) return;
  testing.value = true;
  delete errors.__test;
  try {
    testResult.value = await props.definition.test.run({ ...values });
  } catch (cause) {
    testResult.value = { ok: false, message: humanizeError(cause) };
  } finally {
    testing.value = false;
  }
}

/* En arrivant sur une etape : ce qu'elle doit lire avant de montrer ses champs. */
async function enter(entry: CreateStep | null | undefined): Promise<void> {
  if (!entry?.onEnter) return;
  entering.value = true;
  error.value = '';
  try {
    await entry.onEnter(values);
  } catch (cause) {
    error.value = humanizeError(cause);
  } finally {
    entering.value = false;
  }
}

function goTo(index: number): void {
  if (index < 0 || index > furthest.value) return;
  for (const key of Object.keys(errors)) delete errors[key];
  stepIndex.value = index;
  void enter(steps.value[index]);
}

const checked = (field: CreateField, value: string): boolean => Array.isArray(values[field.key]) && values[field.key].includes(value);
function toggle(field: CreateField, value: string, on: boolean): void {
  const list: string[] = Array.isArray(values[field.key]) ? values[field.key] : [];
  values[field.key] = on ? [...list.filter((entry) => entry !== value), value] : list.filter((entry) => entry !== value);
}

async function next(action?: string): Promise<void> {
  if (current.value && !validateStep(current.value)) return;
  const early = Boolean(action && props.definition.secondaryActions?.find((extra) => extra.key === action)?.from);
  if (!isLast.value && !early) {
    stepIndex.value += 1;
    furthest.value = Math.max(furthest.value, stepIndex.value);
    await enter(steps.value[stepIndex.value]);
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    result.value = await props.definition.submit({ ...values }, action);
    furthest.value = allSteps.value.length;
    emit('created', result.value, { ...values });
    if (props.definition.quick) close();
  } catch (cause) {
    error.value = humanizeError(cause);
  } finally {
    busy.value = false;
  }
}

const submitWith = (action: string) => next(action);
async function browseFor(field: CreateField): Promise<void> {
  const path = await field.browse?.(String(values[field.key] ?? ''), values);
  if (path) values[field.key] = path;
}

/* Recapitulatif : chaque champ rempli, avec l'etape ou le modifier. */
const summaryRows = computed(() => steps.value.flatMap((entry, index) => visibleFields(entry)
  .filter((field) => field.summary !== 'hide' && field.type !== 'note')
  .map((field) => {
    const raw = values[field.key];
    let value = raw === true ? 'Oui' : raw === false ? 'Non' : raw instanceof File ? raw.name : raw && typeof raw === 'object' && 'title' in raw ? String(raw.title) : String(raw ?? '—');
    const option = optionsOf(field).find((entry) => entry.value === raw);
    if (option) value = option.label;
    if (field.type === 'secret' || field.summary === 'mask') value = raw ? `••••${String(raw).slice(-4)}` : '—';
    return { key: field.key, label: field.label, value: value || '—', stepIndex: index };
  })));

/* Pas de brouillon : fermer pendant la saisie demande confirmation. */
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const touched = computed(() => JSON.stringify(values) !== JSON.stringify({ ...props.definition.initial(), ...(props.values || {}) }));
async function requestClose(): Promise<void> {
  if (!result.value && touched.value) {
    const ok = await askConfirm({ title: 'Abandonner la saisie ?', message: 'Ce qui a été saisi ne sera pas gardé.', confirmLabel: 'Abandonner', danger: true });
    if (!ok) return;
  }
  close();
}
function close(): void {
  emit('close');
}
</script>

<style scoped lang="scss">
.create__steps { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin: 0 0 var(--space-4); padding: 0; list-style: none; }
.create__steps button { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.create__steps button:disabled { cursor: default; }
.create__steps .is-current button { color: var(--text); font-weight: 700; }
.create__dot { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 50%; font-size: var(--fs-xs); }
.create__dot svg { width: 13px; height: 13px; }
.create__steps .is-current .create__dot { border-color: transparent; background: var(--accent); color: var(--on-accent); }
.create__steps .is-done .create__dot { border-color: transparent; background: color-mix(in srgb, var(--green) 18%, var(--surface)); color: var(--green-text, var(--green)); }
.create__step, .create__summary { display: grid; gap: var(--space-3); }
.create__step h3, .create__summary h3 { margin: 0; font-size: var(--fs-md); }
.create__description { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.create__entering { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.create__note { margin: 0; padding: var(--space-3); border: 1px solid transparent; border-radius: var(--radius-sm); font-size: var(--fs-sm); line-height: 1.5; overflow-wrap: anywhere; white-space: pre-line; }
.create__note.is-info { background: var(--surface-2); color: var(--muted); }
.create__note.is-warning { border-color: color-mix(in srgb, var(--accent) 32%, transparent); background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--text); }
.create__checklist { display: grid; gap: var(--space-2); min-width: 0; margin: 0; padding: 0; border: 0; }
.create__checklist legend { padding: 0; font-size: var(--fs-sm); font-weight: 700; }
.create__checklist ul { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.create__checklist li { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); padding: var(--space-1) 0; border-bottom: 1px solid var(--border); }
.create__browse { display: flex; gap: var(--space-2); align-items: center; }
.create__browse input { flex: 1; min-width: 0; }
.create__error { margin: 0; color: var(--red-text); font-size: var(--fs-xs); }
.create__test { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.create__test-result { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-sm); }
.create__test-result svg { width: 16px; height: 16px; }
.create__test-result.is-ok { color: var(--green-text, var(--green)); }
.create__test-result.is-error { color: var(--red-text); }
.create__summary dl { display: grid; margin: 0; }
.create__summary dl > div { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); font-size: var(--fs-sm); }
.create__summary dt { flex: 0 0 9rem; color: var(--muted); }
.create__summary dd { flex: 1; min-width: 0; margin: 0; overflow-wrap: anywhere; }
.create__result { display: flex; align-items: flex-start; gap: var(--space-3); color: var(--green-text, var(--green)); }
.create__result svg { flex: none; width: 24px; height: 24px; }
.create__result strong { color: var(--text); }
.create__result p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
