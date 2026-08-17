<template>
  <RouterLink
    class="discover-source-card"
    :to="to"
    :aria-label="`Découvrir ${source.name}`"
    :title="source.name"
  >
    <div
      class="logo-wrapper"
      :class="[`kind-${source.kind}`, { 'has-image': Boolean(source.logo_url && !imgError) }]"
      :style="fallbackStyle"
    >
      <img
        v-if="source.logo_url && !imgError"
        :src="logoUrl"
        :alt="source.name"
        :class="{ 'is-dark-logo': isDarkLogo, 'is-full-bleed': isProvider }"
        loading="lazy"
        decoding="async"
        @error="imgError = true"
      >
      <div v-else class="source-fallback-badge">
        <span class="source-fallback-initials">{{ initials }}</span>
        <span class="source-fallback-text">{{ source.name }}</span>
      </div>
    </div>
    <span v-if="!isDarkLogo" class="source-caption">{{ source.name }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { proxyUrl } from '../../utils/mediaImage';

export interface DiscoverSource {
  name: string;
  kind?: string;
  logo_url?: string;
  [key: string]: any;
}

const props = defineProps<{
  source: DiscoverSource;
  to: string | Record<string, any>;
}>();

const imgError = ref(false);

const logoUrl = computed(() => proxyUrl(props.source?.logo_url, {
  width: 192,
  quality: 88,
  forceProxy: true,
}) ?? undefined);

const isProvider = computed(() => props.source?.kind === 'provider');

const isDarkLogo = computed(() => {
  if (isProvider.value) return false;
  const name = (props.source?.name || '').toLowerCase();
  return ['a24', 'pixar', 'hbo', 'blumhouse', 'bbc', 'arte', 'france', 'sony', 'universal', 'paramount', 'ghibli', 'lionsgate', 'legendary', 'dreamworks', 'illumination', '20th', 'fox', 'amc', 'fx', 'columbia', 'warner', 'mgm', 'miramax'].some(k => name.includes(k));
});

const initials = computed(() => {
  const name = props.source?.name || '';
  const parts = name.split(/[\s+\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
});

const fallbackStyle = computed(() => {
  if (props.source?.logo_url && !imgError.value) return {};
  const name = props.source?.name || '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hues = [215, 265, 340, 28, 165, 195, 45];
  const h1 = hues[Math.abs(hash) % hues.length];
  const h2 = (h1 + 40) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h1}, 70%, 32%) 0%, hsl(${h2}, 80%, 16%) 100%)`,
    borderColor: `hsl(${h1}, 60%, 45%)`,
  };
});
</script>

<style scoped lang="scss">
.discover-source-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
  width: 100%;
  text-decoration: none;
  color: var(--text);
  user-select: none;
  transition: transform .2s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo-wrapper {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md, 12px);
  background: #131419;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}

/* Pour les plateformes SVOD (Netflix, Disney+, Prime Video, Canal+, etc.) : l'icone prend 100% de la place */
.logo-wrapper.kind-provider {
  padding: 0;
}

.logo-wrapper.kind-provider img.is-full-bleed {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Pour les studios et réseaux (A24, Pixar, HBO, Marvel, etc.) : logo centré et lisible sur fond sombre */
.logo-wrapper.kind-company,
.logo-wrapper.kind-network {
  padding: 12px;
  background: radial-gradient(circle at center, #1c1e26 0%, #101115 100%);
}

.logo-wrapper.kind-company img,
.logo-wrapper.kind-network img {
  display: block;
  max-width: 82%;
  max-height: 82%;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
}

/* Inversion des logos noirs/sombres pour les rendre blanc pur et ultra-lisibles */
.logo-wrapper img.is-dark-logo {
  filter: brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6));
}

.discover-source-card:hover,
.discover-source-card:focus-visible,
.discover-source-card:focus-within {
  z-index: 5;
}

.discover-source-card:hover .logo-wrapper,
.discover-source-card:focus-within .logo-wrapper {
  border-color: color-mix(in srgb, var(--accent) 80%, white);
  box-shadow: 0 10px 24px rgba(0, 0, 0, .55), 0 0 18px rgba(229, 160, 13, 0.25);
  transform: translateY(-3px) scale(1.03);
}

.discover-source-card:focus-visible .logo-wrapper {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 50%, transparent), 0 10px 24px rgba(0, 0, 0, .55), 0 0 18px color-mix(in srgb, var(--accent) 25%, transparent);
}

/* Fallback badge avec initiales lisibles */
.source-fallback-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  padding: 8px;
  text-align: center;
}

.source-fallback-initials {
  font-size: clamp(1.1rem, 2.2vw, 1.4rem);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #ffffff;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
  line-height: 1;
}

.source-fallback-text {
  font-size: var(--fs-xs, 11px);
  font-weight: 700;
  text-align: center;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.9);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.source-caption {
  font-size: var(--fs-xs, 12px);
  font-weight: 600;
  color: var(--muted);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  transition: color .15s ease;
}

.discover-source-card:hover .source-caption {
  color: var(--text);
}
</style>
