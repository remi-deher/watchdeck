<template>
  <!-- Alignement des pistes Plex : portée, pistes (avec ce qui change), profils. Le parcours est
       celui du gabarit Creer ; la definition vit dans creations/alignStreams. -->
  <CreateTemplate v-if="item" :open="open" :definition="definition" mode="edit" @close="emit('close')" />
</template>

<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { useSeasonEpisodes } from '@/composables/useSeasonEpisodes';
import { alignStreamsCreation } from '@/creations/alignStreams';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    item?: any;
    initialScope?: 'series' | 'season' | 'episode' | 'selection';
    initialSeasonNumber?: number | null;
    initialEpisodeNumber?: number | null;
  }>(),
  {
    open: false,
    item: null,
    initialScope: 'selection',
    initialSeasonNumber: null,
    initialEpisodeNumber: null,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'applied', payload: { item: any; res: any }): void;
}>();

const seasons = useSeasonEpisodes(() => {
  if (props.item?.media_type !== 'show' || !props.item?.id) return null;
  return {
    source: props.item.source_type === 'request' ? 'requests' : 'library',
    id: props.item.id,
    mediaType: props.item.media_type,
  };
});

/* Une definition par media : un parent qui recree l'objet `item` (meme id) ne referme pas le parcours. */
const definition = shallowRef(build());
function build() {
  return alignStreamsCreation({
    item: props.item,
    initialScope: props.initialScope,
    initialSeasonNumber: props.initialSeasonNumber,
    initialEpisodeNumber: props.initialEpisodeNumber,
    seasons,
    onApplied: (res) => emit('applied', { item: props.item, res }),
  });
}
watch(() => [props.item?.id, props.initialScope, props.initialSeasonNumber, props.initialEpisodeNumber], () => { definition.value = build(); });
</script>
