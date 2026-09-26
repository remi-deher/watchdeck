<template>
  <!-- Barre fixee en bas d'ecran : debits globaux, etat de connexion des clients, et les
       bascules d'affichage du tableau (densite, incognito) et du mode alternatif. -->
  <div class="global-speed-bar">
    <div class="speed-counters">
      <span class="speed-item"><Download /><span><small>Réception</small><strong>{{ formatSpeed(downloadSpeed) }}</strong></span></span>
      <span class="speed-item"><Upload /><span><small>Envoi</small><strong>{{ formatSpeed(uploadSpeed) }}</strong></span></span>
      <span class="connection-status" :class="connectionClass"><i />{{ connectionLabel }}</span>
    </div>
    <div class="speed-bar-actions">
      <UiButton class="text-xs tool-toggle-btn" :class="{ active: compact }" title="Basculer entre affichage compact et confortable" @click="compact = !compact">
        <Minimize2 v-if="compact" /><Maximize2 v-else /> {{ compact ? 'Compact' : 'Normal' }}
      </UiButton>
      <UiButton class="text-xs tool-toggle-btn" :class="{ active: incognito }" title="Mode Incognito (masquer / anonymiser les noms de torrents)" @click="incognito = !incognito">
        <EyeOff v-if="incognito" /><Eye v-else /> {{ incognito ? 'Incognito' : 'Discret' }}
      </UiButton>
      <UiButton class="text-xs alt-speed-btn" :class="{ active: altSpeed }" title="Activer / désactiver les limites de vitesse alternatives (Turtle mode)" @click="toggleAltSpeed">
        <Gauge /> Mode alternatif : <strong>{{ altSpeed ? 'ON' : 'OFF' }}</strong>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Download, Eye, EyeOff, Gauge, Maximize2, Minimize2, Upload } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { formatSpeed } from '@/downloads/torrentFormat';

const props = defineProps<{
  /** Client affiche, ou vide pour tous. */
  clientId?: string | number;
  /** Les torrents affiches : chaque rafraichissement relit les debits. */
  rows: any[];
}>();
const emit = defineEmits<{ (e: 'refresh'): void; (e: 'error', message: string): void }>();

const compact = defineModel<boolean>('compact', { default: false });
const incognito = defineModel<boolean>('incognito', { default: false });

const downloadSpeed = ref(0);
const uploadSpeed = ref(0);
const altSpeed = ref(false);
const connectedClients = ref(0);
const totalClients = ref(0);
const connectionClass = computed(() => totalClients.value === 0 ? 'unknown' : connectedClients.value === totalClients.value ? 'connected' : connectedClients.value > 0 ? 'partial' : 'offline');
const connectionLabel = computed(() => {
  if (totalClients.value === 0) return 'Aucun client';
  if (totalClients.value === 1) return connectedClients.value ? 'Connecté' : 'Hors ligne';
  return `${connectedClients.value}/${totalClients.value} connectés`;
});

let statsLoadTimer: ReturnType<typeof setTimeout> | undefined;

// Les rafales d'evenements temps reel ne declenchent qu'une lecture.
function scheduleStats(): void {
  clearTimeout(statsLoadTimer);
  statsLoadTimer = setTimeout(loadStats, 250);
}

async function loadStats(): Promise<void> {
  try {
    const suffix = props.clientId ? `?client_id=${encodeURIComponent(props.clientId)}` : '';
    const data = await api(`/api/downloads/global-stats${suffix}`);
    downloadSpeed.value = Number(data.download_speed || 0);
    uploadSpeed.value = Number(data.upload_speed || 0);
    altSpeed.value = !!data.alt_speed_enabled;
    connectedClients.value = Number(data.connected || 0);
    totalClients.value = Number(data.total || 0);
  } catch {
    connectedClients.value = 0;
    totalClients.value = props.clientId ? 1 : totalClients.value;
  }
}

async function toggleAltSpeed(): Promise<void> {
  try {
    const res = await api('/api/downloads/global-alt-speed', { method: 'POST' });
    if (res.ok) {
      altSpeed.value = !altSpeed.value;
      emit('refresh');
    }
  } catch (e: any) {
    emit('error', `Impossible de modifier le mode vitesse alternative : ${e.message}`);
  }
}

onMounted(loadStats);
onUnmounted(() => clearTimeout(statsLoadTimer));
watch(() => props.rows, scheduleStats);
watch(() => props.clientId, loadStats);
</script>

<style scoped>
.global-speed-bar{position:fixed;left:0;right:0;bottom:0;z-index:35;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:4px max(10px,var(--safe-right)) 4px max(10px,var(--safe-left));border:0;border-top:1px solid var(--border);border-radius:0;background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:0 -6px 22px rgb(var(--shadow-color) / calc(0.18 * var(--shadow-scale)));backdrop-filter:blur(12px);flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain}
:global(.shell.sidebar-collapsed) .global-speed-bar{left:72px}
.speed-counters{display:flex;align-items:center;gap:18px;min-width:max-content}
.speed-item{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
.speed-item>span{display:grid;gap:1px}
.speed-item small{color:var(--accent);font-size:var(--fs-xs);font-weight:700}
.speed-item strong{font-size:var(--fs-sm)}
.speed-item svg{width:15px;height:15px;color:var(--muted)}
.connection-status{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:var(--fs-xs);font-weight:700;white-space:nowrap}
.connection-status i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}
.connection-status.connected{color: var(--green-text)}
.connection-status.partial{color: var(--amber-text)}
.connection-status.offline{color: var(--red-text)}
.speed-bar-actions{display:flex;align-items:center;gap:6px;min-width:max-content}
.speed-bar-actions button{min-height:32px;padding:4px 9px;white-space:nowrap}
.tool-toggle-btn.active{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);border-color:var(--accent)}
.alt-speed-btn.active{background:color-mix(in srgb,var(--warning) 16%,transparent);color: var(--amber-text);border-color:var(--warning)}
@media(min-width:761px){.global-speed-bar button{font-size:var(--fs-sm)}}
@media(max-width:760px){
  .global-speed-bar{left:0;bottom:var(--app-shell-offset-bottom);min-width:0;min-height:42px;padding:3px 8px}
  .speed-counters{gap:12px}
  .speed-item{gap:5px}.speed-item small{display:none}.speed-item strong{font-size:var(--fs-xs)}
  .speed-bar-actions{gap:4px}
  .speed-bar-actions button{justify-content:center;min-width:0;padding:3px 7px;font-size:var(--fs-xs)}
}
@media(max-width:380px){.connection-status{font-size:0}.connection-status i{width:8px;height:8px}}
</style>
