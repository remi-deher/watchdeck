<template>
  <!-- Gabarit « Configurer » : repond a « comment je veux que ca marche ? ».
         1. des sections par intention, avec un sommaire pour y aller ;
         2. chaque reglage dit son effet (bloc ConfigureField) ;
         3. un enregistrement global : la barre Enregistrer / Annuler apparait des qu'une
            section est modifiee, les sections modifiees se signalent, et quitter la page
            sans enregistrer demande confirmation ;
         4. le test de connexion a cote des champs dont il depend (ConfigureTest) ;
         5. les ressources branchees, gerees sans quitter la page (ResourceList).
       La page fournit ses sections (`sections`) et leur contenu (emplacements
       `section-<cle>`), et dit si elle a des modifications (`dirty`). -->
  <div class="configure" :class="{ 'has-toc': sections.length > 2 }">
    <nav v-if="sections.length > 2" class="configure__toc" aria-label="Sommaire des réglages">
      <a v-for="section in sections" :key="section.key" :href="`#configure-${section.key}`" class="configure__toc-link" @click.prevent="goTo(section.key)">
        {{ section.title }}<span v-if="section.dirty" class="configure__dirty">modifié</span>
      </a>
    </nav>

    <div class="configure__sections">
      <section v-for="section in sections" :id="`configure-${section.key}`" :key="section.key" class="configure__section" :class="{ 'is-dirty': section.dirty }" :aria-labelledby="`configure-${section.key}-title`">
        <header class="configure__section-head">
          <div>
            <h2 :id="`configure-${section.key}-title`">{{ section.title }}</h2>
            <p v-if="section.description">{{ section.description }}</p>
          </div>
          <span v-if="section.dirty" class="configure__dirty">Non enregistré</span>
        </header>
        <div class="configure__body"><slot :name="`section-${section.key}`" /></div>
      </section>
    </div>

    <FormSaveBar :dirty="dirty" :saving="saving" cancelable @save="emit('save')" @cancel="emit('cancel')" />
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import ConfirmModal from '@/components/ConfirmModal.vue';
import FormSaveBar from '@/components/ui/FormSaveBar.vue';
import { useConfirm } from '@/composables/useConfirm';
import type { ConfigureSection } from './configure/types';

export type { ConfigureResource, ConfigureSection, ConfigureTestResult, ResourceTone } from './configure/types';

const props = withDefaults(
  defineProps<{
    sections: ConfigureSection[];
    /** Des modifications ne sont pas enregistrees. */
    dirty?: boolean;
    saving?: boolean;
  }>(),
  { dirty: false, saving: false },
);
const emit = defineEmits<{ save: []; cancel: [] }>();

function goTo(key: string): void {
  document.getElementById(`configure-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
@use '@/styles/foundations/breakpoints' as bp;

.configure { display: grid; gap: var(--space-4); min-width: 0; padding-bottom: 80px; }
.configure.has-toc { grid-template-columns: 12rem minmax(0, 1fr); align-items: start; }
.configure__toc { position: sticky; top: var(--space-4); display: grid; gap: 2px; }
.configure__toc-link { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 6px var(--space-2); border-radius: var(--radius-sm); color: var(--muted); font-size: var(--fs-sm); text-decoration: none; }
.configure__toc-link:hover { background: var(--surface-2); color: var(--text); }
.configure__sections { display: grid; gap: var(--space-4); min-width: 0; }
.configure__section { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); scroll-margin-top: var(--space-6); }
.configure__section.is-dirty { border-color: color-mix(in srgb, var(--amber) 55%, var(--border)); }
.configure__section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.configure__section-head h2 { margin: 0; font-size: var(--fs-md); }
.configure__section-head p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-sm); }
.configure__body { display: grid; gap: var(--space-4); }
.configure__dirty { flex: none; padding: 1px 7px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--amber) 16%, var(--surface)); color: var(--amber-text); font-size: var(--fs-xs); font-weight: 600; }

@include bp.until(desktop) {
  .configure.has-toc { grid-template-columns: minmax(0, 1fr); }
  .configure__toc { position: static; display: flex; overflow-x: auto; scrollbar-width: none; }
  .configure__toc-link { flex: none; }
}
</style>
