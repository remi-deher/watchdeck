<template>
  <section v-if="items.length" class="drawer-section cast-section">
    <HorizontalRail
      title="Casting"
      heading-tag="h3"
      variant="cast"
    >
      <RouterLink
        v-for="person in items"
        :key="person.tmdb_id"
        :to="`/discover/person/${person.tmdb_id}`"
        class="cast-card"
        :aria-label="`Voir la fiche de ${person.name}`"
      >
        <img v-if="person.profile_url" :src="person.profile_url" :alt="`Portrait de ${person.name}`" loading="lazy" decoding="async" sizes="(max-width: 767px) 118px, 145px">
        <span v-else class="cast-placeholder" aria-hidden="true"><UserRound /></span>
        <strong>{{ person.name }}</strong>
        <small v-if="person.character">{{ person.character }}</small>
      </RouterLink>
    </HorizontalRail>
  </section>
</template>

<script setup lang="ts">
import { UserRound } from '@lucide/vue';
import HorizontalRail from '@/components/ui/HorizontalRail.vue';

export interface CastPerson {
  tmdb_id: number | string;
  name: string;
  character?: string;
  profile_url?: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    items?: CastPerson[];
  }>(),
  {
    items: () => [],
  }
);
</script>

<style scoped lang="scss">
.cast-card {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 5px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.cast-card img,
.cast-placeholder {
  width: 100%;
  aspect-ratio: 2 / 3;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  object-fit: cover;
  transition: transform .2s ease, border-color .2s ease;
}
.cast-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
}
.cast-placeholder svg {
  width: 38%;
  height: 38%;
}
.cast-card:hover img,
.cast-card:hover .cast-placeholder,
.cast-card:focus-visible img,
.cast-card:focus-visible .cast-placeholder {
  border-color: var(--accent);
  transform: translateY(-3px);
}
.cast-card strong {
  overflow: hidden;
  font-size: var(--fs-sm);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cast-card small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
@media (pointer: coarse) { .cast-card:hover img, .cast-card:hover .cast-placeholder { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cast-card img, .cast-placeholder { transition: none; } }
</style>
