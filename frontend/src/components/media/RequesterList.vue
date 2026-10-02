<template>
  <section class="requesters-card" :aria-labelledby="headingId">
    <header class="requesters-head">
      <div class="requesters-title">
        <h3 :id="headingId">Demandeurs</h3>
        <span class="requesters-count" :aria-label="`${requesterIds.length} demandeur${requesterIds.length > 1 ? 's' : ''}`">{{ requesterIds.length }}</span>
      </div>
      <span class="requesters-hint">Chacun reçoit ses mails selon ses préférences</span>
    </header>

    <div v-if="pending.length" class="requesters-alert" role="status">
      <Clock class="requesters-alert-icon" aria-hidden="true" />
      <span class="requesters-alert-text">
        {{ joinNames(pending.map((p) => p.name)) }}
        {{ pending.length > 1 ? "n'ont" : "n'a" }} pas encore reçu le mail de disponibilité.
      </span>
      <div v-if="admin" class="requesters-alert-actions">
        <UiButton
          v-for="person in pending"
          :key="person.uid"
          variant="primary"
          size="sm"
          :disabled="busy"
          @click="emit('notify-user', row.id, person.uid, ['available'])"
        >Prévenir {{ person.name }}</UiButton>
      </div>
    </div>

    <p v-if="!requesterIds.length" class="requester-empty">
      Aucun demandeur : ce média a été ajouté sans demande utilisateur.
    </p>
    <template v-else>
      <div class="requesters-columns" aria-hidden="true">
        <span>Personne</span><span>Mail de demande</span><span>Mail de disponibilité</span><span />
      </div>
      <ul class="requester-list">
        <li
          v-for="(uid, index) in requesterIds"
          :key="`${uid}-${index}`"
          :class="['requester-line', { 'is-waiting': isWaiting(uid) }]"
        >
          <div class="requester-who">
            <span :class="['requester-avatar', { 'is-main': index === 0 }]" aria-hidden="true">{{ initial(index) }}</span>
            <div class="requester-identity">
              <strong class="requester-name">{{ requesterName(row, index) }}</strong>
              <span :class="['requester-role', { 'is-main': index === 0 }]">{{ index === 0 ? 'Demandeur principal' : 'Co-demandeur' }}</span>
            </div>
          </div>
          <div v-for="event in EVENTS" :key="event.key" :class="['requester-mail', `is-${mailState(row, uid, event.key)}`]">
            <span class="requester-mail-kind">{{ event.short }}</span>
            <template v-if="mailState(row, uid, event.key) === 'sent'">
              <span class="requester-mail-state">✓ Reçu</span>
              <span v-if="mailSentDetail(row, event.key)" class="requester-mail-detail">{{ mailSentDetail(row, event.key) }}</span>
            </template>
            <template v-else-if="mailState(row, uid, event.key) === 'pending'">
              <span class="requester-mail-state">En attente</span>
              <UiButton
                v-if="admin"
                size="sm"
                class="requester-send-now"
                :aria-label="`Envoyer maintenant le ${event.label.toLowerCase()} à ${requesterName(row, index)}`"
                :disabled="busy"
                @click="emit('notify-user', row.id, uid, [event.key])"
              >Envoyer maintenant</UiButton>
            </template>
            <template v-else>
              <span class="requester-mail-state">Sans objet</span>
              <span v-if="mailNoneReason(row, uid, event.key)" class="requester-mail-detail">{{ mailNoneReason(row, uid, event.key) }}</span>
            </template>
          </div>
          <div class="requester-menu">
            <UiMenu v-if="admin" :label="requesterName(row, index)" align="end">
              <template #trigger>
                <UiButton icon-only :title="`Actions pour ${requesterName(row, index)}`" :aria-label="`Actions pour ${requesterName(row, index)}`" :disabled="busy">
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
          </div>
        </li>
      </ul>
    </template>

    <!-- Formulaire d'ajout (fourni par l'onglet, admin uniquement). -->
    <div v-if="$slots.default" class="requesters-footer">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import { computed, useId } from 'vue';
import { Clock, Crown, Mail, MailCheck, MoreVertical, UserMinus } from '@lucide/vue';
import { joinNames, mailNoneReason, mailSentDetail, mailState, pendingAvailableRequesters, requesterName } from './requestRules';

const EVENTS = [
  { key: 'request', label: 'Mail de demande', short: 'Demande' },
  { key: 'available', label: 'Mail de disponibilité', short: 'Disponibilité' },
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

const headingId = `requesters-${useId()}`;
const requesterIds = computed<string[]>(() => props.row.requester_ids || []);
const pending = computed(() => pendingAvailableRequesters(props.row));
const isWaiting = (uid: string): boolean => pending.value.some((person) => person.uid === uid);
const initial = (index: number): string => requesterName(props.row, index).trim().charAt(0).toUpperCase() || '?';
</script>

<style scoped lang="scss">
.requesters-card {
  container: demandeurs / inline-size;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.requesters-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  padding: 20px var(--space-5) 14px;
}
.requesters-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.requesters-title h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
}
.requesters-count {
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
}
.requesters-hint {
  color: var(--muted);
  font-size: var(--fs-sm);
}

.requesters-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin: 0 var(--space-5) 14px;
  padding: var(--space-3) 14px;
  border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--amber) 12%, transparent);
  color: var(--amber-text);
}
.requesters-alert-icon {
  flex: none;
  width: 18px;
  height: 18px;
}
.requesters-alert-text {
  flex: 1 1 220px;
  min-width: 0;
  font-size: var(--fs-md);
}
.requesters-alert-actions :deep(.ui-button) {
  white-space: normal;
  line-height: 1.2;
}
.requesters-alert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.requester-empty {
  margin: 0;
  padding: 0 var(--space-5) var(--space-4);
  color: var(--muted);
  font-size: var(--fs-sm);
}

.requesters-columns,
.requester-line {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 44px;
  gap: var(--space-3);
  padding: 14px var(--space-5);
}
.requesters-columns {
  padding-block: 10px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.requester-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.requester-line {
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.requester-line.is-waiting {
  background: color-mix(in srgb, var(--amber) 5%, transparent);
}
.requester-who {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.requesters-card .requester-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text);
  font-weight: 700;
}
.requesters-card .requester-avatar.is-main {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}
.requester-identity {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.requester-name {
  overflow: hidden;
  font-size: var(--fs-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.requester-role {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.requester-role.is-main {
  color: var(--accent);
  font-weight: 600;
}
.requester-mail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
/* Libellé de colonne répété dans chaque case : utile seulement en disposition carte. */
.requester-mail-kind {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.requester-mail-state {
  font-size: var(--fs-md);
}
.requester-mail.is-sent .requester-mail-state {
  color: var(--green-text);
}
.requester-mail.is-pending .requester-mail-state {
  color: var(--amber-text);
}
.requester-mail.is-none .requester-mail-state,
.requester-mail-detail {
  color: var(--muted);
}
.requester-mail-detail {
  font-size: var(--fs-xs);
}
.requester-mail :deep(.requester-send-now) {
  max-width: 100%;
  padding-inline: 10px;
  line-height: 1.2;
  white-space: normal;
  margin-top: 2px;
  border-color: var(--accent);
  background: transparent;
  color: var(--accent);
}
.requester-menu {
  display: flex;
  justify-content: flex-end;
}
.requester-menu :deep(.ui-button) {
  width: 44px;
  height: 44px;
}

.requesters-footer {
  padding: var(--space-4) var(--space-5) 20px;
}

/* Colonne étroite (téléphone, ou grille repliée) : chaque demandeur devient une carte
   avec ses deux mails en tuiles. */
@container demandeurs (max-width: 500px) {
  .requesters-head,
  .requester-line,
  .requesters-footer {
    padding-inline: 18px;
  }
  .requesters-alert {
    margin-inline: 18px;
  }
  .requesters-alert-actions,
  .requesters-alert-actions :deep(.ui-button) {
    width: 100%;
    min-height: 44px;
  }
  .requesters-columns {
    display: none;
  }
  .requester-list {
    border-top: 1px solid var(--border);
  }
  .requester-line {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas: 'who who' 'request available';
    gap: 10px var(--space-2);
  }
  .requester-who {
    grid-area: who;
    padding-right: 52px;
  }
  .requester-menu {
    position: absolute;
    top: 10px;
    right: 18px;
  }
  .requester-line {
    position: relative;
  }
  .requester-mail {
    padding: var(--space-2) 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .requester-mail-kind {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
    color: var(--muted);
    font-size: 0.6875rem;
  }
  .requester-mail-state {
    font-size: var(--fs-sm);
  }
  .requester-mail :deep(.requester-send-now) {
    min-height: 44px;
    width: 100%;
  }
}
</style>
