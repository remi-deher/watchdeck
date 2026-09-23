import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { doitFermer, positionPourDelta, useSheetGesture } from './useSheetGesture';

vi.mock('motion-v', () => ({
  // Les ressorts aboutissent immediatement : on teste les decisions, pas la physique.
  animate: (from, to, { onUpdate }) => {
    onUpdate(to);
    return { stop() {}, finished: Promise.resolve() };
  },
}));

function toucher(el, type, y, x = 100, t = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  Object.defineProperty(event, 'timeStamp', { value: t });
  el.dispatchEvent(event);
  return event;
}

async function monter() {
  const onClose = vi.fn();
  const Feuille = defineComponent({
    setup() {
      const panel = ref(null);
      useSheetGesture(panel, ref(true), { onClose });
      return () => h('div', { class: 'voile' }, [
        h('div', { ref: panel, class: 'panel' }, [h('div', { class: 'scroll' }, [h('p', { class: 'texte' }, 'x')])]),
      ]);
    },
  });
  const wrapper = mount(Feuille, { attachTo: document.body });
  const panel = wrapper.find('.panel').element;
  Object.defineProperty(panel, 'offsetHeight', { value: 800 });
  await nextTick(); // l'ecoute se branche une fois la reference posee
  return { wrapper, panel, scroll: wrapper.find('.scroll').element, texte: wrapper.find('.texte').element, onClose };
}

async function glisser(el, de, a, duree = 300) {
  toucher(el, 'touchstart', de, 100, 0);
  const pas = 10;
  let dernier;
  for (let i = 1; i <= pas; i += 1) dernier = toucher(el, 'touchmove', de + ((a - de) * i) / pas, 100, (duree * i) / pas);
  toucher(el, 'touchend', a, 100, duree);
  await nextTick();
  await Promise.resolve();
  return dernier;
}

describe('regles du geste', () => {
  it('suit le doigt a l\'identique, puis resiste', () => {
    expect(positionPourDelta(-20, 800)).toBe(0);
    expect(positionPourDelta(300, 800)).toBe(300);
    expect(positionPourDelta(680, 800)).toBeCloseTo(480 + 200 * 0.35);
  });

  it('ferme au-dela du quart, ou lancee vite ; jamais relancee vers le haut', () => {
    expect(doitFermer(210, 0, 800)).toBe(true);
    expect(doitFermer(120, 0, 800)).toBe(false);
    expect(doitFermer(60, 1.2, 800)).toBe(true);
    expect(doitFermer(300, -0.5, 800)).toBe(false);
  });
});

describe('useSheetGesture', () => {
  it('contenu en haut : un glissement vers le bas, n\'importe ou, ferme la feuille', async () => {
    const { texte, onClose, wrapper } = await monter();
    const move = await glisser(texte, 100, 400);
    expect(move.defaultPrevented).toBe(true); // le navigateur ne defile pas
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('un petit glissement lent : la feuille revient a sa place', async () => {
    const { texte, panel, onClose, wrapper } = await monter();
    await glisser(texte, 100, 180, 800);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
    wrapper.unmount();
  });

  it('contenu defile : le glissement appartient au defilement', async () => {
    const { texte, scroll, onClose, wrapper } = await monter();
    scroll.scrollTop = 240;
    const move = await glisser(texte, 100, 500);
    expect(move.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('arrive en haut par le defilement, il faut un nouveau geste pour fermer', async () => {
    const { texte, scroll, onClose, wrapper } = await monter();
    scroll.scrollTop = 240;
    toucher(texte, 'touchstart', 100);
    scroll.scrollTop = 0; // l'elan atteint le haut pendant le meme geste
    toucher(texte, 'touchmove', 300, 100, 100);
    toucher(texte, 'touchend', 300, 100, 120);
    await nextTick();
    expect(onClose).not.toHaveBeenCalled();
    await glisser(texte, 100, 400); // nouveau geste, parti du haut
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('un glissement vers le haut ou de cote ne deplace pas la feuille', async () => {
    const { texte, panel, onClose, wrapper } = await monter();
    await glisser(texte, 400, 100);
    toucher(texte, 'touchstart', 100, 100, 0);
    toucher(texte, 'touchmove', 110, 200, 50);
    toucher(texte, 'touchend', 110, 200, 60);
    expect(panel.style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('eclaircit le voile pendant le geste', async () => {
    const { texte, wrapper } = await monter();
    toucher(texte, 'touchstart', 100, 100, 0);
    toucher(texte, 'touchmove', 508, 100, 50);
    expect(wrapper.find('.voile').element.style.getPropertyValue('--sheet-progress')).toBe('0.5');
    wrapper.unmount();
  });
});
