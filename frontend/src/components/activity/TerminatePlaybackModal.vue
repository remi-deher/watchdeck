<template>
  <!-- Arreter une lecture coupe l'utilisateur en plein film : le message qu'il verra sur
       son ecran est donc demande ici (gabarit Creer), avec une formulation par defaut polie. -->
  <CreateTemplate :open="open" :definition="definition" mode="edit" @created="emit('terminated')" @close="emit('close')" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import { terminatePlaybackForm } from '@/creations/terminatePlayback';

const props = defineProps<{ open: boolean; sessionId: number | string; subtitle?: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'terminated'): void }>();

const definition = computed(() => terminatePlaybackForm(props.sessionId, props.subtitle));
</script>
