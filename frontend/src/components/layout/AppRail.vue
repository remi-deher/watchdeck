<template>
  <nav class="app-rail" :data-density="density" :data-space="space" :aria-label="space === 'admin' ? 'Navigation de l’administration' : 'Navigation principale'">
    <div class="app-rail__header">
      <!-- Dans l'Administration, la marque cède la place au retour : cette barre remplace
           le rail de l'application, et c'est par là qu'on y revient. -->
      <RouterLink
        v-if="space === 'admin'"
        class="app-rail__back"
        :to="backTo"
        aria-label="Retour à Watchdeck"
        title="Retour à Watchdeck"
      >
        <ArrowLeft aria-hidden="true" />
        <span :class="{ 'sr-only': density === 'medium' }" aria-hidden="true">Watchdeck</span>
      </RouterLink>
      <RouterLink v-else class="app-rail__brand" to="/" :aria-label="`Watchdeck — accueil`">
        <Clapperboard aria-hidden="true" />
        <span class="app-rail__brand-name" :class="{ 'sr-only': density === 'medium' }" :title="pageTitle || 'Watchdeck'">{{ pageTitle || 'Watchdeck' }}</span>
      </RouterLink>
      <button
        v-if="collapsible"
        type="button"
        class="app-rail__collapse"
        :aria-pressed="collapsed"
        :aria-label="collapsed ? 'Déployer la navigation' : 'Replier la navigation'"
        @click="$emit('toggle-rail')"
      >
        <PanelLeftOpen v-if="collapsed" aria-hidden="true" />
        <PanelLeftClose v-else aria-hidden="true" />
      </button>
    </div>

    <template v-if="space === 'admin'">
      <p v-if="density === 'expanded'" class="app-rail__space-title">
        <Settings aria-hidden="true" />Administration
      </p>
    </template>

    <div ref="scroller" class="app-rail__scroll" data-overflow="" @scroll.passive="scheduleMeasure">
      <!-- Les groupes structurent le rail déployé. En mode compact ils deviennent de
           simples séparateurs : leur libellé ne tiendrait pas sur 72px, mais la
           coupure visuelle, elle, reste lisible. -->
      <div v-for="group in groups" :key="group.label" class="app-rail__group">
        <p v-if="density === 'expanded' && group.label" class="app-rail__group-label">{{ group.label }}</p>
        <ul>
          <li v-for="destination in group.items" :key="destination.key">
            <RouterLink
              class="app-nav-link app-rail__link"
              :to="destination.to"
              :aria-current="destination.key === activeKey ? 'page' : undefined"
              :title="density === 'medium' ? destination.label : undefined"
            >
              <component :is="destination.icon" aria-hidden="true" />
              <!-- Le libellé reste dans le DOM en mode compact : masqué visuellement,
                   il continue de nommer le lien pour les technologies d'assistance,
                   sans dépendre d'un aria-label à maintenir en double. -->
              <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">{{ destination.label }}</span>
              <template v-if="space === 'admin'">
                <span
                  v-if="destination.key === 'admin-overview' && attention.urgent.value"
                  class="app-rail__count"
                  :aria-label="`${attention.urgent.value} point${attention.urgent.value > 1 ? 's' : ''} à traiter`"
                >{{ attention.urgent.value }}</span>
                <span
                  v-else-if="attention.severityOf(destination.key)"
                  class="app-rail__dot"
                  :class="`is-${attention.severityOf(destination.key)}`"
                  role="img"
                  :aria-label="severityLabel(attention.severityOf(destination.key))"
                ></span>
              </template>
            </RouterLink>
            <ul
              v-if="density === 'expanded' && destination.key === activeKey && sections.length > 1"
              class="app-rail__subnav"
              :aria-label="`Sections ${destination.label}`"
            >
              <li v-for="section in sections" :key="section.key">
                <RouterLink
                  class="app-rail__sublink"
                  :to="section.to || destination.to"
                  :aria-current="section.key === activeSectionKey ? 'page' : undefined"
                >
                  <component v-if="section.icon" :is="section.icon" aria-hidden="true" />
                  <span>{{ section.label }}</span>
                </RouterLink>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>

    <div class="app-rail__footer">
      <!-- La porte unique de l'Administration : ses groupes ne prennent plus de place
           dans le rail, mais ce qui y est cassé se voit d'ici. -->
      <RouterLink
        v-if="space === 'app' && isAdmin"
        class="app-nav-link app-rail__link"
        :to="ADMIN_ENTRY.to"
        :title="density === 'medium' ? ADMIN_ENTRY.label : undefined"
      >
        <component :is="ADMIN_ENTRY.icon" aria-hidden="true" />
        <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">{{ ADMIN_ENTRY.label }}</span>
        <span
          v-if="attention.urgent.value"
          class="app-rail__count"
          :aria-label="`${attention.urgent.value} point${attention.urgent.value > 1 ? 's' : ''} à traiter`"
        >{{ attention.urgent.value }}</span>
      </RouterLink>
      <!-- Bascule sombre/clair en un clic ; le mode « Systeme » se choisit dans le
           profil ou par la palette (Ctrl+K « theme »). -->
      <button type="button" class="app-nav-link app-rail__link" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
        <component :is="resolvedTheme === 'dark' ? Sun : Moon" aria-hidden="true" />
        <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">{{ resolvedTheme === 'dark' ? 'Thème clair' : 'Thème sombre' }}</span>
      </button>
      <RouterLink class="app-nav-link app-rail__link" to="/profile" :title="density === 'medium' ? 'Profil' : undefined">
        <UserRound aria-hidden="true" />
        <span :class="density === 'medium' ? 'sr-only' : 'app-rail__label'">Profil</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeft, Clapperboard, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserRound } from '@lucide/vue';
import { useTheme } from '@/composables/useTheme';
import { ADMIN_ENTRY, adminAreasFor, destinationsFor, type NavDestination } from '@/navigation';
import { useAdminAttention } from '@/composables/useAdminAttention';
import type { AttentionSeverity } from '@/adminAttention';

const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();
const themeLabel = computed(() => (resolvedTheme.value === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'));
import { usePageSections } from '@/composables/usePageSections';

const props = withDefaults(
  defineProps<{
    /** `medium` : icônes seules sur 72px. `expanded` : libellés et groupes visibles. */
    density: 'medium' | 'expanded';
    activeKey?: string;
    pageTitle?: string;
    isAdmin?: boolean;
    canModerate?: boolean;
    collapsible?: boolean;
    collapsed?: boolean;
    /** `admin` : barre de l'espace Administration, qui prend la place du rail. */
    space?: 'app' | 'admin';
    /** Où mène « Retour à Watchdeck » : la dernière page de l'application visitée. */
    backTo?: string;
  }>(),
  { activeKey: '', pageTitle: 'Watchdeck', isAdmin: false, canModerate: false, collapsible: false, collapsed: false, space: 'app', backTo: '/' }
);

defineEmits<{ (e: 'toggle-rail'): void }>();
const { sections, activeKey: activeSectionKey } = usePageSections();
const attention = useAdminAttention({ enabled: () => props.isAdmin });

function severityLabel(severity: AttentionSeverity | null): string {
  if (severity === 'error') return 'En erreur';
  if (severity === 'warn') return 'À surveiller';
  return 'Information';
}

/** Un seul niveau, groupé par métier : le rail montre toujours tout ce qui est permis. */
const groups = computed<Array<{ label: string; items: NavDestination[] }>>(() => {
  const result: Array<{ label: string; items: NavDestination[] }> = [];
  const items = props.space === 'admin' ? adminAreasFor(props.isAdmin) : destinationsFor(props.isAdmin, props.canModerate);
  for (const destination of items) {
    const existing = result.find((group) => group.label === destination.group);
    if (existing) existing.items.push(destination);
    else result.push({ label: destination.group, items: [destination] });
  }
  return result;
});

/* Indice de defilement du rail.
   La barre native est masquee a dessein (elle rognait la colonne) ; sans elle, rien ne
   disait qu'il restait des destinations sous la ligne de flottaison. On expose donc
   l'etat reel -- du contenu au-dessus, en dessous, des deux cotes, ou rien -- et le CSS
   pose le degrade correspondant. Une valeur calculee plutot qu'un fondu permanent :
   sur un rail court, un degrade constant ferait croire a tort a une suite.

   L'attribut est ecrit directement sur le noeud, hors du cycle de rendu de Vue : passer
   par un `ref` reactif reconstruisait la navigation a chaque evenement de defilement --
   y compris celui que declenche `focus()` en amenant un lien dans la vue -- et le
   parcours au clavier y perdait par moments son contour de focus. */
const scroller = ref<HTMLElement | null>(null);
let measureHandle = 0;

function measureOverflow(): void {
  const element = scroller.value;
  if (!element) return;
  // 2px de tolerance : les hauteurs fractionnaires empechent `scrollTop + clientHeight`
  // d'atteindre exactement `scrollHeight` en bout de course.
  const atStart = element.scrollTop <= 2;
  const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
  const state = atStart && atEnd ? '' : atStart ? 'end' : atEnd ? 'start' : 'start-end';
  if (element.dataset.overflow !== state) element.dataset.overflow = state;
}

/** Une mesure par image au plus : le defilement en emet bien davantage. */
function scheduleMeasure(): void {
  if (measureHandle) return;
  measureHandle = requestAnimationFrame(() => {
    measureHandle = 0;
    measureOverflow();
  });
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  measureOverflow();
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    // Le rail change de hauteur utile quand la fenetre change, et de contenu quand les
    // droits de la session ou les sections de la page arrivent : les deux modifient la
    // boite observee ou le contenu qu'elle mesure.
    resizeObserver = new ResizeObserver(() => scheduleMeasure());
    resizeObserver.observe(scroller.value);
    for (const child of Array.from(scroller.value.children)) resizeObserver.observe(child);
  }
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (measureHandle) cancelAnimationFrame(measureHandle);
});

/* Les sections de page s'ajoutent et se retirent sous la destination active : le
   contenu du rail change sans que sa boite bouge. */
watch([() => groups.value.length, () => sections.value.length], () => void nextTick(measureOverflow));
</script>

<style scoped lang="scss">
.app-rail[data-density="medium"] .app-rail__brand { background: var(--accent); border-radius: var(--radius-md); }
.app-rail[data-density="medium"] .app-rail__brand svg { color: var(--on-accent); }
.app-rail[data-density="medium"] .app-rail__link { border-radius: var(--radius-md); }
.app-rail[data-density="medium"] .app-rail__link[aria-current='page']::before { content: ''; position: absolute; left: -8px; height: 24px; width: 3px; border-radius: var(--radius-pill); background: var(--accent); }

.app-rail {
  position: sticky;
  top: 0;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100vh;
  height: 100dvh;
  padding: max(var(--space-3), var(--safe-top)) var(--space-2) max(var(--space-3), var(--safe-bottom));
  padding-left: max(var(--space-2), var(--safe-left));
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--bg) 96%, var(--surface));
}

.app-rail__scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  /* La barre de defilement reste fonctionnelle mais invisible : sur une colonne de
     72 a 232px, sa gouttiere rognait la largeur utile et coupait le rail en deux d'un
     trait clair. Le defilement passe par la molette, le clavier et le tactile. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* La gouttiere est masquee pour ne pas rogner une colonne de 72 a 232px, mais la
   colonne restait alors sans aucun indice de defilement : sur un ecran de 900px,
   « Notifications », « Utilisateurs » et « Système » tombaient hors champ sans que rien
   ne le signale. Le degrade tient ce role -- il ne coute aucune largeur, et n'apparait
   que quand il reste vraiment quelque chose a voir (cf. `measureOverflow`). */
.app-rail__scroll[data-overflow$="end"] {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent 100%);
}
.app-rail__scroll[data-overflow="start"] {
  mask-image: linear-gradient(to bottom, transparent 0, #000 26px);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 26px);
}
.app-rail__scroll[data-overflow="start-end"] {
  mask-image: linear-gradient(to bottom, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
}

.app-rail__scroll::-webkit-scrollbar { width: 0; height: 0; }

.app-rail__header { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.app-rail__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  color: var(--text);
  font-weight: 750;
  text-decoration: none;
  min-width: 0;
  flex: 1;
}
.app-rail__brand svg { flex: none; width: 22px; height: 22px; color: var(--accent); }
/* Un titre de page long (« Améliorations VF & Flux », « Inventaire médiathèque ») fait
   243px dans une boite de 167px : sans coupure, les glyphes passaient sous le bouton de
   repli et le mot etait tranche en plein milieu. */
.app-rail__brand-name { font-size: var(--fs-lg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.app-rail__collapse {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--touch-target);
  height: var(--touch-target);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.app-rail__collapse:hover { border-color: var(--border); background: var(--surface); color: var(--text); }
.app-rail__collapse svg { width: 19px; height: 19px; }

.app-rail__group ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.app-rail__group + .app-rail__group { border-top: 1px solid var(--border); padding-top: var(--space-4); }
.app-rail__group-label {
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.app-rail__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--motion-duration-instant) var(--motion-ease-standard), background-color var(--motion-duration-instant) var(--motion-ease-standard);
}
.app-rail__link svg { flex: none; width: 19px; height: 19px; }
.app-rail__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-rail__link kbd {
  margin-left: auto;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-size: var(--fs-xs);
}
.app-rail__link:hover { color: var(--text); background: var(--surface); }
.app-rail__link[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}

.app-rail__subnav {
  display: grid;
  gap: 2px;
  margin: 2px 0 var(--space-2) 20px !important;
  padding: 0 0 0 var(--space-2) !important;
  border-left: 1px solid var(--border);
}
.app-rail__sublink {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--fs-xs);
  text-decoration: none;
}
.app-rail__sublink svg { flex: none; width: 15px; height: 15px; }
.app-rail__sublink:hover { color: var(--text); background: var(--surface); }
.app-rail__sublink[aria-current='page'] { color: var(--accent); font-weight: 700; }

.app-rail__back {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.app-rail__back span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.app-rail__back svg { flex: none; width: 18px; height: 18px; }
.app-rail__back:hover { color: var(--text); background: var(--surface); }
.app-rail__space-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}
.app-rail__space-title svg { width: 20px; height: 20px; color: var(--accent); }
.app-rail__count {
  margin-left: auto;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--red) 16%, transparent);
  color: var(--red-text);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.app-rail__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--muted);
}
.app-rail__dot.is-error { background: var(--red); }
.app-rail__dot.is-warn { background: var(--amber); }

.app-rail__footer {
  display: grid;
  gap: 2px;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

/* Icônes seules : la cible reste carrée et centrée, jamais plus étroite que 44px. */
.app-rail[data-density='medium'] {
  .app-rail__header { flex-direction: column; }
  .app-rail__back { flex: none; justify-content: center; width: var(--touch-target); padding: 0; }
  /* Sur 72px, le compteur et la pastille se posent sur l'icône plutôt qu'à côté. */
  .app-rail__link { position: relative; }
  .app-rail__count { position: absolute; top: 4px; right: 4px; min-width: 16px; padding: 0 4px; font-size: 10px; }
  .app-rail__dot { position: absolute; top: 9px; right: 9px; }
  .app-rail__brand { flex: none; justify-content: center; width: var(--touch-target); padding: 0; }
  .app-rail__group + .app-rail__group { padding-top: var(--space-3); }
  .app-rail__link { justify-content: center; gap: 0; padding: 0; }
}
</style>
