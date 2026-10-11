<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template v-if="scan" #section-scan><VfScanSection /></template>

    <template #section-effective>
      <p class="effective-summary" :class="{ inactive: !form.vf_upgrade_enabled }">{{ effectiveSummary }}</p>
    </template>

    <template #section-rhythm>
      <VfPresetPicker :disabled="!form.vf_upgrade_enabled" />
    </template>

    <template #section-scope>
      <ConfigureField label="Activer les améliorations VF">
        <ToggleSwitch v-model="form.vf_upgrade_enabled" title="Activer les améliorations VF" />
      </ConfigureField>
      <ConfigureField label="Médias VO" help="Médias dont aucune piste française n'a été détectée.">
        <UiCheckbox v-model="form.vf_upgrade_include_vo" :disabled="!form.vf_upgrade_enabled" />
      </ConfigureField>
      <ConfigureField label="Saisons mixtes" help="Séries dont une partie seulement des épisodes est en VF.">
        <UiCheckbox v-model="form.vf_upgrade_include_mixed" :disabled="!form.vf_upgrade_enabled" />
      </ConfigureField>
      <ConfigureField label="Médias déjà en VF">
        <UiCheckbox v-model="form.vf_upgrade_include_vf" :disabled="!form.vf_upgrade_enabled || form.vf_upgrade_protect_existing_vf" />
      </ConfigureField>
      <ConfigureField
        label="Stratégie des saisons mixtes"
        :help="mixedModeHelp"
       
      >
        <UiSelect v-model="form.vf_upgrade_mixed_mode" :disabled="!form.vf_upgrade_enabled || !form.vf_upgrade_include_mixed || form.vf_upgrade_protect_existing_vf" :options="[{ value: 'episodes', label: 'Épisodes VO uniquement' }, { value: 'season', label: 'Pack saison complet' }]" />
      </ConfigureField>
      <ConfigureField label="Protéger les fichiers déjà en VF" help="Aucun fichier français existant ne sera remplacé automatiquement.">
        <ToggleSwitch v-model="form.vf_upgrade_protect_existing_vf" title="Protéger les fichiers déjà en VF" />
      </ConfigureField>
    </template>

    <template #section-arr>
      <div><button type="button" class="diag-btn" :disabled="diagLoading" @click="loadDiagnostic">
        {{ diagLoading ? 'Analyse…' : (diagnostic ? 'Réanalyser' : 'Analyser mes instances') }}
      </button></div>

      <p v-if="diagError" class="diag-error">{{ diagError }}</p>
      <p v-else-if="!diagnostic" class="diag-hint">
        Watchdeck interroge les indexeurs en direct, ce qui est lent et plafonné. Si ton *arr est
        déjà configuré pour la VF, cette recherche n'est qu'un filet de sécurité.
      </p>

      <ul v-else-if="diagnostic.instances.length" class="diag-list">
        <li v-for="inst in diagnostic.instances" :key="inst.id" class="diag-instance">
          <div class="diag-head">
            <strong>{{ inst.name }}</strong>
            <span class="diag-verdict" :class="`verdict-${inst.verdict}`">{{ verdictLabel(inst.verdict) }}</span>
          </div>
          <p class="diag-explain">{{ verdictExplain(inst) }}</p>
          <ul v-if="inst.french_formats?.length" class="diag-formats">
            <li v-for="cf in inst.french_formats" :key="cf.id">
              {{ cf.name }} <span class="diag-detected">— détecté par {{ cf.detected_by }}</span>
            </li>
          </ul>
          <ul v-if="inst.profiles?.length" class="diag-profiles">
            <li v-for="profile in inst.profiles" :key="profile.id">
              <span class="diag-verdict-dot" :class="`verdict-${profile.verdict}`" aria-hidden="true" />
              {{ profile.name }}
              <span class="diag-detail">{{ profileDetail(profile) }}</span>
            </li>
          </ul>
          <button
            v-if="inst.verdict === 'absent'"
            type="button"
            class="diag-btn"
            :disabled="installing === inst.id"
            @click="installCustomFormat(inst)"
          >
            {{ installing === inst.id ? 'Création…' : `Créer le custom format « VF » dans ${inst.name}` }}
          </button>
        </li>
      </ul>
      <p v-else class="diag-hint">Aucune instance Sonarr/Radarr activée.</p>
    </template>

    <template #section-languages>
      <ConfigureField label="Marqueurs acceptés" help="Séparés par des virgules.">
        <input v-model="form.vf_upgrade_markers" placeholder="truefrench,vff,multi,vfi,vfq">
      </ConfigureField>
      <ConfigureField label="Ordre de préférence">
        <input v-model="form.vf_upgrade_preference" placeholder="truefrench,vff,vfi,multi,vfq">
      </ConfigureField>
      <ConfigureField label="Confiance minimale" :help="confidenceHint">
        <UiSlider v-model="form.vf_upgrade_min_confidence" :min="0" :max="100" :step="5" label="Confiance minimale" />
      </ConfigureField>
      <ConfigureField label="Accepter un doublage québécois (VFQ)" help="Une VFQ est un vrai doublage français, mais différent de la VF de France.">
        <ToggleSwitch v-model="form.vf_upgrade_accept_vfq" title="Accepter un doublage québécois (VFQ)" />
      </ConfigureField>
      <ConfigureField label="Accepter une piste française secondaire">
        <ToggleSwitch v-model="form.vf_upgrade_accept_secondary" title="Accepter une piste française secondaire" />
      </ConfigureField>
      <ConfigureField label="Exiger que la piste française soit par défaut après import">
        <ToggleSwitch v-model="form.vf_upgrade_require_default" title="Exiger que la piste française soit par défaut après import" />
      </ConfigureField>
    </template>

    <template #section-quality>
      <ConfigureField label="Bloquer les rejets *arr">
        <ToggleSwitch v-model="form.vf_upgrade_block_arr_rejected" title="Bloquer les rejets *arr" />
      </ConfigureField>
      <ConfigureField label="Conserver la résolution">
        <ToggleSwitch v-model="form.vf_upgrade_protect_resolution" title="Conserver la résolution" />
      </ConfigureField>
      <ConfigureField label="Conserver HDR / Dolby Vision">
        <ToggleSwitch v-model="form.vf_upgrade_preserve_hdr" title="Conserver HDR / Dolby Vision" />
      </ConfigureField>
      <ConfigureField label="Ne pas baisser le score CF">
        <ToggleSwitch v-model="form.vf_upgrade_protect_custom_format_score" title="Ne pas baisser le score CF" />
      </ConfigureField>
      <ConfigureField label="Taille minimale" help="En Go. Vide = aucune limite.">
        <UiNumberField v-model="form.vf_upgrade_min_size_gb" :min="0" :step="0.1" placeholder="Aucune" />
      </ConfigureField>
      <ConfigureField label="Taille maximale" help="En Go. Vide = aucune limite.">
        <UiNumberField v-model="form.vf_upgrade_max_size_gb" :min="0" :step="0.1" placeholder="Aucune" />
      </ConfigureField>
      <ConfigureField label="Autoriser une régression technique" help="Uniquement après confirmation manuelle.">
        <ToggleSwitch v-model="form.vf_upgrade_allow_technical_downgrade" title="Autoriser une régression technique" />
      </ConfigureField>
    </template>

    <template #section-search>
      <ConfigureField label="Cooldown" help="En heures, entre deux recherches sur un même média.">
        <UiNumberField v-model="form.vf_upgrade_cooldown_hours" :min="1" :max="720" />
      </ConfigureField>
      <ConfigureField label="Relance après échec" help="En heures.">
        <UiNumberField v-model="form.vf_upgrade_retry_hours" :min="1" :max="168" />
      </ConfigureField>
      <ConfigureField label="Recherches par passage">
        <UiNumberField v-model="form.vf_upgrade_max_searches_per_run" :min="1" :max="500" />
      </ConfigureField>
      <ConfigureField label="Concurrence" help="Recherches menées en parallèle.">
        <UiNumberField v-model="form.vf_upgrade_search_concurrency" :min="1" :max="25" />
      </ConfigureField>
      <ConfigureField label="Cadence de lancement" help="Délai (ms) entre le lancement de deux recherches, indépendant de la concurrence. Permet d'empiler plus de recherches en vol sans rafale brutale vers les indexeurs. 0 = désactivé.">
        <UiNumberField v-model="form.vf_upgrade_search_stagger_ms" :min="0" :max="60000" :step="100" />
      </ConfigureField>
      <ConfigureField label="Priorité des cibles" help="Détermine quelles recherches entrent dans la limite de chaque passage.">
        <UiSelect v-model="form.vf_upgrade_priority" :options="[{ value: 'mixed,vo,vf', label: 'Saisons mixtes, puis VO, puis VF' }, { value: 'mixed,vf,vo', label: 'Saisons mixtes, puis VF, puis VO' }, { value: 'vo,mixed,vf', label: 'VO, puis saisons mixtes, puis VF' }, { value: 'vo,vf,mixed', label: 'VO, puis VF, puis saisons mixtes' }, { value: 'vf,mixed,vo', label: 'VF, puis saisons mixtes, puis VO' }, { value: 'vf,vo,mixed', label: 'VF, puis VO, puis saisons mixtes' }]" />
      </ConfigureField>
      <ConfigureField label="Prioriser les séries en cours de diffusion" help="Par défaut, l'efficacité prime (season pack d'une série terminée en tête, une seule recherche couvre toute la saison). Activé, les épisodes récents d'une série en cours passent devant.">
        <ToggleSwitch v-model="form.vf_upgrade_prioritize_continuing" title="Prioriser les séries en cours de diffusion" />
      </ConfigureField>
      <ConfigureField label="Fallback épisodique" help="Complète le pack saison par des recherches par épisode pour capter les MULTI sans pack indexé. Pour une série terminée, sert de filet de sécurité ; pour une série en cours, cible les épisodes récemment diffusés.">
        <ToggleSwitch v-model="form.vf_upgrade_episodic_fallback" title="Fallback épisodique" />
      </ConfigureField>
      <ConfigureField label="Épisodes max par saison" help="Plafonne les recherches par épisode générées en fallback, pour qu'une série ne monopolise pas le budget de recherches.">
        <UiNumberField v-model="form.vf_upgrade_episodic_fallback_limit" :disabled="!form.vf_upgrade_episodic_fallback" :min="0" :max="50" />
      </ConfigureField>
      <ConfigureField label="Fenêtre de récence" help="En jours. Pour une série en cours de diffusion, seuls les épisodes diffusés dans cette fenêtre entrent dans le fallback.">
        <UiNumberField v-model="form.vf_upgrade_episodic_fallback_days" :disabled="!form.vf_upgrade_episodic_fallback" :min="1" :max="365" />
      </ConfigureField>
      <ConfigureField label="Cooldown après échec" help="En heures. Double à chaque recherche restée bredouille sur une même cible, pour ne pas la retenter en boucle.">
        <UiNumberField v-model="form.vf_upgrade_no_result_backoff_base_hours" :min="1" :max="168" />
      </ConfigureField>
      <ConfigureField label="Cooldown maximal après échecs répétés" help="En heures. Plafond du cooldown progressif ci-dessus.">
        <UiNumberField v-model="form.vf_upgrade_no_result_backoff_max_hours" :min="1" :max="720" />
      </ConfigureField>
    </template>

    <template #section-validation>
      <ConfigureField label="Vérifier les pistes après import">
        <ToggleSwitch v-model="form.vf_upgrade_verify_after_import" title="Vérifier les pistes après import" />
      </ConfigureField>
      <ConfigureField label="Délai de validation" help="En minutes.">
        <UiNumberField v-model="form.vf_upgrade_verification_timeout_minutes" :disabled="!form.vf_upgrade_verify_after_import" :min="15" :max="1440" />
      </ConfigureField>
      <ConfigureField label="Tentatives automatiques maximales" help="Une recherche manuelle reste toujours possible.">
        <UiNumberField v-model="form.vf_upgrade_max_retries" :disabled="!form.vf_upgrade_verify_after_import" :min="0" :max="10" />
      </ConfigureField>
      <ConfigureField label="Demander une nouvelle analyse Plex" help="À la fin du téléchargement.">
        <UiCheckbox v-model="form.vf_upgrade_trigger_plex_scan" :disabled="!form.vf_upgrade_verify_after_import" />
      </ConfigureField>
      <ConfigureField label="Mettre en liste noire une release non validée">
        <ToggleSwitch v-model="form.vf_upgrade_blacklist_failed" title="Mettre en liste noire une release non validée" />
      </ConfigureField>
      <ConfigureField label="Conservation de l'historique" help="En jours.">
        <UiNumberField v-model="form.vf_upgrade_history_retention_days" :min="1" :max="3650" />
      </ConfigureField>
    </template>

    <template #section-notifications>
      <ConfigureField label="Release trouvée">
        <ToggleSwitch v-model="form.vf_upgrade_notify_found" title="Release trouvée" />
      </ConfigureField>
      <ConfigureField label="Acceptée par *arr">
        <ToggleSwitch v-model="form.vf_upgrade_notify_accepted" title="Acceptée par *arr" />
      </ConfigureField>
      <ConfigureField label="Téléchargement démarré">
        <ToggleSwitch v-model="form.vf_upgrade_notify_downloading" title="Téléchargement démarré" />
      </ConfigureField>
      <ConfigureField label="Échec">
        <ToggleSwitch v-model="form.vf_upgrade_notify_failed" title="Échec" />
      </ConfigureField>
      <ConfigureField label="VF validée">
        <ToggleSwitch v-model="form.vf_upgrade_notify_verified" title="VF validée" />
      </ConfigureField>
    </template>
  </ConfigureTemplate>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiSlider from '@/components/ui/UiSlider.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { form } from '@/settingsForm';
import VfPresetPicker from './VfPresetPicker.vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import VfScanSection from './VfScanSection.vue';
import { Bell, FileSearch, Gauge, Languages, ScanSearch, ShieldCheck, Sparkles, SlidersHorizontal, Timer, CheckCheck, Waypoints } from '@lucide/vue';

/* `scan` : l'analyse VF de la bibliotheque, posee ici dans les reglages (elle decide de ce qui doit
   etre ameliore). La fenetre de la page VF n'en a pas besoin. */
const props = defineProps<{ scan?: boolean }>();
const page = useSettingsPage();
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';

const selectedScopes = computed(() => [
  form.vf_upgrade_include_mixed && 'saisons mixtes',
  form.vf_upgrade_include_vo && 'médias VO',
  form.vf_upgrade_include_vf && !form.vf_upgrade_protect_existing_vf && 'médias VF',
].filter(Boolean));
/* Résumé d'une ligne de chaque bloc replié : on sait ce qu'il fait sans l'ouvrir. */
const summaries = computed(() => {
  const size = [form.vf_upgrade_min_size_gb, form.vf_upgrade_max_size_gb];
  const quality = [
    form.vf_upgrade_protect_resolution ? 'résolution conservée' : '',
    form.vf_upgrade_preserve_hdr ? 'HDR conservé' : '',
    form.vf_upgrade_protect_custom_format_score ? 'score CF protégé' : '',
    size[0] || size[1] ? `${size[0] || 0}–${size[1] || '∞'} Go` : '',
    form.vf_upgrade_allow_technical_downgrade ? 'régression permise après confirmation' : '',
  ].filter(Boolean);
  const notified = [
    form.vf_upgrade_notify_found && 'release trouvée',
    form.vf_upgrade_notify_accepted && 'acceptée',
    form.vf_upgrade_notify_downloading && 'téléchargement',
    form.vf_upgrade_notify_failed && 'échec',
    form.vf_upgrade_notify_verified && 'VF validée',
  ].filter(Boolean);
  return {
    quality: quality.join(' · ') || 'Aucune protection technique',
    search: `${form.vf_upgrade_max_searches_per_run ?? '–'} recherches par passage · ${form.vf_upgrade_search_concurrency ?? '–'} en parallèle · pause ${form.vf_upgrade_cooldown_hours ?? '–'} h${form.vf_upgrade_episodic_fallback ? ' · épisodes en secours' : ''}`,
    validation: form.vf_upgrade_verify_after_import
      ? `Vérifiée ${form.vf_upgrade_verification_timeout_minutes ?? '–'} min après import${form.vf_upgrade_blacklist_failed ? ' · liste noire si non validée' : ''}`
      : 'Pas de vérification après import',
    notifications: notified.length ? `Prévenir : ${notified.join(', ')}` : 'Aucune notification',
  };
});
const sections = computed(() => [
  ...(props.scan ? [{ key: 'scan', title: 'Analyse VF', description: 'Détecte automatiquement la présence d\'une piste VF dans les fichiers Plex, et synchronise la bibliothèque musique sans analyse VF.', icon: ScanSearch, keywords: ['plex', 'bibliothèques', 'scan', 'vo', 'vf', 'synchronisation'] }] : []),
  { key: 'effective', title: 'Comportement effectif', description: form.vf_upgrade_enabled ? 'Actif' : 'Désactivé', icon: Sparkles, keywords: ['résumé'] },
  { key: 'rhythm', title: 'Rythme', description: 'Un réglage de départ pour la cadence des recherches.', icon: Gauge, keywords: ['préréglage', 'cadence'] },
  { key: 'scope', title: 'Activation et périmètre', description: 'Choisit quels médias peuvent recevoir une meilleure release française.', icon: SlidersHorizontal, keywords: ['activer', 'vo', 'mixtes', 'protéger'] },
  { key: 'arr', title: 'Ce que sait déjà faire ton Sonarr / Radarr', description: 'Sonarr et Radarr peuvent récupérer une VF seuls, via un custom format « French » noté dans le profil : leur RSS sync s\'en charge en continu, sans aucun appel indexeur.', icon: Waypoints, keywords: ['custom format', 'sonarr', 'radarr', 'diagnostic'] },
  { key: 'languages', title: 'Langues et confiance', description: 'Filtre et ordonne les releases candidates.', icon: Languages, keywords: ['marqueurs', 'vfq', 'confiance', 'truefrench'] },
  { key: 'quality', title: 'Qualité et sécurité', description: summaries.value.quality, icon: ShieldCheck, keywords: ['hdr', 'résolution', 'taille', 'score'] },
  { key: 'search', title: 'Recherche et rythme', description: summaries.value.search, icon: FileSearch, keywords: ['cooldown', 'concurrence', 'fallback', 'priorité'] },
  { key: 'validation', title: 'Validation et historique', description: summaries.value.validation, icon: CheckCheck, keywords: ['vérifier', 'tentatives', 'liste noire'] },
  { key: 'notifications', title: 'Notifications', description: summaries.value.notifications, icon: Bell, keywords: ['release trouvée', 'échec'] },
]);
const effectiveSummary = computed(() => {
  if (!form.vf_upgrade_enabled) return 'Aucune recherche automatique ne sera lancée.';
  const scopes = selectedScopes.value.length ? selectedScopes.value.join(', ') : 'aucun média';
  const protection = form.vf_upgrade_protect_existing_vf
    ? 'Les fichiers VF existants ne seront jamais remplacés automatiquement.'
    : 'Les packs complets peuvent remplacer des fichiers VF existants.';
  return `Recherche sur ${scopes}, toutes les ${form.vf_upgrade_retry_hours || 6} h. ${protection}`;
});
/* Le curseur note la solidite de la preuve VF portee par le titre de la release
   (voir release_matching._VF_SCORES cote backend) : on explicite les paliers utiles
   plutot que d'afficher un pourcentage nu que rien ne rattache a un comportement. */
const confidenceHint = computed(() => {
  const value = form.vf_upgrade_min_confidence ?? 0;
  if (value > 95) return `${value} % — uniquement TRUEFRENCH / VFF`;
  if (value > 90) return `${value} % — TRUEFRENCH, VFF, VFI`;
  if (value > 85) return `${value} % — marqueurs explicites ou langue French déclarée par *arr`;
  if (value > 70) return `${value} % — exclut le « MULTI » seul, souvent trompeur`;
  if (value > 0) return `${value} % — accepte le « MULTI » seul`;
  return 'Aucun filtre : toute release portant un marqueur est proposée';
});
/* Diagnostic de la configuration langue des instances *arr : lecture seule, a la
   demande (un appel par instance vers /customformat + /qualityprofile), jamais au
   chargement de l'onglet. */
const queryClient = useQueryClient();
const diagnosticQuery = useQuery({
  queryKey: ['settings', 'vf-upgrades', 'arr-language-config'],
  queryFn: () => api('/api/vf-upgrades/arr-language-config'),
  enabled: false,
});
const diagnostic = computed(() => diagnosticQuery.data.value || null);
const diagLoading = computed(() => diagnosticQuery.isFetching.value);
const diagError = ref('');
const installMutation = useMutation({
  mutationFn: (id: number) => api<any>(`/api/vf-upgrades/arr-language-config/${id}/custom-format`, { method: 'POST' }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'vf-upgrades', 'arr-language-config'] }),
});
const installing = computed(() => installMutation.isPending.value ? Number(installMutation.variables.value) : null);

async function loadDiagnostic() {
  diagError.value = '';
  try {
    await diagnosticQuery.refetch();
  } catch (e: any) {
    diagError.value = e?.message || 'Analyse impossible.';
  }
}

async function installCustomFormat(inst: any) {
  diagError.value = '';
  try {
    const res = await installMutation.mutateAsync(inst.id);
    diagError.value = res.next_step || '';
  } catch (e: any) {
    diagError.value = e?.message || 'Création impossible.';
  }
}

function verdictLabel(verdict: string) {
  if (verdict === 'native') return 'Autonome';
  if (verdict === 'partial') return 'Partiel';
  if (verdict === 'unknown') return 'Illisible';
  return 'Non configuré';
}

function verdictExplain(inst: any) {
  if (inst.verdict === 'unknown') return `Configuration illisible : ${inst.error || 'instance injoignable'}.`;
  if (inst.verdict === 'native') {
    return 'Cette instance récupère les VF toute seule via son RSS sync. La recherche interactive de Watchdeck ne sert plus que de filet de sécurité.';
  }
  if (inst.verdict === 'partial') {
    return 'Un custom format français est noté, mais aucun profil ne peut remplacer un fichier existant pour ce gain de score : il manque « Upgrade Allowed » et un « Upgrade Until Custom Format Score » non nul.';
  }
  return 'Aucun custom format français noté : toutes les VF passent par la recherche interactive de Watchdeck, plafonnée et lente.';
}

function profileDetail(profile: any) {
  const scores = (profile.french_formats || []).map((cf: any) => `${cf.name} ${cf.score > 0 ? '+' : ''}${cf.score}`);
  const parts = [scores.length ? scores.join(', ') : 'aucun format français'];
  parts.push(profile.upgrade_allowed ? 'upgrade autorisé' : 'upgrade désactivé');
  parts.push(`seuil de score ${profile.cutoff_format_score}`);
  return `— ${parts.join(' · ')}`;
}

const mixedModeHelp = computed(() => form.vf_upgrade_protect_existing_vf
  ? 'La protection VF impose la recherche des seuls épisodes VO. Désactive-la pour autoriser un pack complet automatique.'
  : 'Une recherche manuelle au niveau saison cherche toujours un pack complet.');
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.diag-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font-size: var(--fs-sm);

  &:disabled { opacity: 0.6; cursor: default; }
}

.diag-hint,
.diag-error,
.diag-explain {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.diag-error { color: var(--amber-text); }

.diag-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }

.diag-instance {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.diag-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }

.diag-verdict {
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.verdict-native { background: color-mix(in srgb, var(--green) 15%, transparent); color: var(--green-text); }
.verdict-partial { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.verdict-absent,
.verdict-unknown { background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--red-text); }

.diag-verdict-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.diag-formats,
.diag-profiles {
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: 0;
  font-size: var(--fs-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-detected,
.diag-detail { color: var(--text-muted); }

.effective-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

input:disabled,
select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

</style>
