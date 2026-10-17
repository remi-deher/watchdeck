<template>
  <!-- Carte « Parcours » : l'état en une phrase (sur-titre, titre, sous-titre), ses
       pastilles (`badges`), puis le détail du parcours (emplacement par défaut). -->
  <section class="journey-card" :aria-labelledby="titleId">
    <div class="journey-head">
      <div class="journey-heading">
        <span class="journey-eyebrow">{{ eyebrow }}</span>
        <h2 :id="titleId" class="journey-title">{{ title }}</h2>
        <p v-if="subtitle" class="journey-subtitle">{{ subtitle }}</p>
      </div>
      <div class="journey-badges"><slot name="badges" /></div>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ titleId: string; eyebrow: string; title: string; subtitle?: string }>(), { subtitle: '' });
</script>

<style scoped lang="scss">
.journey-card {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: var(--space-5) 28px;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.journey-head {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3) var(--space-4);
}
.journey-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.journey-eyebrow {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.journey-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  line-height: 1.2;
}
/* Les remarques du détail reprennent le style du sous-titre. */
.journey-subtitle,
:slotted(.journey-subtitle) {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-md);
}
.journey-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

/* Téléphone (conteneur de l'onglet Demandes) : carte plus serrée. */
@container demandes (max-width: 560px) {
  .journey-card {
    gap: 14px;
    padding: 18px;
  }
  .journey-title {
    font-size: var(--fs-xl);
  }
  /* Comme la maquette mobile : seule la pastille de statut, en haut à droite. */
  .journey-badges {
    position: absolute;
    top: -3px;
    right: 0;
  }
  .journey-eyebrow {
    padding-right: 110px;
  }
}
</style>
