import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue';

/**
 * Ce que la page Reglages confie a un panneau qui se declare en sections (gabarit
 * Configurer) : la recherche de la barre du haut, l'etat de l'enregistrement global et ses
 * deux gestes. Le panneau pose ces liens sur son `ConfigureTemplate` (`v-bind="page.bind"`),
 * la page garde la barre, l'action de la capsule et la garde de sortie.
 */
export interface SettingsPageState {
  query: Ref<string>;
  dirty: ComputedRef<boolean>;
  saving: Ref<boolean>;
  save: () => void;
  cancel: () => void;
}

const KEY: InjectionKey<SettingsPageState> = Symbol('settings-page');

export function provideSettingsPage(state: SettingsPageState): void {
  provide(KEY, state);
}

export function useSettingsPage() {
  const state = inject(KEY);
  if (!state) throw new Error('useSettingsPage : a utiliser sous la page Reglages.');
  return {
    bind: computed(() => ({ query: state.query.value, dirty: state.dirty.value, saving: state.saving.value })),
    save: state.save,
    cancel: state.cancel,
  };
}
