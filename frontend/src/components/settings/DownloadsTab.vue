<template>
  <!-- Les règles à gauche, ce qu'elles font à droite : la phrase « En clair » et le test d'une
       release restent à l'écran pendant qu'on règle. Sur téléphone, ils passent en tête. -->
  <div class="release-rules">
    <div class="release-rules__main">
      <SettingsSection title="Recherche" subtitle="Ce que la recherche automatique retient ou écarte.">
        <div class="release-scope">
          <UiCheckboxField v-model="sharedRules" label="Mêmes règles pour les films et les séries" />
          <UiSegmentedControl
            v-if="!sharedRules"
            v-model="kind"
            ariaLabel="Type de média"
            :options="[{ value: 'movie', label: 'Films' }, { value: 'show', label: 'Séries' }]"
          />
        </div>
        <SettingsRow label="Mots requis" description="Au moins un dans le nom de la release." label-for="release-required" block>
          <KeywordChips v-model="requiredRule" input-id="release-required" label="Ajouter un mot requis" placeholder="multi, vff, french" tone="good" />
        </SettingsRow>
        <SettingsRow label="Mots interdits" description="Un seul suffit à écarter la release." label-for="release-forbidden" block>
          <KeywordChips v-model="forbiddenRule" input-id="release-forbidden" label="Ajouter un mot interdit" placeholder="cam, ts, vostfr" tone="bad" />
        </SettingsRow>
        <SettingsRow :label="kind === 'show' && !sharedRules ? 'Taille par épisode' : 'Taille'" description="En Go, de la plus petite à la plus grande acceptée.">
          <div class="release-range">
            <UiNumberField v-model="minRule" :min="0" :step="0.1" placeholder="0" aria-label="Taille minimale en Go" />
            <span>à</span>
            <UiNumberField v-model="maxRule" :min="0" :step="0.1" placeholder="∞" aria-label="Taille maximale en Go" />
            <span>Go</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Seed et nettoyage" subtitle="Le torrent est retiré du client au premier seuil atteint.">
        <SettingsRow label="Retirer du client" description="Ratio de partage, ou durée en heures.">
          <div class="release-range">
            <span>ratio</span>
            <UiNumberField v-model="form.torrent_ratio_limit" :step="0.1" aria-label="Ratio limite" />
            <span>ou</span>
            <UiNumberField v-model="form.torrent_seed_time_limit_hours" aria-label="Durée de seed en heures" />
            <span>h</span>
          </div>
        </SettingsRow>
        <SettingsRow label="Supprimer aussi les fichiers" description="Seulement une fois le média confirmé dans Plex.">
          <ToggleSwitch v-model="form.torrent_auto_delete_files" title="Supprimer les fichiers après seed" />
        </SettingsRow>
        <SettingsRow
          label="Rapprocher les imports bloqués"
          description="Quand Sonarr ou Radarr termine un téléchargement sans le rattacher à son média, Watchdeck tente l'import s'il n'y a qu'un fichier et une cible possibles. Réglable aussi média par média."
        >
          <ToggleSwitch v-model="form.auto_import_reconciliation" title="Rapprocher les imports bloqués" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Disponibilité" subtitle="Quand une demande passe « disponible ».">
        <SettingsRow label="Confirmation" description="Import Sonarr/Radarr (rapide), présence Plex (fiable, parfois en retard), ou hybride.">
          <UiSelect v-model="form.availability_confirmation_mode" aria-label="Confirmation de disponibilité" :options="[{ value: 'arr', label: 'Import Sonarr/Radarr' }, { value: 'plex', label: 'Présence Plex obligatoire' }, { value: 'hybrid', label: 'Hybride : Plex puis repli *arr' }]" />
        </SettingsRow>
        <SettingsRow v-if="form.availability_confirmation_mode === 'hybrid'" label="Se fier à Sonarr/Radarr après" description="En minutes, si Plex ne voit toujours pas le média.">
          <UiNumberField v-model="form.availability_confirmation_timeout_minutes" :min="1" aria-label="Délai du repli *arr en minutes" />
        </SettingsRow>
      </SettingsSection>
    </div>

    <aside class="release-rules__aside" aria-label="Ce que font ces règles">
      <p class="release-sentence" aria-live="polite"><strong>En clair</strong> {{ sentence }}</p>

      <section class="release-tester" aria-labelledby="release-tester-title">
        <h3 id="release-tester-title">Tester sur une release</h3>
        <p>Avec les règles enregistrées{{ isDirty ? ' (enregistrez pour tester vos changements)' : '' }}.</p>
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
      </section>
    </aside>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, X } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { api } from '@/api';
import { form, isDirty } from '@/settingsForm';
import { humanizeError } from '@/utils/apiError';
import KeywordChips from './KeywordChips.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
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
@use '@/styles/foundations/breakpoints' as bp;

.release-rules { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 20rem); gap: var(--space-4); align-items: start; }
.release-rules__main { display: grid; gap: var(--space-4); min-width: 0; }
.release-rules__aside { position: sticky; top: var(--space-4); display: grid; gap: var(--space-3); min-width: 0; }
.release-scope { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-2); }
.release-range { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.release-range :deep(.ui-number-field) { width: 6.5rem; }
.release-sentence { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--panel-radius); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.6; }
.release-sentence strong { display: block; margin-bottom: 2px; }
.release-tester { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); }
.release-tester h3 { margin: 0; font-size: var(--fs-md); }
.release-tester > p { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.release-tester > input { width: 100%; font-family: var(--font-mono, monospace); font-size: var(--fs-xs); }
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

@include bp.until(wide) {
  .release-rules { grid-template-columns: minmax(0, 1fr); }
  .release-rules__aside { position: static; order: -1; }
}
</style>
