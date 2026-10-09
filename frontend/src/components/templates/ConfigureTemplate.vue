<template>
  <!-- Gabarit « Configurer » : repond a « comment je veux que ca marche ? ».
         1. des sections par intention, chacune une carte a en-tete (icone, titre, ce
            qu'elle regle) ; la recherche de la barre du haut retrouve une section (`query`) ;
         2. chaque reglage dit son effet (bloc ConfigureField) ;
         3. un enregistrement global : la barre Enregistrer / Annuler apparait des qu'une
            section est modifiee, les sections modifiees se signalent, et quitter la page
            sans enregistrer demande confirmation ;
         4. le test de connexion a cote des champs dont il depend (ConfigureTest) ;
         5. les ressources branchees, gerees sans quitter la page (ResourceList).
       La page fournit ses sections (`sections`) et leur contenu (emplacements
       `section-<cle>`), et dit si elle a des modifications (`dirty`). -->
  <div class="configure">
    <div class="configure__sections">
      <section v-for="section in shown" :id="`configure-${section.key}`" :key="section.key" class="configure__section" :class="{ 'is-dirty': section.dirty }" :aria-labelledby="`configure-${section.key}-title`">
        <header class="configure__section-head">
          <component :is="section.icon" v-if="section.icon" class="configure__icon" aria-hidden="true" />
          <div>
            <h2 :id="`configure-${section.key}-title`">{{ section.title }}</h2>
            <p v-if="section.description">{{ section.description }}</p>
          </div>
          <span v-if="section.dirty" class="configure__dirty">Non enregistré</span>
        </header>
        <div class="configure__body"><slot :name="`section-${section.key}`" /></div>
      </section>
      <UiEmptyState v-if="!shown.length" :icon="SearchX" title="Aucun réglage" :message="`Rien ne correspond à « ${query.trim()} ».`" compact />
    </div>

    <FormSaveBar :dirty="dirty" :saving="saving" cancelable @save="emit('save')" @cancel="emit('cancel')" />
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { SearchX } from '@lucide/vue';
import { onBeforeRouteLeave } from 'vue-router';
import ConfirmModal from '@/components/ConfirmModal.vue';
import FormSaveBar from '@/components/ui/FormSaveBar.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { useConfirm } from '@/composables/useConfirm';
import type { ConfigureSection } from './configure/types';

export type { ConfigureResource, ConfigureSection, ConfigureTestResult, ResourceTone } from './configure/types';

const props = withDefaults(
  defineProps<{
    sections: ConfigureSection[];
    /** Des modifications ne sont pas enregistrees. */
    dirty?: boolean;
    saving?: boolean;
    /** Recherche de la barre du haut : ne garde que les sections qui y repondent. */
    query?: string;
  }>(),
  { dirty: false, saving: false, query: '' },
);
const emit = defineEmits<{ save: []; cancel: [] }>();

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const shown = computed(() => {
  const needle = fold(props.query.trim());
  if (!needle) return props.sections;
  return props.sections.filter((section) => fold([section.title, section.description || '', ...(section.keywords || [])].join(' ')).includes(needle));
});

/* Quitter sans enregistrer : confirmation dans l'application, et avertissement du
   navigateur pour un rechargement ou une fermeture d'onglet. */
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
onBeforeRouteLeave(() => !props.dirty || askConfirm({ title: 'Quitter sans enregistrer ?', message: 'Des modifications ne sont pas enregistrées. Quitter cette page ?', confirmLabel: 'Quitter', danger: true }));
function warnUnsaved(event: BeforeUnloadEvent): void {
  if (!props.dirty) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', warnUnsaved));
onUnmounted(() => window.removeEventListener('beforeunload', warnUnsaved));
</script>

<style scoped lang="scss">
.configure { display: grid; gap: var(--space-4); min-width: 0; padding-bottom: 80px; }
.configure__sections { display: grid; gap: var(--space-4); min-width: 0; }
/* Une carte par section : l'en-tete, sur un fond a part, dit ce qu'elle regle ; les
   reglages suivent dessous. Le titre ne se confond plus avec les libelles des champs. */
.configure__section { display: grid; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); scroll-margin-top: var(--space-6); }
.configure__section.is-dirty { border-color: color-mix(in srgb, var(--amber) 55%, var(--border)); }
.configure__section-head { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); background: var(--surface-2); }
.configure__section-head > div { flex: 1 1 auto; min-width: 0; }
.configure__icon { flex: none; width: 20px; height: 20px; margin-top: 2px; color: var(--accent); }
.configure__section-head h2 { margin: 0; font-size: var(--fs-lg); font-weight: 700; }
.configure__section-head p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.configure__body { display: grid; gap: var(--space-4); padding: var(--space-4); }
.configure__dirty { flex: none; padding: 1px 7px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--amber) 16%, var(--surface)); color: var(--amber-text); font-size: var(--fs-xs); font-weight: 600; }
</style>
