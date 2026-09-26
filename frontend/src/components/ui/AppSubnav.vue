<template>
  <div ref="racine" class="app-subnav" :class="{ 'app-subnav--scrolled': scrolled, 'app-subnav--overflowing': overflowing, 'app-subnav--more': more }">
    <!-- Deux variantes, un seul composant, parce que le besoin est le même et que la
         différence est purement sémantique :
         · `links`  → chaque entrée change d'URL. C'est une navigation : `<nav>` +
           `aria-current`, chaque lien tabulable, et surtout pas `role="tab"` — un
           onglet APG ne navigue pas, il révèle un panneau déjà présent.
         · `tabs`   → chaque entrée révèle un panneau de la même page. C'est le pattern
           Tabs APG : `role="tablist"`, tabindex mobile et flèches directionnelles. -->
    <!-- Liens : `NavigationMenu` de Reka UI. Il porte le `<nav>` nomme, `aria-current` sur
         la section courante et le deplacement aux fleches d'un lien a l'autre, que la
         version maison n'offrait pas (seule la tabulation, lien par lien). -->
    <NavigationMenuRoot
      v-if="variant === 'links'"
      class="app-subnav__root"
      :aria-label="ariaLabel"
      orientation="horizontal"
    >
      <NavigationMenuList class="app-subnav__scroller" @scroll="onScroll">
        <template v-for="(item, index) in items" :key="item.key">
          <li v-if="separe(index)" class="app-subnav__separator" role="none" aria-hidden="true" />
          <NavigationMenuItem :value="item.key" class="app-subnav__entry">
            <!-- `RouterLink` en mode `custom` ne fournit que l'adresse et la navigation ;
                 c'est le lien de Reka qui rend l'element et porte seul `aria-current`.
                 Imbriques autrement, RouterLink effacait l'attribut des qu'on n'etait
                 pas exactement a son adresse (Accueil actif sur /discover/explore). -->
            <RouterLink v-slot="{ href, navigate }" :to="item.to!" custom>
              <NavigationMenuLink
                :ref="(el) => setItemRef(el, index)"
                class="app-subnav__item"
                :href="href"
                :active="item.key === active"
                @click="navigate"
              >
                <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
                <span>{{ item.label }}</span>
                <small v-if="item.count != null">{{ item.count }}</small>
              </NavigationMenuLink>
            </RouterLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenuRoot>
    <!-- Onglets : Reka UI porte `role="tablist"`/`tab`, le tabindex mobile et les fleches,
         Origine et Fin du pattern Tabs -- une centaine de lignes de moins ici. -->
    <TabsRoot v-else :model-value="active" @update:model-value="choisir">
      <TabsList ref="scroller" class="app-subnav__scroller" :aria-label="ariaLabel" @scroll="onScroll">
        <template v-for="(item, index) in items" :key="item.key">
          <span v-if="separe(index)" class="app-subnav__separator" aria-hidden="true" />
          <TabsTrigger :ref="(el) => setItemRef(el, index)" class="app-subnav__item" :value="item.key">
            <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
            <small v-if="item.count != null">{{ item.count }}</small>
          </TabsTrigger>
        </template>
      </TabsList>
    </TabsRoot>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { RouterLink } from 'vue-router';
import { NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuRoot, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';

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
/* Seul un vrai changement d'onglet remonte : Reka peut signaler une valeur vide (montage,
   liste d'onglets qui change), que la palette de commandes prenait pour un perimetre. */
function choisir(key: string | number | undefined): void {
  if (key === undefined || key === null || key === '' || String(key) === props.active) return;
  emit('update:active', String(key));
}

const scroller = ref<HTMLElement | ComponentPublicInstance | null>(null);
const itemRefs = ref<HTMLElement[]>([]);
const scrolled = ref(false);
/* Le degrade de droite n'a de sens que s'il reste vraiment des sections a atteindre.
   Affiche en permanence, il grisait le bord de la derniere entree alors que toutes
   tenaient a l'ecran -- exactement le cas des quatre sections d'Explorer sur un
   telephone de 390px. */
const overflowing = ref(false);
/* Il reste des sections a droite : faux une fois arrive au bout, pour que la derniere
   entree ne reste pas estompee. */
const more = ref(false);

function separe(index: number): boolean {
  const item = props.items[index];
  return index > 0 && Boolean(item.group) && item.group !== props.items[index - 1].group;
}
function setItemRef(el: Element | ComponentPublicInstance | null, index: number): void {
  const node = (el as ComponentPublicInstance)?.$el ?? el;
  if (node instanceof HTMLElement) itemRefs.value[index] = node;
}

/* La rangee qui defile : la liste de `NavigationMenu` (liens) ou de `Tabs` (onglets).
   Cherchee par sa classe plutot que par une ref de composant : `NavigationMenuList`
   enveloppe sa liste dans un conteneur, et la ref designerait ce dernier. */
const racine = ref<HTMLElement | null>(null);
function scrollerEl(): HTMLElement | null {
  const node = (scroller.value as ComponentPublicInstance)?.$el ?? scroller.value;
  if (node instanceof HTMLElement && node.classList.contains('app-subnav__scroller')) return node;
  return racine.value?.querySelector<HTMLElement>('.app-subnav__scroller') ?? null;
}

function measureEdges(): void {
  const el = scrollerEl();
  scrolled.value = (el?.scrollLeft ?? 0) > 2;
  more.value = el ? el.scrollLeft + el.clientWidth < el.scrollWidth - 2 : false;
}

function onScroll(): void {
  measureEdges();
}

function measureOverflow(): void {
  const el = scrollerEl();
  overflowing.value = el ? el.scrollWidth > el.clientWidth + 1 : false;
  measureEdges();
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
  /* La capsule est portee par la racine, pas par la rangee qui defile : la rangee peut
     ainsi estomper ses bords par un masque sans estomper le contour avec. Les anciens
     degrades etaient des calques poses PAR-DESSUS les onglets, dans la couleur de fond :
     ils recouvraient la pastille active d'un voile opaque des qu'elle touchait un bord. */
  --subnav-fade-left: 0px;
  --subnav-fade-right: 0px;
  position: relative;
  /* Centree partout, a la largeur de ses onglets : meme axe que la recherche, qu'elle
     soit dans la rangee collante, dans une fiche ou dans une fenetre. `margin-inline:
     auto` centre aussi bien dans un bloc que dans une colonne flex. */
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  margin-inline: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  transition: box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
  &.app-subnav--scrolled { --subnav-fade-left: 28px; }
  &.app-subnav--more { --subnav-fade-right: 28px; }
}

/* Le cadre se fait le plus discret possible : il n'a qu'a rassembler les sections, pas
   a se presenter comme un objet a part. Reglages serres (2px de gouttiere, coins de
   8px au lieu de 12) parce que la hauteur, elle, est fixee par la cible tactile de
   44px des items et ne peut pas descendre. */
/* `NavigationMenu` rend un `<nav>`, puis un conteneur, puis la liste : les deux premiers
   ne doivent pas s'elargir a leur contenu, sinon la liste ne defilerait plus. */
.app-subnav__root,
.app-subnav__root > div {
  min-width: 0;
  max-width: 100%;
}
/* La liste des liens est rendue a l'interieur de `NavigationMenuList` : elle ne porte
   pas l'attribut de portee du composant, d'ou `:deep()` sur toutes les regles de la
   rangee (sans quoi les liens s'empilaient a la verticale). */
:deep(ul.app-subnav__scroller) {
  margin: 0;
  list-style: none;
}
.app-subnav__entry {
  display: flex;
  flex: none;
}
/* Meme famille que le champ de recherche : une capsule posee, bord fin, fond de
   surface. Elle flotte au-dessus du contenu quand la rangee colle en haut. */
:deep(.app-subnav__scroller) {
  display: flex;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  overflow-x: auto;
  border: 0;
  /* Le contenu s'estompe lui-meme vers le bord ou il reste des sections. */
  -webkit-mask-image: linear-gradient(to right, transparent, var(--text) var(--subnav-fade-left), var(--text) calc(100% - var(--subnav-fade-right)), transparent);
  mask-image: linear-gradient(to right, transparent, var(--text) var(--subnav-fade-left), var(--text) calc(100% - var(--subnav-fade-right)), transparent);
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
}
:deep(.app-subnav__scroller)::-webkit-scrollbar { display: none; }

.app-subnav__item {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 14px;
  border: 0;
  /* Rayon de la capsule moins son coussin : a rayon egal, la pastille semblait deborder. */
  border-radius: calc(var(--radius-lg) - 4px);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 650;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  scroll-snap-align: start;
  transition: color var(--motion-duration-instant) var(--motion-ease-standard),
    background-color var(--motion-duration-instant) var(--motion-ease-standard);
}
.app-subnav__item:hover { color: var(--text); background: rgb(var(--ink) / .05); }
.app-subnav__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
/* L'onglet actif : une pastille teintee d'accent dans la capsule, le meme langage que
   le bouton « Filtres » de la recherche. */
.app-subnav__item[aria-current='page'],
.app-subnav__item[aria-selected='true'] {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  font-weight: 700;
}
@media (min-width: 768px) {
  /* A la hauteur du champ de recherche (46px) : 36 + 2x4 de coussin + 2x1 de bord. */
  .app-subnav__item { min-height: 36px; font-size: 15px; }
  .app-subnav .app-subnav__item svg { width: 16px; height: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .app-subnav__item { transition: none; }
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
