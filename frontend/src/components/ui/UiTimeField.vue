<template>
  <!-- Champ horaire Reka UI (TimeField) : un segment par unite, reglable aux fleches ou
       au clavier numerique, identique sur tous les navigateurs -- le champ natif
       type=time changeait d'apparence, et parfois de format 12 h, selon le systeme.
       Toujours sur 24 heures, a la minute. -->
  <TimeFieldRoot
    :id="id || undefined"
    v-slot="{ segments }"
    class="ui-time-field"
    :model-value="valeur"
    :granularity="withMinutes ? 'minute' : 'hour'"
    :hour-cycle="24"
    locale="fr-FR"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    @update:model-value="choisir"
  >
    <template v-for="item in segments" :key="item.part">
      <TimeFieldInput v-if="item.part === 'literal'" :part="item.part" class="ui-time-field__literal">{{ item.value }}</TimeFieldInput>
      <TimeFieldInput v-else :part="item.part" class="ui-time-field__segment" :aria-label="libelles[item.part]">{{ item.value }}</TimeFieldInput>
    </template>
  </TimeFieldRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Time } from '@internationalized/date';
import { TimeFieldInput, TimeFieldRoot } from 'reka-ui';

const props = withDefaults(defineProps<{
  hour?: number | null;
  minute?: number | null;
  /** Sans minutes, le champ ne regle que l'heure pile. */
  withMinutes?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
}>(), { hour: null, minute: 0, withMinutes: true, disabled: false, ariaLabel: '', id: '' });

const emit = defineEmits<{
  (e: 'update:hour', h: number): void;
  (e: 'update:minute', m: number): void;
}>();

// Noms lus par les lecteurs d'ecran : Reka les fournit en anglais.
const libelles: Record<string, string> = { hour: 'Heures', minute: 'Minutes', second: 'Secondes', dayPeriod: 'AM/PM' };

const valeur = computed(() => (props.hour == null ? undefined : new Time(props.hour, props.withMinutes ? (props.minute ?? 0) : 0)));

// Reka type la valeur en TimeValue (Time, ou date + heure) : seules l'heure et la minute comptent.
function choisir(t: { hour: number; minute: number } | undefined): void {
  // Un segment efface rend `undefined` : la valeur precedente est conservee.
  if (!t) return;
  if (t.hour !== props.hour) emit('update:hour', t.hour);
  if (props.withMinutes && t.minute !== props.minute) emit('update:minute', t.minute);
}
</script>

<style scoped>
.ui-time-field{display:inline-flex;align-items:center;width:fit-content;min-height:38px;padding:0 10px;border:1px solid var(--border);border-radius:var(--btn-radius);background:var(--surface-2);color:var(--text);font-size:var(--fs-sm);font-variant-numeric:tabular-nums}
.ui-time-field:focus-within{border-color:var(--accent)}
.ui-time-field[data-disabled]{opacity:.55;cursor:not-allowed}
.ui-time-field__segment{padding:2px 3px;border-radius:var(--radius-xs);outline:none;caret-color:transparent}
.ui-time-field__segment:focus{background:var(--accent);color:var(--on-accent)}
.ui-time-field__segment[data-placeholder]{color:var(--muted)}
.ui-time-field__literal{color:var(--muted)}
@media (pointer:coarse){.ui-time-field{min-height:44px}}
</style>
