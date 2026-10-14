<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-sentence>
      <p class="release-sentence" aria-live="polite">{{ sentence }}</p>
    </template>

    <template #section-search>
      <div class="release-scope">
        <UiCheckboxField v-model="sharedRules" label="Mêmes règles pour les films et les séries" />
        <UiSegmentedControl
          v-if="!sharedRules"
          v-model="kind"
          ariaLabel="Type de média"
          :options="[{ value: 'movie', label: 'Films' }, { value: 'show', label: 'Séries' }]"
        />
      </div>
      <ConfigureField label="Mots requis" help="Au moins un dans le nom de la release." for-id="release-required" stacked>
        <KeywordChips v-model="requiredRule" input-id="release-required" label="Ajouter un mot requis" placeholder="multi, vff, french" tone="good" />
      </ConfigureField>
      <ConfigureField label="Mots interdits" help="Un seul suffit à écarter la release." for-id="release-forbidden" stacked>
        <KeywordChips v-model="forbiddenRule" input-id="release-forbidden" label="Ajouter un mot interdit" placeholder="cam, ts, vostfr" tone="bad" />
      </ConfigureField>
      <ConfigureField :label="kind === 'show' && !sharedRules ? 'Taille par épisode' : 'Taille'" help="En Go, de la plus petite à la plus grande acceptée.">
        <div class="release-range">
          <UiNumberField v-model="minRule" :min="0" :step="0.1" placeholder="0" aria-label="Taille minimale en Go" />
          <span>à</span>
          <UiNumberField v-model="maxRule" :min="0" :step="0.1" placeholder="∞" aria-label="Taille maximale en Go" />
          <span>Go</span>
        </div>
      </ConfigureField>
    </template>

    <template #section-tester>
      <p class="release-tester__hint">Avec les règles enregistrées{{ isDirty ? ' (enregistrez pour tester vos changements)' : '' }}.</p>
      <input v-model="sample" type="text" aria-label="Nom de la release" placeholder="Dune.Part.Two.2024.MULTi.VFF.1080p" spellcheck="false">
      <div class="release-range">
        <UiNumberField v-model="sampleSize" :min="0" :step="0.1" placeholder="taille" aria-label="Taille de la release en Go (facultatif)" />
        <span>Go</span>
        <UiSegmentedControl v-model="sampleKind" ariaLabel="Type de la release" :options="[{ value: 'movie', label: 'Film' }, { value: 'show', label: 'Épisode' }]" />
      </div>
      <UiButton :loading="checking" :disabled="!sample.trim()" @click="check">Tester</UiButton>
      <div v-if="verdict" class="release-verdict" :class="verdict.accepted ? 'is-ok' : 'is-ko'" aria-live="polite">
        <strong>{{ verdict.accepted ? 'Retenue' : 'Écartée' }}</strong>
        <ul>
          <li v-for="item in verdict.checks" :key="item.rule" :class="item.ok ? 'is-ok' : 'is-ko'">
            <Check v-if="item.ok" aria-hidden="true" /><X v-else aria-hidden="true" />
            <span><span class="sr-only">{{ item.ok ? 'Passe :' : 'Bloque :' }} </span>{{ item.message }}</span>
          </li>
        </ul>
      </div>
      <p v-if="checkError" class="release-error" role="alert">{{ checkError }}</p>
    </template>

    <template #section-cleanup>
      <ConfigureField label="Retirer du client" help="Ratio de partage, ou durée en heures.">
        <div class="release-range">
          <span>ratio</span>
          <UiNumberField v-model="form.torrent_ratio_limit" :step="0.1" aria-label="Ratio limite" />
          <span>ou</span>
          <UiNumberField v-model="form.torrent_seed_time_limit_hours" aria-label="Durée de seed en heures" />
          <span>h</span>
        </div>
      </ConfigureField>
      <ConfigureField label="Supprimer aussi les fichiers" help="Seulement une fois le média confirmé dans Plex.">
        <ToggleSwitch v-model="form.torrent_auto_delete_files" title="Supprimer les fichiers après seed" />
      </ConfigureField>
      <ConfigureField
        label="Rapprocher les imports bloqués"
        help="Quand Sonarr ou Radarr termine un téléchargement sans le rattacher à son média, Watchdeck tente l'import s'il n'y a qu'un fichier et une cible possibles. Réglable aussi média par média."
      >
        <ToggleSwitch v-model="form.auto_import_reconciliation" title="Rapprocher les imports bloqués" />
      </ConfigureField>
    </template>

    <template #section-availability>
      <ConfigureField label="Confirmation" help="Import Sonarr/Radarr (rapide), présence Plex (fiable, parfois en retard), ou hybride.">
        <UiSelect v-model="form.availability_confirmation_mode" aria-label="Confirmation de disponibilité" :options="[{ value: 'arr', label: 'Import Sonarr/Radarr' }, { value: 'plex', label: 'Présence Plex obligatoire' }, { value: 'hybrid', label: 'Hybride : Plex puis repli *arr' }]" />
      </ConfigureField>
      <ConfigureField v-if="form.availability_confirmation_mode === 'hybrid'" label="Se fier à Sonarr/Radarr après" help="En minutes, si Plex ne voit toujours pas le média.">
        <UiNumberField v-model="form.availability_confirmation_timeout_minutes" :min="1" aria-label="Délai du repli *arr en minutes" />
      </ConfigureField>
    </template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, CircleCheck, Eraser, FlaskConical, Search, X } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { api } from '@/api';
import { form, isDirty } from '@/settingsForm';
import { humanizeError } from '@/utils/apiError';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import KeywordChips from './KeywordChips.vue';
import { rulesSentence } from './releaseRules';

/* Les séries ont leurs propres règles seulement quand on décoche « mêmes règles » ; les
   films gardent toujours les règles générales. */
const sharedRules = computed({
  get: () => !form.torrent_split_by_type,
  set: (value: boolean) => { form.torrent_split_by_type = !value; },
});
const kind = ref<'movie' | 'show'>('movie');
const editingShow = computed(() => !sharedRules.value && kind.value === 'show');

function field<T>(movieKey: string, showKey: string) {
  return computed<T>({
    get: () => (editingShow.value ? form[showKey] : form[movieKey]) as T,
    set: (value: T) => { form[editingShow.value ? showKey : movieKey] = value; },
  });
}
const requiredRule = field<string>('torrent_required_keywords', 'torrent_show_required_keywords');
const forbiddenRule = field<string>('torrent_forbidden_keywords', 'torrent_show_forbidden_keywords');
const minRule = field<number | null>('torrent_min_size_gb', 'torrent_show_min_size_gb');
const maxRule = field<number | null>('torrent_max_size_gb', 'torrent_show_max_size_gb');

const sentence = computed(() => rulesSentence({
  required: requiredRule.value,
  forbidden: forbiddenRule.value,
  min: minRule.value,
  max: maxRule.value,
  ratio: form.torrent_ratio_limit,
  hours: form.torrent_seed_time_limit_hours,
  deleteFiles: Boolean(form.torrent_auto_delete_files),
  scope: sharedRules.value ? 'films et séries' : kind.value === 'show' ? 'séries (taille par épisode)' : 'films',
}));

const page = useSettingsPage();
const sections = computed(() => [
  { key: 'sentence', title: 'En clair', description: 'Ce que font les règles ci-dessous, avec les valeurs en cours.', icon: CircleCheck, keywords: ['résumé', 'règles'] },
  { key: 'search', title: 'Recherche', description: 'Ce que la recherche automatique retient ou écarte.', icon: Search, keywords: ['mots', 'requis', 'interdits', 'taille', 'release', 'film', 'série'] },
  { key: 'tester', title: 'Tester sur une release', description: 'Voir si une release serait retenue ou écartée par les règles.', icon: FlaskConical, keywords: ['test', 'verdict'] },
  { key: 'cleanup', title: 'Seed et nettoyage', description: 'Le torrent est retiré du client au premier seuil atteint.', icon: Eraser, keywords: ['ratio', 'seed', 'torrent', 'fichiers', 'imports'] },
  { key: 'availability', title: 'Disponibilité', description: 'Quand une demande passe « disponible ».', icon: CircleCheck, keywords: ['plex', 'sonarr', 'radarr', 'confirmation', 'hybride'] },
]);

interface Verdict { accepted: boolean; checks: Array<{ rule: string; ok: boolean; message: string }> }
const sample = ref('');
const sampleSize = ref<number | null>(null);
const sampleKind = ref<'movie' | 'show'>('movie');
const verdict = ref<Verdict | null>(null);
const checking = ref(false);
const checkError = ref('');

async function check(): Promise<void> {
  checking.value = true;
  checkError.value = '';
  try {
    verdict.value = await api<Verdict>('/api/acquisition/release-check', {
      method: 'POST',
      body: JSON.stringify({ title: sample.value.trim(), size_gb: sampleSize.value, media_type: sampleKind.value }),
    });
  } catch (error) {
    verdict.value = null;
    checkError.value = humanizeError(error);
  } finally {
    checking.value = false;
  }
}
</script>

<style scoped lang="scss">

.release-scope { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-2); }
.release-range { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.release-range :deep(.ui-number-field) { width: 6.5rem; }
.release-sentence { margin: 0; font-size: var(--fs-sm); line-height: 1.6; }
.release-tester__hint { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
input[aria-label='Nom de la release'] { width: 100%; font-family: var(--font-mono, monospace); font-size: var(--fs-xs); }
.release-verdict { padding: var(--space-2) var(--space-3); border-radius: var(--inset-radius); font-size: var(--fs-sm); }
.release-verdict.is-ok { background: color-mix(in srgb, var(--green) 10%, transparent); }
.release-verdict.is-ko { background: color-mix(in srgb, var(--red) 10%, transparent); }
.release-verdict > strong { color: var(--text); }
.release-verdict ul { display: grid; gap: 3px; margin: var(--space-1) 0 0; padding: 0; list-style: none; }
.release-verdict li { display: flex; gap: 6px; align-items: flex-start; }
.release-verdict li svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
.release-verdict li.is-ok { color: var(--green-text); }
.release-verdict li.is-ko { color: var(--red-text); }
.release-error { margin: 0; color: var(--red-text); font-size: var(--fs-sm); }

</style>
