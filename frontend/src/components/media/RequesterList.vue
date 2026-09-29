<template>
  <div class="requester-breakdown">
    <div class="requester-head">
      <span class="requester-title">Demandeurs</span>
      <span class="requester-count">{{ requesterIds.length }}</span>
    </div>
    <p v-if="!requesterIds.length" class="requester-empty">
      Aucun demandeur : ce média a été ajouté sans demande utilisateur.
    </p>
    <ul v-else class="requester-list">
      <li v-for="(uid, index) in requesterIds" :key="`${uid}-${index}`" class="requester-line">
        <div class="requester-who">
          <span class="requester-avatar" aria-hidden="true">{{ initial(index, uid) }}</span>
          <div class="requester-identity">
            <strong class="requester-name">{{ nameOf(index, uid) }}</strong>
            <span class="requester-role">{{ index === 0 ? 'Demandeur principal' : 'Co-demandeur' }}</span>
          </div>
        </div>
        <div class="requester-mails">
          <template v-for="event in EVENTS" :key="event.key">
            <span
              v-if="mailState(row, uid, event.key) !== 'none'"
              :class="['mail-pill', mailState(row, uid, event.key)]"
            >
              <component :is="mailState(row, uid, event.key) === 'sent' ? MailCheck : Clock" aria-hidden="true" />
              {{ event.label }} {{ mailState(row, uid, event.key) === 'sent' ? 'reçu' : 'non envoyé' }}
            </span>
          </template>
        </div>
        <UiMenu v-if="admin" :label="nameOf(index, uid)">
          <template #trigger>
            <UiButton icon-only title="Actions" aria-label="Actions" :disabled="busy">
              <MoreVertical />
            </UiButton>
          </template>
          <UiMenuItem v-if="row.origin_kind === 'request' || !row.origin_kind" @select="emit('notify-user', row.id, uid, ['request'])">
            <Mail /> Envoyer le mail de demande
          </UiMenuItem>
          <UiMenuItem v-if="row.status === 'available'" @select="emit('notify-user', row.id, uid, ['available'])">
            <MailCheck /> Envoyer le mail de disponibilité
          </UiMenuItem>
          <UiMenuItem v-if="index !== 0" @select="emit('promote-requester', row, uid)">
            <Crown /> Passer en principal
          </UiMenuItem>
          <UiMenuSeparator />
          <UiMenuItem variant="danger" @select="emit('remove-requester', row, uid)">
            <UserMinus /> Retirer
          </UiMenuItem>
        </UiMenu>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import { computed } from 'vue';
import { Clock, Crown, Mail, MailCheck, MoreVertical, UserMinus } from '@lucide/vue';
import { mailState } from './requestRules';

const EVENTS = [
  { key: 'request', label: 'Mail demande' },
  { key: 'available', label: 'Mail dispo' },
] as const;

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

const requesterIds = computed<string[]>(() => props.row.requester_ids || []);
const nameOf = (index: number, uid: string): string => props.row.requesters?.[index] || String(uid);
const initial = (index: number, uid: string): string => nameOf(index, uid).trim().charAt(0).toUpperCase() || '?';
</script>

<style scoped lang="scss">
.requester-breakdown {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  container: requesters / inline-size;
}
.requester-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.requester-breakdown .requester-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text);
}
.requester-breakdown .requester-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-xs);
  text-align: center;
}
.requester-empty {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.requester-list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.requester-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.requester-line:first-child {
  border-top: none;
}
.requester-who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
/* Plus specifique que `.detail-row > div:first-child span` (display: block global). */
.requester-breakdown .requester-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: var(--fs-sm);
  font-weight: 700;
}
.requester-identity {
  display: grid;
  min-width: 0;
}
.requester-name {
  overflow: hidden;
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.requester-breakdown .requester-role {
  display: block;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.requester-mails {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}
.requester-breakdown .mail-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.mail-pill svg {
  width: 12px;
  height: 12px;
}
.mail-pill.sent {
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green-text);
}
.mail-pill.pending {
  border-color: color-mix(in srgb, var(--amber) 45%, transparent);
  color: var(--amber-text);
}

@container requesters (max-width: 480px) {
  .requester-line {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .requester-mails {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
  }
}
</style>
