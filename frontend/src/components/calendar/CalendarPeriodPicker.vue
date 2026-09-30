<template>
  <!-- Intitule de la periode affichee, entre les fleches. Il n'apparaissait nulle part :
       apres deux clics on ne savait plus quel mois on regardait. Un clic ouvre le choix
       direct du mois, pour sauter loin sans enchainer les fleches. -->
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" class="period-trigger" :aria-label="`Période affichée : ${label}. Choisir un mois`">
        <span>{{ label }}</span><ChevronDown aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="calendar-period-picker" :side-offset="6" :collision-padding="8" align="center">
        <div class="period-year">
          <button type="button" class="period-year-btn" aria-label="Année précédente" @click="year--"><ChevronLeft aria-hidden="true" /></button>
          <strong aria-live="polite">{{ year }}</strong>
          <button type="button" class="period-year-btn" aria-label="Année suivante" @click="year++"><ChevronRight aria-hidden="true" /></button>
        </div>
        <div class="period-months" role="group" :aria-label="`Mois de ${year}`">
          <button
            v-for="(name, index) in MONTHS"
            :key="name"
            type="button"
            class="period-month"
            :class="{ selected: isSelected(index), current: isCurrent(index) }"
            :aria-pressed="isSelected(index)"
            @click="choose(index)"
          >{{ name }}</button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue';

const props = defineProps<{ modelValue: Date; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: Date] }>();

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const open = ref(false);
const year = ref(props.modelValue.getFullYear());
const today = new Date();

// A chaque ouverture, l'annee repart de la periode affichee.
watch(open, value => { if (value) year.value = props.modelValue.getFullYear(); });

function isSelected(month: number): boolean {
  return props.modelValue.getFullYear() === year.value && props.modelValue.getMonth() === month;
}
function isCurrent(month: number): boolean {
  return today.getFullYear() === year.value && today.getMonth() === month;
}
function choose(month: number): void {
  emit('update:modelValue', new Date(year.value, month, 1));
  open.value = false;
}
</script>

<style scoped lang="scss">
.period-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 9.5rem;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-weight: 700;
  text-transform: capitalize;
  white-space: nowrap;
  cursor: pointer;
}
.period-trigger:hover { background: var(--surface-hover); }
.period-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.period-trigger svg { width: 15px; height: 15px; color: var(--muted); }

</style>

<!-- Le panneau est teleporte dans <body> : ses regles ne peuvent pas etre scopees. -->
<style lang="scss">
.calendar-period-picker {
  z-index: var(--z-popover);
  width: 248px;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  outline: none;
}
.calendar-period-picker .period-year { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.calendar-period-picker .period-year strong { color: var(--text); }
.calendar-period-picker .period-year-btn, .calendar-period-picker .period-month {
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.calendar-period-picker .period-year-btn { display: grid; place-items: center; width: 32px; height: 32px; }
.calendar-period-picker .period-year-btn svg { width: 16px; height: 16px; }
.calendar-period-picker .period-months { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.calendar-period-picker .period-month { min-height: 36px; font-size: var(--fs-sm); }
.calendar-period-picker .period-year-btn:hover, .calendar-period-picker .period-month:hover { background: var(--surface-hover); }
.calendar-period-picker .period-month.current { color: var(--accent); font-weight: 700; }
.calendar-period-picker .period-month.selected { background: var(--accent); color: var(--on-accent); font-weight: 700; }
.calendar-period-picker .period-year-btn:focus-visible, .calendar-period-picker .period-month:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
