<template>
  <div class="app-subnav" :class="{ 'app-subnav--scrolled': scrolled, 'app-subnav--overflowing': overflowing }">
    <!-- Deux variantes, un seul composant, parce que le besoin est le même et que la
         différence est purement sémantique :
         · `links`  → chaque entrée change d'URL. C'est une navigation : `<nav>` +
           `aria-current`, chaque lien tabulable, et surtout pas `role="tab"` — un
           onglet APG ne navigue pas, il révèle un panneau déjà présent.
         · `tabs`   → chaque entrée révèle un panneau de la même page. C'est le pattern
           Tabs APG : `role="tablist"`, tabindex mobile et flèches directionnelles. -->
    <component
      :is="variant === 'links' ? 'nav' : 'div'"
      ref="scroller"
      class="app-subnav__scroller"
      :role="variant === 'tabs' ? 'tablist' : undefined"
      :aria-label="ariaLabel"
      @keydown="onKeydown"
      @scroll="onScroll"
    >
      <template v-for="(item, index) in items" :key="item.key">
        <span
          v-if="index > 0 && item.group && item.group !== items[index - 1].group"
          class="app-subnav__separator"
          aria-hidden="true"
        />

        <RouterLink
          v-if="variant === 'links'"
          :ref="(el) => setItemRef(el, index)"
          class="app-subnav__item"
          :to="item.to!"
          :aria-current="item.key === active ? 'page' : undefined"
        >
          <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <small v-if="item.count != null">{{ item.count }}</small>
        </RouterLink>

        <button
          v-else
          :ref="(el) => setItemRef(el, index)"
          type="button"
          role="tab"
          class="app-subnav__item"
          :aria-selected="item.key === active"
          :tabindex="item.key === active ? 0 : -1"
          @click="$emit('update:active', item.key)"
        >
          <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <small v-if="item.count != null">{{ item.count }}</small>
        </button>
      </template>
    </component>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { RouterLink } from 'vue-router';

export interface SubnavItem {
  key: string;
  label: string;
  /** Requis en variante `links` ; ignoré en variante `tabs`. */
  to?: string | Record<string, any>;
  icon?: any;
  count?: number | string | null;
  /** Change de valeur pour insérer un séparateur visuel avant l'entrée. */
  group?: string;
}

const props = withDefaults(
  defineProps<{
    items: SubnavItem[];
    active?: string;
    ariaLabel?: string;
    variant?: 'links' | 'tabs';
  }>(),
  { active: '', ariaLabel: 'Sections', variant: 'links' }
);

const emit = defineEmits<{ (e: 'update:active', value: string): void }>();

const scroller = ref<HTMLElement | ComponentPublicInstance | null>(null);
const itemRefs = ref<HTMLElement[]>([]);
const scrolled = ref(false);
/* Le degrade de droite n'a de sens que s'il reste vraiment des sections a atteindre.
   Affiche en permanence, il grisait le bord de la derniere entree alors que toutes
   tenaient a l'ecran -- exactement le cas des quatre sections d'Explorer sur un
   telephone de 390px. */
const overflowing = ref(false);

function setItemRef(el: Element | ComponentPublicInstance | null, index: number): void {
  const node = (el as ComponentPublicInstance)?.$el ?? el;
  if (node instanceof HTMLElement) itemRefs.value[index] = node;
}

function scrollerEl(): HTMLElement | null {
  const node = (scroller.value as ComponentPublicInstance)?.$el ?? scroller.value;
  return node instanceof HTMLElement ? node : null;
}

function onScroll(): void {
  scrolled.value = (scrollerEl()?.scrollLeft ?? 0) > 2;
}

function measureOverflow(): void {
  const el = scrollerEl();
  overflowing.value = el ? el.scrollWidth > el.clientWidth + 1 : false;
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  measureOverflow();
  const el = scrollerEl();
  if (typeof ResizeObserver !== 'undefined' && el) {
    // La largeur disponible change avec la fenetre, et le nombre de sections avec la
    // destination : les deux passent par la taille de la boite ou de son contenu.
    resizeObserver = new ResizeObserver(() => measureOverflow());
    resizeObserver.observe(el);
    for (const child of Array.from(el.children)) resizeObserver.observe(child);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
watch(() => props.items.length, () => void nextTick(measureOverflow));

/**
 * Flèches, Origine et Fin, comme l'exige le pattern Tabs.
 *
 * En variante `links` on ne fait rien : la liste de liens se parcourt à la tabulation,
 * et intercepter les flèches y retirerait à l'utilisateur le défilement de la page.
 */
function onKeydown(event: KeyboardEvent): void {
  if (props.variant !== 'tabs') return;
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const current = props.items.findIndex((item) => item.key === props.active);
  const last = props.items.length - 1;
  let next = current;
  if (event.key === 'ArrowRight') next = current >= last ? 0 : current + 1;
  else if (event.key === 'ArrowLeft') next = current <= 0 ? last : current - 1;
  else if (event.key === 'Home') next = 0;
  else next = last;
  if (next < 0 || !props.items[next]) return;
  event.preventDefault();
  emit('update:active', props.items[next].key);
  nextTick(() => itemRefs.value[next]?.focus());
}

// La section active peut être hors du champ visible sur un écran étroit : sans ce
// recentrage, l'utilisateur ne voit pas où il se trouve après une navigation.
watch(
  () => props.active,
  async () => {
    await nextTick();
    const index = props.items.findIndex((item) => item.key === props.active);
    const target = itemRefs.value[index];
    // jsdom n'implemente pas scrollIntoView, et le recentrage n'est de toute facon
    // qu'un confort : son absence ne doit jamais faire echouer le rendu.
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
);
</script>

<style scoped lang="scss">
.app-subnav {
  position: relative;
  min-width: 0;
  /* Le dégradé signale qu'il reste des sections à droite. Il est purement décoratif :
     le contenu masqué reste atteignable au clavier comme au doigt. */
  &::after {
    content: '';
    opacity: 0;
    transition: opacity .15s ease;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 24px;
    background: linear-gradient(to right, transparent, var(--bg));
    pointer-events: none;
  }
  &.app-subnav--overflowing::after { opacity: 1; }
}

/* Le cadre se fait le plus discret possible : il n'a qu'a rassembler les sections, pas
   a se presenter comme un objet a part. Reglages serres (2px de gouttiere, coins de
   8px au lieu de 12) parce que la hauteur, elle, est fixee par la cible tactile de
   44px des items et ne peut pas descendre. */
.app-subnav__scroller {
  display: flex;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  padding: 2px;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
}
.app-subnav__scroller::-webkit-scrollbar { display: none; }

.app-subnav__item {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 10px;
  border: 0;
  /* Un cran sous le rayon du cadre : a rayon egal, la pastille active semblait deborder
     dans les coins. */
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 650;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  scroll-snap-align: start;
}
.app-subnav__item:hover { color: var(--text); background: rgba(255, 255, 255, .04); }
.app-subnav__item[aria-current='page'],
.app-subnav__item[aria-selected='true'] {
  color: var(--text);
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--border);
}
.app-subnav__item svg { flex: none; width: 15px; height: 15px; }
.app-subnav__item[aria-current='page'] svg,
.app-subnav__item[aria-selected='true'] svg { color: var(--accent); }
.app-subnav__item small {
  display: grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-size: var(--fs-xs);
}

.app-subnav__separator {
  flex: none;
  width: 1px;
  align-self: stretch;
  margin: 6px 2px;
  background: var(--border);
}
</style>
