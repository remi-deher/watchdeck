<template>
  <div v-if="requesterIds.length > 1" class="requester-breakdown">
    <div v-for="(uid, index) in requesterIds" :key="`${uid}-${index}`" class="requester-line">
      <span class="requester-name">
        {{ row.requesters?.[index] || uid }}
        <span v-if="index === 0" class="badge tiny">Principal</span>
        <UiTooltip v-if="notifiedStatus(row, uid) !== null" :text="notifiedStatus(row, uid) ? 'Deja notifie' : 'Pas encore notifie'">
          <span
            :class="['notif-dot', notifiedStatus(row, uid) ? 'ok' : 'pending']"
            role="img"
            :aria-label="notifiedStatus(row, uid) ? 'Deja notifie' : 'Pas encore notifie'"
          />
        </UiTooltip>
      </span>
      <UiMenu v-if="admin" :label="row.requesters?.[index] || String(uid)">
        <template #trigger>
          <UiButton icon-only title="Actions" aria-label="Actions" :disabled="busy">
            <MoreVertical />
          </UiButton>
        </template>
        <UiMenuItem @select="emit('notify-user', row.id, uid, ['request'])">
          <Mail /> Renvoyer mail demande
        </UiMenuItem>
        <UiMenuItem v-if="row.status === 'available'" @select="emit('notify-user', row.id, uid, ['available'])">
          <MailCheck /> Renvoyer mail dispo
        </UiMenuItem>
        <UiMenuItem v-if="index !== 0" @select="emit('promote-requester', row, uid)">
          <Crown /> Promouvoir principal
        </UiMenuItem>
        <UiMenuSeparator />
        <UiMenuItem variant="danger" @select="emit('remove-requester', row, uid)">
          <UserMinus /> Retirer
        </UiMenuItem>
      </UiMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiTooltip from '@/components/ui/UiTooltip.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';
import { computed } from 'vue';
import { Crown, Mail, MailCheck, MoreVertical, UserMinus } from '@lucide/vue';
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

const requesterIds = computed(() => props.row.requester_ids || []);
</script>
