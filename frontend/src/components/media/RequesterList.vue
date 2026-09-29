<template>
  <ul v-if="entries.length" class="requester-list">
    <li v-for="entry in entries" :key="`${entry.uid}-${entry.index}`" class="requester-item">
      <span class="requester-avatar" aria-hidden="true">{{ initial(entry.name) }}</span>
      <div class="requester-text">
        <strong>{{ entry.name }}</strong>
        <small>
          <span>{{ entry.index === 0 ? (entries.length > 1 ? 'Demandeur principal' : 'Demandeur') : 'Co-demandeur' }}</span>
          <span v-if="entry.notified !== null" :class="['requester-notif', entry.notified ? 'ok' : 'pending']">
            <MailCheck v-if="entry.notified" aria-hidden="true" /><Clock v-else aria-hidden="true" />
            {{ entry.notified ? 'Notifié' : 'Pas encore notifié' }}
          </span>
        </small>
      </div>
      <UiMenu v-if="admin && entry.uid" :label="entry.name">
        <template #trigger>
          <UiButton icon-only :title="`Actions pour ${entry.name}`" :aria-label="`Actions pour ${entry.name}`" :disabled="busy">
            <MoreVertical />
          </UiButton>
        </template>
        <UiMenuItem @select="emit('notify-user', row.id, entry.uid, ['request'])">
          <Mail /> Renvoyer mail demande
        </UiMenuItem>
        <UiMenuItem v-if="row.status === 'available'" @select="emit('notify-user', row.id, entry.uid, ['available'])">
          <MailCheck /> Renvoyer mail dispo
        </UiMenuItem>
        <template v-if="entries.length > 1">
          <UiMenuItem v-if="entry.index !== 0" @select="emit('promote-requester', row, entry.uid)">
            <Crown /> Promouvoir principal
          </UiMenuItem>
          <UiMenuSeparator />
          <UiMenuItem variant="danger" @select="emit('remove-requester', row, entry.uid)">
            <UserMinus /> Retirer
          </UiMenuItem>
        </template>
      </UiMenu>
    </li>
  </ul>
  <p v-else class="requester-empty">Aucun demandeur : ce média a été ajouté directement dans *arr ou Plex.</p>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import { computed } from 'vue';
import { Clock, Crown, Mail, MailCheck, MoreVertical, UserMinus } from '@lucide/vue';
import { requesterName } from '@/utils/userLabels';
import { notifiedStatus } from './requestRules';

const props = withDefaults(
  defineProps<{
    row: any;
    admin?: boolean;
    busy?: boolean;
  }>(),
  {
    admin: false,
    busy: false,
  }
);
const emit = defineEmits<{
  (e: 'notify-user', rowId: any, uid: any, types: string[]): void;
  (e: 'promote-requester', row: any, uid: any): void;
  (e: 'remove-requester', row: any, uid: any): void;
}>();

/* Le demandeur unique d'une ancienne demande n'a parfois pas de `requester_ids` :
   on retombe alors sur le nom porté par la demande elle-même. */
const entries = computed(() => {
  const ids: any[] = props.row.requester_ids || [];
  if (!ids.length) {
    const name = requesterName(props.row);
    return name ? [{ uid: props.row.plex_user_id || '', index: 0, name, notified: null }] : [];
  }
  return ids.map((uid, index) => ({
    uid,
    index,
    name: String(props.row.requesters?.[index] || uid),
    notified: notifiedStatus(props.row, uid),
  }));
});

const initial = (name: string): string => (name.trim()[0] || '?').toUpperCase();
</script>

<style scoped lang="scss">
.requester-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.requester-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 6px 4px;
  border-radius: var(--radius-sm);
}
.requester-item:hover {
  background: var(--surface-2);
}
.requester-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  color: var(--accent);
  font-size: var(--fs-sm);
  font-weight: 700;
}
.requester-text {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 1px;
}
.requester-text strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.requester-text small {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--space-2);
  color: var(--muted);
  font-size: var(--fs-xs);
}
.requester-notif {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.requester-notif svg {
  width: 12px;
  height: 12px;
}
.requester-notif.ok {
  color: var(--green-text);
}
.requester-empty {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
</style>
