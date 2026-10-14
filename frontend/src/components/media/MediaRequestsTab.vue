<template>
  <section class="drawer-section requests-tab">
    <article v-for="(row, index) in requests || []" :key="row.id" class="request-block">
      <!-- 1. Parcours : état en une phrase, puis frise datée. -->
      <JourneyCard
        :title-id="`journey-title-${row.id}`"
        eyebrow="Parcours de la demande"
        :title="journeyHeadline(row)"
        :subtitle="journeySubtitle(row)"
      >
        <template #badges>
          <UiBadge pill :tone="statusTone(row.journey?.status || row.status)">{{ row.journey?.label || requestStatusLabel(row.status) }}</UiBadge>
          <span class="journey-origin">{{ originLabel(row) }}</span>
        </template>
        <p v-for="problem in row.problems || []" :key="problem.key" class="journey-subtitle">
          <strong>{{ problem.label }}</strong> · {{ problem.consequence }}
          <span v-if="problem.proposal"> Proposé : {{ problem.proposal }}</span>
        </p>
        <RequestStatusStepper :row="row" />
        <p v-if="!row.problems?.length && row.journey?.blocker" class="journey-subtitle">{{ row.journey.blocker.label }}</p>
        <p v-if="!row.problems?.length && row.journey?.next_step" class="journey-subtitle">Prochaine étape : {{ row.journey.next_step.label }}</p>
        <div v-if="row.media_type === 'show' && row.seasons?.length" class="journey-seasons">
          <span class="journey-seasons-title">Par saison · {{ seasonsSummary(row.seasons) }}</span>
          <ul class="journey-season-list">
            <li v-for="season in row.seasons" :key="season.season_number" :class="['journey-season', `is-${season.status}`]">
              <span>Saison {{ season.season_number }}</span>
              <strong>{{ season.episodes_available_count }}/{{ season.episodes_total_count }}</strong>
            </li>
          </ul>
        </div>
      </JourneyCard>

      <!-- 2. Demandeurs, administration et journal, chacun sur toute la largeur. -->
      <div class="request-grid">
        <RequesterList
          :row="row"
          :admin="admin"
          :busy="busy"
          @notify-user="(...args) => $emit('notify-user', ...args)"
          @promote-requester="(...args) => $emit('promote-requester', ...args)"
          @remove-requester="(...args) => $emit('remove-requester', ...args)"
        >
          <AddRequesterForm
            v-if="admin && index === 0"
            :model-value="newRequesterId"
            :users="addableUsers"
            :busy="busy"
            label="Ajouter une personne"
            submit-label="Ajouter"
            help="Il suivra cette demande et recevra les prochains mails. Aucun mail ne part sans confirmation."
            @update:model-value="$emit('update:newRequesterId', $event)"
            @submit="$emit('add-requester')"
          />
        </RequesterList>

        <div class="request-side">
          <RequestAdminCard
            v-if="admin"
            :row="row"
            :busy="busy"
            @resend-mail="(...args) => $emit('resend-mail', ...args)"
            @catch-up-all="(...args) => $emit('catch-up-all', ...args)"
            @approve="(...args) => $emit('approve', ...args)"
            @reject="(...args) => $emit('reject', ...args)"
            @open-release="(...args) => $emit('open-release', ...args)"
            @retry="(...args) => $emit('retry', ...args)"
            @close-request="(...args) => $emit('close-request', ...args)"
            @set-auto-import="(...args) => $emit('set-auto-import', ...args)"
            @withdraw-request="(...args) => $emit('withdraw-request', ...args)"
            @delete-request="(...args) => $emit('delete-request', ...args)"
          />

          <RequestMailHistory :row="row" />
        </div>
      </div>
    </article>

    <!-- 3. Aucune demande : le média est arrivé sans passer par un demandeur. -->
    <template v-if="!requests?.length">
      <JourneyCard
        v-if="detail && isInPlex(detail)"
        class="plex-origin-card"
        title-id="journey-title-direct"
        eyebrow="Parcours"
        :title="directHeadline(detail)"
        :subtitle="directSubtitle(detail)"
      >
        <template #badges><UiBadge pill tone="success">Disponible</UiBadge></template>
      </JourneyCard>

      <section class="nobody-card">
        <span class="nobody-icon" aria-hidden="true"><UserPlus /></span>
        <h3>Personne n'a demandé {{ mediaNoun(detail) }}</h3>
        <p v-if="admin">
          Ajoutez les personnes qui l'attendaient : une demande sera créée à leur nom.
          Aucun mail ne part sans confirmation.
        </p>
        <p v-else>Ce média a été ajouté sans demande utilisateur.</p>
        <AddRequesterForm
          v-if="admin"
          standalone
          :model-value="newRequesterId"
          :users="addableUsers"
          :busy="busy"
          label="Personne à ajouter"
          submit-label="Ajouter comme demandeur"
          @update:model-value="$emit('update:newRequesterId', $event)"
          @submit="$emit('add-requester')"
        />
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { isInPlex } from "@/utils/mediaAvailability";
import { UserPlus } from '@lucide/vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import { requestStatusLabel } from '@/utils/labels';
import AddRequesterForm from './AddRequesterForm.vue';
import JourneyCard from './JourneyCard.vue';
import RequestAdminCard from './RequestAdminCard.vue';
import RequestMailHistory from './RequestMailHistory.vue';
import RequestStatusStepper from './RequestStatusStepper.vue';
import RequesterList from './RequesterList.vue';
import { journeyHeadline, journeySubtitle, originLabel, seasonsSummary, statusTone } from './requestRules';
import { directHeadline, directSubtitle, mediaNoun } from './requestTabRules';

withDefaults(
  defineProps<{
    requests?: any[];
    detail?: any;
    admin?: boolean;
    busy?: boolean;
    addableUsers?: any[];
    newRequesterId?: string;
  }>(),
  {
    requests: () => [],
    detail: () => ({}),
    admin: false,
    busy: false,
    addableUsers: () => [],
    newRequesterId: '',
  }
);

defineEmits<{
  (e: 'update:newRequesterId', value: string): void;
  (e: 'add-requester'): void;
  (e: 'open-release', rowId: any): void;
  (e: 'retry', rowId: any): void;
  (e: 'catch-up-all', row: any): void;
  (e: 'resend-mail', rowId: any, type: string): void;
  (e: 'close-request', row: any): void;
  (e: 'delete-request', rowId: any): void;
  (e: 'withdraw-request', row: any): void;
  (e: 'set-auto-import', row: any, value: boolean | null): void;
  (e: 'notify-user', rowId: any, uid: any, types: string[]): void;
  (e: 'promote-requester', row: any, uid: any): void;
  (e: 'remove-requester', row: any, uid: any): void;
  (e: 'approve', rowId: any): void;
  (e: 'reject', row: any): void;
}>();
</script>

<style scoped lang="scss">
.requests-tab {
  container: demandes / inline-size;
  gap: var(--space-5);
}
.request-block {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.request-block + .request-block {
  padding-top: var(--space-5);
  border-top: 1px solid var(--border);
}

/* ----- Détail du parcours (dans JourneyCard) ----- */
.journey-origin {
  padding: 3px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: var(--fs-sm);
}
.journey-seasons {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.journey-seasons-title {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.journey-season-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.journey-season {
  display: inline-flex;
  gap: var(--space-2);
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  font-size: var(--fs-sm);
}
.journey-season.is-available {
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green-text);
}
.journey-season.is-partially_available {
  border-color: color-mix(in srgb, var(--amber) 45%, transparent);
  color: var(--amber-text);
}

/* ----- Demandeurs, administration et journal en pleine largeur ----- */
.request-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}
.request-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-width: 0;
}

/* ----- Aucune demande ----- */
.nobody-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: var(--space-6);
  border: 1px dashed var(--border-strong);
  border-radius: var(--panel-radius);
  background: var(--surface);
  text-align: center;
}
.nobody-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
}
.nobody-icon svg {
  width: 26px;
  height: 26px;
}
.nobody-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
}
.nobody-card p {
  max-width: 520px;
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-md);
  line-height: 1.55;
}

/* Téléphone : origine masquée, carte vide plus serrée. */
@container demandes (max-width: 560px) {
  .journey-origin {
    display: none;
  }
  .nobody-card {
    padding: var(--space-5) 18px;
  }
}
</style>
