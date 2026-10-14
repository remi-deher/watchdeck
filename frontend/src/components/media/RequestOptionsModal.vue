<template>
  <!-- Pour qui, dans quel dossier, quelles saisons : les reponses passent par le gabarit Creer et
       reviennent a la page par ses `update:`, puis `confirm`. Le parent garde la main sur la suite
       (`busy`) : la fenetre se masque pendant l'envoi et revient si la page la laisse ouverte. -->
  <CreateTemplate :open="open && !submitted" :definition="definition" mode="edit" @close="dismiss" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { requestOptionsForm } from '@/creations/requestOptions';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    mediaTitle?: string;
    requesters?: any[];
    folders?: any[];
    plexUserId?: string;
    rootFolder?: string;
    busy?: boolean;
    confirmLabel?: string;
    mediaType?: string;
    seasons?: number[];
    seasonNumbers?: Array<number | string>;
  }>(),
  {
    open: false,
    mediaTitle: '',
    requesters: () => [],
    folders: () => [],
    plexUserId: '',
    rootFolder: '',
    busy: false,
    confirmLabel: 'Envoyer la demande',
    mediaType: '',
    seasons: () => [],
    seasonNumbers: () => [],
  }
);
const emit = defineEmits<{
  (e: 'update:plexUserId', value: string): void;
  (e: 'update:rootFolder', value: string): void;
  (e: 'update:seasons', seasons: number[]): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const selectableSeasons = computed(() =>
  props.seasonNumbers
    .map(Number)
    .filter((season) => Number.isInteger(season) && season > 0)
);

const submitted = ref(false);
watch(() => props.open, (open) => { if (!open) submitted.value = false; });
watch(() => props.busy, (busy, was) => { if (was && !busy) submitted.value = false; });

const definition = computed(() => requestOptionsForm({
  mediaTitle: props.mediaTitle,
  mediaType: props.mediaType,
  confirmLabel: props.confirmLabel,
  requesters: props.requesters,
  folders: props.folders,
  seasonNumbers: selectableSeasons.value,
  initial: () => ({ plexUserId: props.plexUserId, rootFolder: props.rootFolder, seasons: [...props.seasons] }),
  onConfirm: (values) => {
    submitted.value = true;
    emit('update:plexUserId', values.plexUserId);
    emit('update:rootFolder', values.rootFolder);
    if (selectableSeasons.value.length) emit('update:seasons', values.seasons);
    emit('confirm');
  },
}));
function dismiss(): void {
  if (!submitted.value) emit('cancel');
}
</script>
