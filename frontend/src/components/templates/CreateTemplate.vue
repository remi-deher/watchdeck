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
  <ModalShell :open="open" :title="mode === 'edit' ? (definition.editTitle || `Modifier ${definition.noun}`) : `Ajouter ${definition.noun}`" :error="error" :busy="busy" panel-class="create-modal" @close="requestClose">
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

      <template v-for="field in visibleFields(current)" :key="field.key">
        <UiRadioCards v-if="field.type === 'cards'" v-model="values[field.key]" :label="field.label" :options="optionsOf(field)" />
        <ToggleSwitch v-else-if="field.type === 'toggle'" v-model="values[field.key]" :label="field.label" />
        <SecretField v-else-if="field.type === 'secret'" v-model="values[field.key]" :label="field.label" :hint="field.help" />
        <UiField v-else v-slot="{ id }" :label="field.label" :hint="field.help" :error="errors[field.key]" :required="field.required">
          <UiSelect v-if="field.type === 'select'" :id="id" v-model="values[field.key]" :options="optionsOf(field)" :aria-label="field.label" />
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
        <UiButton v-for="link in result.links || []" :key="link.label" :to="link.to" @click="close">{{ link.label }}</UiButton>
        <UiButton v-if="mode === 'create'" variant="primary" @click="restart">Ajouter {{ definition.another }}</UiButton>
        <UiButton v-else variant="primary" @click="close">Fermer</UiButton>
      </template>
      <template v-else>
        <UiButton :disabled="stepIndex === 0 || busy" @click="goTo(stepIndex - 1)">Retour</UiButton>
        <UiButton variant="primary" :loading="busy" @click="next">{{ isLast ? (mode === 'edit' ? 'Enregistrer' : 'Créer') : 'Continuer' }}</UiButton>
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
import UiField from '@/components/ui/UiField.vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { useConfirm } from '@/composables/useConfirm';
import { humanizeError } from '@/utils/apiError';
import type { CreateDefinition, CreateField, CreateResult, CreateStep, CreateTestResult, CreateValues } from './create/types';

export type { CreateDefinition, CreateField, CreateResult, CreateStep, CreateTestResult, CreateValues } from './create/types';

/* `edit` : la meme fenetre et la meme definition pour modifier une ressource existante,
   ouverte sur ses valeurs actuelles (`values`). */
const props = withDefaults(defineProps<{ open: boolean; definition: CreateDefinition; mode?: 'create' | 'edit'; values?: CreateValues | null }>(), { mode: 'create', values: null });
const emit = defineEmits<{ close: []; created: [result: CreateResult, values: CreateValues] }>();

const INPUT_TYPES: Record<string, string> = { text: 'text', url: 'url', email: 'email', number: 'number' };

const values = reactive<CreateValues>({});
const errors = reactive<Record<string, string>>({});
const stepIndex = ref(0);
const furthest = ref(0);
const busy = ref(false);
const error = ref('');
const result = ref<CreateResult | null>(null);
const testing = ref(false);
const testResult = ref<CreateTestResult | null>(null);

function restart(): void {
  for (const key of Object.keys(values)) delete values[key];
  Object.assign(values, props.definition.initial(), props.values || {});
  for (const key of Object.keys(errors)) delete errors[key];
  stepIndex.value = 0;
  furthest.value = 0;
  error.value = '';
  result.value = null;
  testResult.value = null;
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
const isLast = computed(() => stepIndex.value === allSteps.value.length - 1);

function titleOf(entry: CreateStep): string {
  return typeof entry.title === 'function' ? entry.title(values) : entry.title;
}
const visibleFields = (entry: CreateStep) => entry.fields.filter((field) => !field.when || field.when(values));
const optionsOf = (field: CreateField) => (typeof field.options === 'function' ? field.options(values) : field.options || []);

/* Une erreur disparait des que son champ change. */
watch(() => ({ ...values }), (now, before) => {
  for (const key of Object.keys(now)) if (now[key] !== before?.[key]) delete errors[key];
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

function goTo(index: number): void {
  if (index < 0 || index > furthest.value) return;
  for (const key of Object.keys(errors)) delete errors[key];
  stepIndex.value = index;
}

async function next(): Promise<void> {
  if (current.value && !validateStep(current.value)) return;
  if (!isLast.value) {
    stepIndex.value += 1;
    furthest.value = Math.max(furthest.value, stepIndex.value);
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    result.value = await props.definition.submit({ ...values });
    furthest.value = allSteps.value.length;
    emit('created', result.value, { ...values });
  } catch (cause) {
    error.value = humanizeError(cause);
  } finally {
    busy.value = false;
  }
}

/* Recapitulatif : chaque champ rempli, avec l'etape ou le modifier. */
const summaryRows = computed(() => steps.value.flatMap((entry, index) => visibleFields(entry)
  .filter((field) => field.summary !== 'hide')
  .map((field) => {
    const raw = values[field.key];
    let value = raw === true ? 'Oui' : raw === false ? 'Non' : String(raw ?? '—');
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
