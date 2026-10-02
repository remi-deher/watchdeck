import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import UiButton from './UiButton.vue';
import UiMenu from './UiMenu.vue';
import UiMenuItem from './UiMenuItem.vue';
import UiMenuSeparator from './UiMenuSeparator.vue';

const Harness = {
  components: { UiButton, UiMenu, UiMenuItem, UiMenuSeparator },
  emits: ['choix'],
  template: `
    <UiMenu label="Alice">
      <template #trigger>
        <UiButton icon-only title="Actions" aria-label="Actions">…</UiButton>
      </template>
      <UiMenuItem @select="$emit('choix', 'mail')">Renvoyer</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem variant="danger" @select="$emit('choix', 'retirer')">Retirer</UiMenuItem>
      <UiMenuItem disabled @select="$emit('choix', 'inactif')">Inactif</UiMenuItem>
    </UiMenu>`,
};

async function ouvrir(w) {
  // Le declencheur est le bouton-icone lui-meme : Reka lui ajoute ses attributs ARIA.
  const trigger = w.find('button[aria-label="Actions"]');
  expect(trigger.attributes('aria-haspopup')).toBe('menu');
  await trigger.trigger('keydown', { key: 'Enter' });
  await nextTick();
  return trigger;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('UiMenu', () => {
  it('s ouvre depuis un UiButton, avec intitule, separateur et variante danger', async () => {
    const w = mount(Harness, { attachTo: document.body });
    const trigger = await ouvrir(w);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const menu = document.body.querySelector('.ui-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menu?.querySelector('.ui-menu-label')?.textContent).toBe('Alice');
    expect(menu?.querySelectorAll('.ui-menu-separator')).toHaveLength(1);
    const items = [...menu.querySelectorAll('.ui-menu-item')];
    expect(items.map((i) => i.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem']);
    expect(items[1].classList.contains('ui-menu-item--danger')).toBe(true);
    expect(items[2].hasAttribute('data-disabled')).toBe(true);
    w.unmount();
  });

  it('emet select puis se referme', async () => {
    const w = mount(Harness, { attachTo: document.body });
    const trigger = await ouvrir(w);
    document.body.querySelectorAll('.ui-menu-item')[1].dispatchEvent(new Event('click', { bubbles: true }));
    await nextTick();
    await nextTick();
    expect(w.emitted('choix')).toEqual([['retirer']]);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    w.unmount();
  });
});
