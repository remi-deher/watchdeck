<template>
  <section class="panel table-wrap table-cards rich">
    <table>
      <thead>
        <tr>
          <th><input v-if="tab==='pending'" type="checkbox" :checked="allSelected" aria-label="Selectionner toutes les notifications" @change="toggleAll"></th>
          <th>Date</th>
          <th>Evenement</th>
          <th>Media</th>
          <th>Destinataires</th>
          <th>Etat</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td class="card-select"><input v-if="tab==='pending'" type="checkbox" :checked="isSelected(row)" :aria-label="`Selectionner ${row.event_label||row.event}`" @change="toggle(row)"></td>
          <td data-label="Date">{{ formatDate(row.sent_at||row.created_at) }}</td>
          <td class="card-title">
            <strong>{{ row.event_label||row.event }}</strong>
            <small class="table-detail">{{ context(row) }}</small>
          </td>
          <td data-label="Media">{{ row.media_title||'-' }}</td>
          <td data-label="Destinataires">{{ row.recipient||(row.recipients||[]).join(', ')||'-' }}</td>
          <td data-label="Etat">
            <UiBadge :tone="row.success===false||row.valid===false?'danger':tab==='pending'?'neutral':'success'">
              {{ row.success===false?'Erreur':row.valid===false?'Invalide':tab==='pending'?'En attente':'Envoyee' }}
            </UiBadge>
            <small v-if="row.error_msg" class="table-detail error-text">{{ row.error_msg }}</small>
          </td>
          <td class="card-actions">
            <UiButton v-if="tab==='history'" variant="ghost" icon-only title="Voir l'email" aria-label="Voir l'email" @click="$emit('preview',row)"><Eye/></UiButton>
            <UiButton v-if="tab==='history'&&!row.success" variant="ghost" icon-only title="Renvoyer" aria-label="Renvoyer" @click="$emit('resend',row)"><Send/></UiButton>
            <UiButton v-if="tab==='pending'" size="sm" title="Envoyer maintenant" :aria-label="`Envoyer ${row.event_label||row.event||'la notification'}`" @click="$emit('send',row)"><template #icon><Send/></template>Envoyer</UiButton>
            <UiButton v-if="tab==='pending'" variant="ghost" icon-only title="Marquer comme traitee (sans envoyer)" aria-label="Marquer comme traitee" @click="$emit('markHandled',row)"><CheckCheck/></UiButton>
            <UiButton v-if="tab==='pending'" variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="$emit('deleteOne',row)"><Trash2/></UiButton>
          </td>
        </tr>
      </tbody>
    </table>
    <UiEmptyState v-if="!loading&&!rows.length" message="Aucune notification." />
  </section>
</template>

<script setup lang="ts">
import { formatDateTimeShort as formatDate } from '@/utils/format';
import { CheckCheck, Eye, Send, Trash2 } from '@lucide/vue';
import { useTableSelection } from '@/composables/useTableSelection';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

export interface NotificationRow {
  id: number | string;
  event?: string;
  event_label?: string;
  sent_at?: string;
  created_at?: string;
  media_title?: string;
  recipient?: string;
  recipients?: string[];
  success?: boolean;
  valid?: boolean;
  error_msg?: string;
  scope?: string;
  season_number?: number;
  episode_number?: number;
  language?: string;
  is_upgrade?: boolean;
  context?: Record<string, any>;
  event_description?: string;
}

const props = withDefaults(
  defineProps<{
    rows?: NotificationRow[];
    tab?: string;
    loading?: boolean;
  }>(),
  { rows: () => [], tab: 'history', loading: false }
);
defineEmits<{
  (e: 'send', row: NotificationRow): void;
  (e: 'resend', row: NotificationRow): void;
  (e: 'markHandled', row: NotificationRow): void;
  (e: 'deleteOne', row: NotificationRow): void;
  (e: 'preview', row: NotificationRow): void;
}>();

const { selectedIds, allSelected, isSelected, toggle, toggleAll, clear } = useTableSelection(() => props.rows);

const SCOPE_LABELS: Record<string, string> = {
  episode: 'Épisode',
  season_start: 'Début de saison',
  season_complete: 'Saison complète',
  series_complete: 'Série complète',
  movie: 'Film',
};

function context(row: NotificationRow): string {
  const scope = row.scope, season = row.season_number, episode = row.episode_number;
  const parts: string[] = [];
  if (scope === 'episode' && season && episode) parts.push(`S${season}E${episode}`);
  else if (scope && (season || scope !== 'movie')) parts.push(season ? `${SCOPE_LABELS[scope] || scope} ${season}` : (SCOPE_LABELS[scope] || scope));
  if (row.language) parts.push(row.language.toUpperCase());
  if (row.is_upgrade) parts.push('amélioration');
  if (parts.length) return parts.join(' · ');
  const c = row.context || {};
  return [c.scope, c.language, c.is_upgrade ? 'amelioration' : ''].filter(Boolean).join(' - ') || row.event_description || '';
}
// NotificationsView lit la selection pour ses envois/suppressions groupes.
defineExpose({ selectedIds, clearSelection: clear });
</script>
