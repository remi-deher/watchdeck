<template>
  <!-- Cadre des fiches qui s'ouvrent dans la feuille (session, torrent, utilisateur...) :
       le meme en surface et en pleine page, pour qu'un lien direct montre exactement ce
       que montrait la feuille. La feuille fournit deja la poignee et la croix. -->
  <article class="sheet-page" :class="{ 'is-standalone': !enSurface }" :aria-busy="loading || undefined">
    <header class="sheet-page__head">
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
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useMediaOverlay } from '@/composables/useMediaOverlay';

withDefaults(defineProps<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
}>(), { eyebrow: '', subtitle: '', loading: false, error: '' });

/* Posee sur une page, la fiche est dans la feuille ; ouverte par son adresse, elle
   occupe la page et prend ses marges. */
const { actif: enSurface } = useMediaOverlay();
</script>

<style scoped>
.sheet-page{display:grid;gap:var(--space-4);padding:8px max(18px,var(--safe-right)) max(24px,var(--safe-bottom)) max(18px,var(--safe-left))}
.sheet-page.is-standalone{width:min(980px,100%);margin:0 auto;padding-top:var(--space-4)}
.sheet-page__head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3);padding-right:44px}
.sheet-page.is-standalone .sheet-page__head{padding-right:0}
.sheet-page__titles{display:grid;gap:4px;min-width:0}
.sheet-page__eyebrow{color:var(--accent);font-size:var(--fs-xs);font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.sheet-page__title{margin:0;overflow-wrap:anywhere;font-size:var(--fs-xl);line-height:1.2}
.sheet-page__subtitle{margin:0;color:var(--muted);font-size:var(--fs-sm)}
.sheet-page__actions{display:flex;flex-wrap:wrap;gap:var(--space-1);flex:none}
.sheet-page__body{display:grid;gap:var(--space-4);min-width:0}
.sheet-page__footer{position:sticky;bottom:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin:0 calc(-1 * max(18px,var(--safe-left)));padding:var(--space-3) max(18px,var(--safe-right)) max(var(--space-3),var(--safe-bottom)) max(18px,var(--safe-left));border-top:1px solid var(--border);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px)}
@media(max-width:620px){.sheet-page__head{flex-direction:column}.sheet-page__actions{align-self:stretch}}
</style>
