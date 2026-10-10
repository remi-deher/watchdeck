<template>
  <!-- Les débits en retour de la capsule : réception, envoi, état de connexion des clients.
       Remplace la barre fixée en bas d'écran. -->
  <div class="cmd" role="region" aria-label="Débits des clients torrent">
    <span class="cmd-speed" title="Réception"><Download aria-hidden="true" /><strong>{{ formatSpeed(downloadSpeed) }}</strong></span>
    <span class="cmd-speed" title="Envoi"><Upload aria-hidden="true" /><strong>{{ formatSpeed(uploadSpeed) }}</strong></span>
    <UiBadge dot :tone="connection.tone">{{ connection.label }}</UiBadge>
    <UiBadge v-if="altSpeed" tone="warning">Mode alternatif</UiBadge>
  </div>
</template>

<script setup lang="ts">
import { Download, Upload } from '@lucide/vue';
import { useTorrentSpeeds } from '@/composables/useTorrentSpeeds';
import { formatSpeed } from '@/downloads/torrentFormat';
import UiBadge from '@/components/ui/UiBadge.vue';

const props = defineProps<{ clientId?: string | number }>();
const { downloadSpeed, uploadSpeed, altSpeed, connection } = useTorrentSpeeds(() => props.clientId);
</script>

<style scoped lang="scss">
.cmd { display: flex; align-items: center; gap: var(--space-3); }
.cmd-speed { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.cmd-speed svg { width: 14px; height: 14px; color: var(--muted); }
.cmd-speed strong { font-size: var(--fs-sm); }
</style>
