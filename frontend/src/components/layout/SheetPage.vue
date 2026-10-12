<template>
  <!-- Cadre des fiches qui s'ouvrent dans la feuille (session, torrent, utilisateur...) :
       le meme en surface et en pleine page, pour qu'un lien direct montre exactement ce
       que montrait la feuille. La feuille fournit la poignee ; on la ferme en la tirant, par Echap ou a cote. -->
  <article class="sheet-page" :class="{ 'is-standalone': !enSurface, 'is-headless': headless && !loading && !error }" :aria-busy="loading || undefined">
    <!-- `headless` : la fiche porte son propre en-tete (gabarit Fiche, avec son titre). Celui du
         cadre n'apparait que tant que le contenu charge ou echoue, faute de quoi la feuille
         n'aurait plus de titre. -->
    <!-- Fiche ouverte depuis une liste : precedent / suivant dans cette liste (j / k). Au bout de la
         liste le bouton reste actif pour le lecteur d'ecran (`aria-disabled`) : un bouton `disabled`
         perd le focus, ce que le dialogue de la feuille prend pour un appui a l'exterieur. -->
    <nav v-if="pager" class="sheet-page__pager" aria-label="Parcourir la liste">
      <UiButton size="sm" variant="ghost" icon-only title="Précédent (k)" aria-label="Précédent" :aria-disabled="pager.index <= 0" :class="{ 'is-edge': pager.index <= 0 }" @click="pager.index > 0 && emit('navigate', -1)"><ChevronLeft /></UiButton>
      <span aria-live="polite">{{ pager.index + 1 }} sur {{ pager.total }}</span>
      <UiButton size="sm" variant="ghost" icon-only title="Suivant (j)" aria-label="Suivant" :aria-disabled="pager.index >= pager.total - 1" :class="{ 'is-edge': pager.index >= pager.total - 1 }" @click="pager.index < pager.total - 1 && emit('navigate', 1)"><ChevronRight /></UiButton>
    </nav>

    <header v-if="!(headless && !loading && !error)" class="sheet-page__head">
      <div class="sheet-page__titles">
        <span v-if="eyebrow" class="sheet-page__eyebrow">{{ eyebrow }}</span>
        <h1 class="sheet-page__title">{{ title }}</h1>
        <p v-if="subtitle" class="sheet-page__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="sheet-page__actions"><slot name="actions" /></div>
    </header>

    <UiFeedback v-if="error" type="error" :message="error" />
    <UiFeedback v-else-if="loading" type="loading" message="Chargement…" />
    <div v-else class="sheet-page__body"><slot /></div>

    <footer v-if="$slots.footer && !loading && !error" class="sheet-page__footer"><slot name="footer" /></footer>
  </article>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';

withDefaults(defineProps<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  headless?: boolean;
  /** Position dans la liste d'origine ; absent, pas de barre. La page dit quoi faire sur `navigate` (voir `useSheetPager`). */
  pager?: { index: number; total: number } | null;
}>(), { eyebrow: '', subtitle: '', loading: false, error: '', headless: false, pager: null });
const emit = defineEmits<{ navigate: [direction: number] }>();

/* Posee sur une page, la fiche est dans la feuille ; ouverte par son adresse, elle
   occupe la page et prend ses marges. */
const { actif: enSurface } = useMediaOverlay();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.sheet-page{container:sheet/inline-size;display:grid;gap:var(--space-4);padding:8px max(18px,var(--safe-right)) max(24px,var(--safe-bottom)) max(18px,var(--safe-left))}
.sheet-page.is-standalone{width:min(980px,100%);margin:0 auto;padding-top:var(--space-4)}
.sheet-page__head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}
.sheet-page__titles{display:grid;gap:4px;min-width:0}
.sheet-page__eyebrow{color:var(--accent);font-size:var(--fs-xs);font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.sheet-page__title{margin:0;overflow-wrap:anywhere;font-size:var(--fs-xl);line-height:1.2}
.sheet-page__subtitle{margin:0;color:var(--muted);font-size:var(--fs-sm)}
.sheet-page__actions{display:flex;flex-wrap:wrap;gap:var(--space-1);flex:none}
.sheet-page__pager{display:flex;align-items:center;justify-content:flex-end;gap:var(--space-1);color:var(--muted);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.sheet-page__pager .is-edge{opacity:.4;cursor:default}
.sheet-page__body{display:grid;gap:var(--space-4);min-width:0}
.sheet-page__footer{position:sticky;bottom:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin:0 calc(-1 * max(18px,var(--safe-left)));padding:var(--space-3) max(18px,var(--safe-right)) max(var(--space-3),var(--safe-bottom)) max(18px,var(--safe-left));border-top:1px solid var(--border);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px)}
@include bp.until(phablet) {.sheet-page__head{flex-direction:column}.sheet-page__actions{align-self:stretch}}
</style>
