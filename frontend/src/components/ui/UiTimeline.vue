<template>
  <!-- Composant commun de frise chronologique (UiTimeline) :
       S'adapte à de multiples contextes (sorties, historiques, suivi de sessions, étapes d'activité).
       Supporte deux orientations (verticale ou horizontale avec défilement fluide), trois variantes
       (default, compact, cards), le ton par élément (accent, success, warning, danger, info, muted),
       des marqueurs avec icône ou pastille, ainsi que de riches emplacements personnalisables. -->
  <div
    class="ui-timeline"
    :class="[
      `is-${orientation}`,
      `variant-${variant}`,
      { 'is-interactive': interactive || hasSelectListener, 'is-reverse': reverse },
    ]"
    :role="interactive ? 'region' : undefined"
    :aria-label="ariaLabel || 'Frise chronologique'"
  >
    <div v-if="!items.length" class="ui-timeline__empty">
      <slot name="empty">
        <p class="ui-timeline__empty-text">{{ emptyMessage }}</p>
      </slot>
    </div>

    <ol v-else class="ui-timeline__track" role="list">
      <li
        v-for="(item, index) in renderedItems"
        :key="itemKey(item, index)"
        class="ui-timeline__item"
        :class="[
          itemToneClass(item),
          {
            'is-selected': isSelected(item, index),
            'is-active': item.active,
            'is-interactive': isItemInteractive(item),
            'has-image': !!item.image,
          },
        ]"
        :style="itemStyle(item)"
      >
        <!-- Ligne de liaison -->
        <span class="ui-timeline__connector" aria-hidden="true" />

        <!-- Marqueur (point, icône, badge ou image) -->
        <div class="ui-timeline__marker-wrap">
          <slot name="marker" :item="item" :index="index" :selected="isSelected(item, index)">
            <span class="ui-timeline__marker" :class="{ 'has-icon': !!item.icon }">
              <component :is="item.icon" v-if="item.icon" class="ui-timeline__icon" aria-hidden="true" />
              <span v-else class="ui-timeline__dot" />
            </span>
          </slot>
        </div>

        <!-- Corps de l'événement -->
        <component
          :is="itemElement(item)"
          class="ui-timeline__content-wrap"
          v-bind="itemAttributes(item, index)"
          @click="onItemClick(item, index, $event)"
          @keydown.enter="onItemSelect(item, index)"
          @keydown.space.prevent="onItemSelect(item, index)"
        >
          <slot name="item" :item="item" :index="index" :selected="isSelected(item, index)">
            <!-- En-tête : Heure / Date et Tag -->
            <div v-if="item.time || item.badge || $slots.time" class="ui-timeline__meta">
              <slot name="time" :item="item" :index="index">
                <time v-if="item.time" class="ui-timeline__time">{{ item.time }}</time>
              </slot>
              <span v-if="item.badge" class="ui-timeline__badge">{{ item.badge }}</span>
            </div>

            <!-- Image / Affiche miniature optionnelle -->
            <div v-if="item.image" class="ui-timeline__image">
              <img :src="item.image" :alt="item.title || ''" loading="lazy" decoding="async">
            </div>

            <!-- Titre et sous-titre / description -->
            <div class="ui-timeline__body">
              <slot name="title" :item="item" :index="index">
                <strong v-if="item.title" class="ui-timeline__title">{{ item.title }}</strong>
              </slot>

              <slot name="content" :item="item" :index="index">
                <p v-if="item.subtitle" class="ui-timeline__subtitle">
                  {{ item.subtitle }}
                </p>
                <p v-if="item.description" class="ui-timeline__description">
                  {{ item.description }}
                </p>
              </slot>
            </div>

            <!-- Emplacement additionnel droit / fin (actions, compléments) -->
            <div v-if="$slots.extra || item.extra" class="ui-timeline__extra">
              <slot name="extra" :item="item" :index="index">
                <span>{{ item.extra }}</span>
              </slot>
            </div>
          </slot>
        </component>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

export type TimelineTone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'neutral';
export type TimelineOrientation = 'vertical' | 'horizontal';
export type TimelineVariant = 'default' | 'compact' | 'cards';

export interface UiTimelineItem {
  key?: string | number;
  id?: string | number;
  /** Repère temporel (ex: "14:30", "Aujourd'hui", "25 Oct", "Sortie cinéma", ISO...) */
  time?: string;
  /** Titre principal */
  title?: string;
  /** Sous-titre ou description */
  subtitle?: string;
  description?: string;
  /** Ton / couleur : 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'neutral' */
  tone?: TimelineTone;
  /** Couleur personnalisée libre (code hex, rgb ou var CSS) */
  color?: string;
  /** Composant Lucide d'icône pour le marqueur */
  icon?: any;
  /** Image miniature (affiche, logo, photo) */
  image?: string;
  /** Badge d'état ou tag complémentaire */
  badge?: string;
  /** Élément actif ou en cours */
  active?: boolean;
  /** Navigation optionnelle (objet RouterLink ou string) */
  to?: any;
  /** Texte ou action d'extra */
  extra?: any;
  /** Données arbitraires pour les slots */
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items: UiTimelineItem[];
    orientation?: TimelineOrientation;
    variant?: TimelineVariant;
    interactive?: boolean;
    selectedKey?: string | number | null;
    reverse?: boolean;
    emptyMessage?: string;
    ariaLabel?: string;
  }>(),
  {
    orientation: 'vertical',
    variant: 'default',
    interactive: false,
    selectedKey: null,
    reverse: false,
    emptyMessage: 'Aucun événement',
    ariaLabel: undefined,
  },
);

const emit = defineEmits<{
  select: [item: UiTimelineItem, index: number];
  'click-item': [item: UiTimelineItem, index: number, event: MouseEvent];
}>();

const attrs = useAttrs();
const hasSelectListener = computed(() => !!attrs.onSelect || !!attrs['onClick-item']);

const renderedItems = computed(() => {
  if (!props.reverse) return props.items;
  return [...props.items].reverse();
});

function itemKey(item: UiTimelineItem, index: number): string | number {
  return item.key ?? item.id ?? index;
}

function isSelected(item: UiTimelineItem, index: number): boolean {
  if (props.selectedKey == null) return false;
  const key = item.key ?? item.id ?? index;
  return key === props.selectedKey;
}

function isItemInteractive(item: UiTimelineItem): boolean {
  return props.interactive || hasSelectListener.value || !!item.to;
}

function itemElement(item: UiTimelineItem): string {
  if (item.to) return 'RouterLink';
  if (isItemInteractive(item)) return 'div';
  return 'div';
}

function itemAttributes(item: UiTimelineItem, index: number) {
  if (item.to) {
    return { to: item.to };
  }
  if (isItemInteractive(item)) {
    return {
      role: 'button',
      tabindex: 0,
      'aria-pressed': isSelected(item, index),
    };
  }
  return {};
}

function itemToneClass(item: UiTimelineItem): string {
  const tone = item.tone || 'neutral';
  return `tone-${tone}`;
}

function itemStyle(item: UiTimelineItem) {
  if (item.color) {
    return { '--timeline-tone': item.color };
  }
  return {};
}

function onItemClick(item: UiTimelineItem, index: number, event: MouseEvent): void {
  emit('click-item', item, index, event);
  if (isItemInteractive(item)) {
    emit('select', item, index);
  }
}

function onItemSelect(item: UiTimelineItem, index: number): void {
  if (isItemInteractive(item)) {
    emit('select', item, index);
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.ui-timeline {
  --timeline-line-w: 2px;
  --timeline-line-color: var(--border);
  --timeline-dot-size: 10px;
  --timeline-icon-size: 28px;
  --timeline-gap: var(--space-4);
  --timeline-tone: var(--muted);

  position: relative;
  width: 100%;
}

/* Tons disponibles */
.tone-accent { --timeline-tone: var(--accent); }
.tone-success { --timeline-tone: var(--green); }
.tone-warning { --timeline-tone: var(--amber); }
.tone-danger { --timeline-tone: var(--red); }
.tone-info { --timeline-tone: var(--blue); }
.tone-muted { --timeline-tone: var(--muted); }
.tone-neutral { --timeline-tone: var(--border-hover, var(--muted)); }

.ui-timeline__empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--muted);
  font-size: var(--fs-sm);
}

.ui-timeline__track {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ==========================================================================
   ORIENTATION VERTICALE (défaut)
   ========================================================================== */
.ui-timeline.is-vertical {
  .ui-timeline__track {
    flex-direction: column;
    gap: var(--timeline-gap);
  }

  .ui-timeline__item {
    position: relative;
    display: grid;
    grid-template-columns: var(--timeline-icon-size) 1fr;
    column-gap: var(--space-3);
    align-items: flex-start;
  }

  /* Ligne de liaison verticale entre les marqueurs */
  .ui-timeline__connector {
    position: absolute;
    top: calc(var(--timeline-icon-size) + 4px);
    bottom: calc(-1 * var(--timeline-gap) - 4px);
    left: calc(var(--timeline-icon-size) / 2 - var(--timeline-line-w) / 2);
    width: var(--timeline-line-w);
    background: var(--timeline-line-color);
  }

  .ui-timeline__item:last-child .ui-timeline__connector {
    display: none;
  }
}

/* ==========================================================================
   ORIENTATION HORIZONTALE
   ========================================================================== */
.ui-timeline.is-horizontal {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  padding-bottom: var(--space-2);

  .ui-timeline__track {
    flex-direction: row;
    gap: var(--space-5);
    min-width: max-content;
    padding: var(--space-2) 0;
  }

  .ui-timeline__item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 140px;
    max-width: 220px;
  }

  /* Ligne de liaison horizontale */
  .ui-timeline__connector {
    position: absolute;
    top: calc(var(--timeline-icon-size) / 2 - var(--timeline-line-w) / 2);
    left: calc(var(--timeline-icon-size) + 6px);
    right: calc(-1 * var(--space-5) + 6px);
    height: var(--timeline-line-w);
    background: var(--timeline-line-color);
  }

  .ui-timeline__item:last-child .ui-timeline__connector {
    display: none;
  }
}

/* ==========================================================================
   MARQUEUR (point ou icône)
   ========================================================================== */
.ui-timeline__marker-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--timeline-icon-size);
  height: var(--timeline-icon-size);
  flex-shrink: 0;
  z-index: 1;
}

.ui-timeline__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--timeline-dot-size);
  height: var(--timeline-dot-size);
  border-radius: var(--radius-pill);
  background: var(--timeline-tone);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--timeline-tone) 20%, transparent);
  transition: transform var(--motion-duration-fast, 150ms) ease, box-shadow var(--motion-duration-fast, 150ms) ease;

  &.has-icon {
    width: var(--timeline-icon-size);
    height: var(--timeline-icon-size);
    background: color-mix(in srgb, var(--timeline-tone) 12%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--timeline-tone) 35%, var(--border));
    box-shadow: none;
    color: var(--timeline-tone);
  }
}

.ui-timeline__icon {
  width: 14px;
  height: 14px;
}

.ui-timeline__dot {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-pill);
  background: currentColor;
}

/* Élément actif : pulsation subtile du marqueur */
.ui-timeline__item.is-active .ui-timeline__marker {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timeline-tone) 35%, transparent);
}

/* ==========================================================================
   CORPS ET CONTENU
   ========================================================================== */
.ui-timeline__content-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  width: 100%;
  text-decoration: none;
  color: inherit;

  &[role='button'] {
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    transition: background-color var(--motion-duration-fast, 150ms) ease;

    &:hover {
      background: var(--surface-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  }
}

.ui-timeline__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.ui-timeline__time {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--timeline-tone);
  white-space: nowrap;
}

.ui-timeline__badge {
  font-size: var(--fs-xs);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
}

.ui-timeline__image {
  width: 44px;
  height: 64px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--surface-2);
  flex-shrink: 0;
  margin-top: var(--space-1);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.ui-timeline__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ui-timeline__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

.ui-timeline__subtitle,
.ui-timeline__description {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--muted);
  line-height: 1.4;
}
.ui-timeline__subtitle {
  font-weight: 500;
}

.ui-timeline__extra {
  font-size: var(--fs-xs);
  color: var(--muted);
  margin-top: var(--space-1);
}

/* ==========================================================================
   VARIANTES : COMPACT & CARDS
   ========================================================================== */

/* Compact : idéal en barre latérale, fiches ou encarts */
.ui-timeline.variant-compact {
  --timeline-icon-size: 20px;
  --timeline-gap: var(--space-2);

  .ui-timeline__marker.has-icon {
    width: 20px;
    height: 20px;

    .ui-timeline__icon {
      width: 11px;
      height: 11px;
    }
  }

  .ui-timeline__content-wrap {
    flex-direction: row;
    align-items: baseline;
    gap: var(--space-2);
  }

  .ui-timeline__title {
    font-size: var(--fs-xs);
  }

  .ui-timeline__description {
    font-size: var(--fs-xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* Cards : éléments structurés en cartes avec fond et bordure */
.ui-timeline.variant-cards {
  --timeline-gap: var(--space-3);

  .ui-timeline__content-wrap {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);

    &[role='button']:hover {
      background: var(--surface-hover);
      border-color: var(--border-hover, var(--border));
    }
  }

  .ui-timeline__item.is-selected .ui-timeline__content-wrap {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
}
</style>
