<template>
  <div class="settings-rows">
    <SettingsSection title="Approbation" subtitle="Ce qui attend un administrateur avant de partir vers Sonarr ou Radarr.">
      <SettingsRow label="Approbation requise" description="Chaque nouvelle demande reste en attente de validation. Un compte « auto-approuvé » y échappe.">
        <ToggleSwitch v-model="form.require_approval" title="Approbation requise" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Quotas"
      subtitle="Au-delà, une demande de la watchlist attend un administrateur ; dans Découvrir, elle est refusée avec la date de la prochaine place libre. Les administrateurs et modérateurs ne sont jamais limités."
    >
      <div class="quota-cards">
        <label class="quota-card">
          <span>Films</span>
          <span class="quota-card__value"><UiNumberField v-model="form.quota_movie_limit" :min="0" :max="1000" placeholder="∞" aria-label="Quota de films par utilisateur" /> par utilisateur</span>
          <small>0 ou vide : illimité</small>
        </label>
        <label class="quota-card">
          <span>Séries</span>
          <span class="quota-card__value"><UiNumberField v-model="form.quota_show_limit" :min="0" :max="1000" placeholder="∞" aria-label="Quota de séries par utilisateur" /> par utilisateur</span>
          <small>0 ou vide : illimité</small>
        </label>
        <label class="quota-card">
          <span>Sur</span>
          <span class="quota-card__value"><UiNumberField v-model="form.quota_period_days" :min="1" :max="365" aria-label="Période des quotas en jours" /> jours glissants</span>
          <small>La fenêtre avance chaque jour</small>
        </label>
      </div>

      <!-- Qui approche de son quota : lu avec les mêmes règles que le contrôle appliqué. -->
      <h3 class="quota-subtitle">Les plus proches de leur quota</h3>
      <p v-if="!usage.length" class="quota-empty">{{ overviewQuery.isPending.value ? 'Chargement…' : 'Personne n’a encore demandé de média sur la période.' }}</p>
      <ul v-else class="quota-usage">
        <li v-for="entry in usage" :key="entry.user_id">
          <RouterLink :to="`/users/${entry.user_id}`" class="quota-usage__name">{{ entry.name }}</RouterLink>
          <span v-for="kind in KINDS" :key="kind.key" class="quota-usage__meter">
            <template v-if="meter(entry, kind.key)">
              <span class="quota-bar" :class="{ 'is-full': meter(entry, kind.key)!.full }" role="meter" :aria-valuenow="meter(entry, kind.key)!.used" :aria-valuemax="meter(entry, kind.key)!.limit" aria-valuemin="0" :aria-label="`${kind.label} demandés par ${entry.name}`">
                <i :style="{ width: `${meter(entry, kind.key)!.percent}%` }" />
              </span>
              <small>{{ meter(entry, kind.key)!.used }}/{{ meter(entry, kind.key)!.limit }} {{ kind.label }}</small>
            </template>
            <small v-else>{{ kind.label }} : illimité</small>
          </span>
        </li>
      </ul>
    </SettingsSection>

    <SettingsSection title="Exceptions par compte" subtitle="Elles se règlent dans la fiche de chaque utilisateur ; on les voit toutes ici.">
      <p v-if="!exceptions.length" class="quota-empty">Aucune : tous les comptes suivent les règles ci-dessus.</p>
      <ul v-else class="quota-exceptions">
        <li v-for="entry in exceptions" :key="entry.user_id">
          <span class="quota-exceptions__who"><strong>{{ entry.name }}</strong><small>{{ roleLabel(entry.role) }}</small></span>
          <span class="quota-exceptions__tags">
            <span v-if="customQuota(entry)" class="quota-tag is-warn">{{ customQuota(entry) }}</span>
            <span v-if="entry.auto_approve" class="quota-tag is-ok">Auto-approuvé</span>
          </span>
          <UiButton size="sm" :to="`/users/${entry.user_id}`">Ouvrir la fiche</UiButton>
        </li>
      </ul>
    </SettingsSection>

    <SettingsSection title="Watchlist" subtitle="Les watchlists Plex deviennent des demandes automatiquement.">
      <p v-if="watchlistState" class="quota-state" :class="watchlistState.failed ? 'is-error' : 'is-ok'" aria-live="polite">{{ watchlistState.text }}</p>
      <SettingsRow label="Relire toutes les" description="À quelle fréquence Watchdeck relit la watchlist.">
        <IntervalPresetInput v-model="form.poll_interval_seconds" :presets="presetsFor('poll_interval_seconds')!" />
      </SettingsRow>
      <SettingsRow label="Source" description="Universal Watchlist agrège les watchlists de vos amis Plex sans qu'ils se connectent à Watchdeck (Plex Pass).">
        <UiSelect v-model="form.watchlist_source_priority" aria-label="Source de la watchlist" :options="[{ value: 'api', label: 'API Plex' }, { value: 'rss', label: 'Universal Watchlist (RSS)' }]" />
      </SettingsRow>
      <SettingsRow label="Basculer sur l’autre source en cas d’échec">
        <ToggleSwitch v-model="form.watchlist_fallback_enabled" title="Source de repli" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Langue" subtitle="Langue de l'interface pour qui n'a pas choisi la sienne.">
      <SettingsRow label="Langue par défaut" description="Appliquée aux nouveaux comptes et aux pages publiques. Chaque utilisateur peut ensuite choisir la sienne.">
        <UiSelect v-model="locale" :options="LOCALE_OPTIONS" aria-label="Langue par défaut" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import UiButton from '@/components/ui/UiButton.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import { presetsFor } from '@/settingsPresets';
import { formatRelativeDate } from '@/utils/format';
import { roleLabel } from '@/utils/userLabels';
import IntervalPresetInput from './IntervalPresetInput.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

interface QuotaUse { used: number; limit: number | null }
interface UsageEntry { user_id: number; name: string; movie?: QuotaUse; show?: QuotaUse; [key: string]: any }
interface QuotaException { user_id: number; name: string; role: string; quota_movie_limit: number | null; quota_show_limit: number | null; auto_approve: boolean }

const KINDS = [
  { key: 'movie', label: 'films' },
  { key: 'show', label: 'séries' },
] as const;

const overviewQuery = useQuery({
  queryKey: ['settings', 'request-quotas'],
  queryFn: () => api<{ usage: UsageEntry[]; exceptions: QuotaException[] }>('/api/request-quotas/overview'),
  staleTime: 30_000,
});
const usage = computed(() => overviewQuery.data.value?.usage || []);
const exceptions = computed(() => overviewQuery.data.value?.exceptions || []);

/* La jauge d'un type : rien quand il n'est pas limité. */
function meter(entry: UsageEntry, kind: 'movie' | 'show') {
  const value = entry[kind];
  if (!value?.limit) return null;
  return { used: value.used, limit: value.limit, full: value.used >= value.limit, percent: Math.min(100, (value.used / value.limit) * 100) };
}

/* « 10 films, illimité en séries » : 0 lève la limite pour ce compte, vide suit la règle générale. */
function customQuota(entry: QuotaException): string {
  const part = (value: number | null, label: string) => (value === null ? '' : value === 0 ? `${label} illimités` : `${value} ${label}`);
  return [part(entry.quota_movie_limit, 'films'), part(entry.quota_show_limit, 'séries')].filter(Boolean).join(', ');
}

/* Dernière lecture de la watchlist, lue dans les tâches planifiées. */
const tasksQuery = useQuery({ queryKey: ['settings', 'scheduled-tasks'], queryFn: () => api<any[]>('/api/scheduled-tasks') });
const watchlistState = computed(() => {
  const state = (tasksQuery.data.value || []).find((task: any) => task.job === 'watchlist')?.state;
  if (!state?.finished_at) return null;
  const when = formatRelativeDate(state.finished_at).toLowerCase();
  const source = form.watchlist_source_priority === 'rss' ? 'Universal Watchlist' : 'API Plex';
  return state.status === 'failed'
    ? { failed: true, text: `Dernière lecture en échec ${when}${state.last_error ? ` : ${state.last_error}` : ''}` }
    : { failed: false, text: `Dernière lecture ${when} · source : ${source}` };
});

/* Les langues que le serveur sait servir (`SUPPORTED_LOCALES`, app/i18n.py). */
const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];
// Sans choix enregistre, le serveur retombe sur le francais : on l'affiche tel quel.
const locale = computed({
  get: () => form.default_locale || 'fr',
  set: (value: string) => { form.default_locale = value; },
});
</script>

<style scoped lang="scss">
.settings-rows { display: flex; flex-direction: column; gap: var(--space-4); }
.quota-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-3); }
.quota-card { display: grid; gap: var(--space-1); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--inset-radius); }
.quota-card > span:first-child { font-weight: 600; }
.quota-card__value { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--fs-sm); }
.quota-card__value :deep(.ui-number-field) { width: 5.5rem; }
.quota-card small { color: var(--muted); font-size: var(--fs-xs); }
.quota-subtitle { margin: var(--space-4) 0 var(--space-2); color: var(--muted); font-size: var(--fs-sm); }
.quota-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.quota-usage, .quota-exceptions { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: var(--inset-radius); }
.quota-usage li, .quota-exceptions li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border); }
.quota-usage li:first-child, .quota-exceptions li:first-child { border-top: 0; }
.quota-usage__name { flex: 1 1 9rem; min-width: 0; font-weight: 600; }
.quota-usage__meter { display: grid; grid-template-columns: 6rem auto; align-items: center; gap: var(--space-2); }
.quota-usage__meter small { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.quota-bar { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-2); }
.quota-bar i { display: block; height: 100%; background: var(--accent); }
.quota-bar.is-full i { background: var(--red); }
.quota-exceptions__who { display: grid; flex: 1 1 9rem; min-width: 0; }
.quota-exceptions__who small { color: var(--muted); font-size: var(--fs-xs); }
.quota-exceptions__tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.quota-tag { padding: 1px 9px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600; }
.quota-tag.is-warn { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); }
.quota-tag.is-ok { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.quota-state { margin: 0 0 var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--inset-radius); font-size: var(--fs-sm); }
.quota-state.is-ok { background: color-mix(in srgb, var(--green) 9%, transparent); color: var(--green-text); }
.quota-state.is-error { background: color-mix(in srgb, var(--red) 9%, transparent); color: var(--red-text); }
</style>
