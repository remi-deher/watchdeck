import { describe, expect, it, vi } from 'vitest';
import { passkeyForm, passwordForm, totpDisableForm, totpSetupForm } from './accountSecurity';

const fieldsOf = (definition) => definition.steps[0].fields;
const field = (definition, key) => fieldsOf(definition).find((entry) => entry.key === key);

describe('passwordForm', () => {
  it('demande le mot de passe actuel quand il y en a un, sinon le code 2FA s’il est activé', () => {
    const changing = passwordForm({ hasPassword: true, totpEnabled: true }, vi.fn());
    expect([field(changing, 'currentPassword').when(), field(changing, 'otpCode').when()]).toEqual([true, false]);
    const defining = passwordForm({ hasPassword: false, totpEnabled: true }, vi.fn());
    expect([field(defining, 'currentPassword').when(), field(defining, 'otpCode').when()]).toEqual([false, true]);
    expect(defining.editTitle).toBe('Définir un mot de passe');
  });

  it('exige huit caractères et transmet le brouillon', async () => {
    const save = vi.fn(async () => {});
    const definition = passwordForm({ hasPassword: true, totpEnabled: false }, save);
    expect(field(definition, 'newPassword').validate('court')).toBeTruthy();
    expect(field(definition, 'newPassword').validate('assez-long')).toBeUndefined();
    await definition.submit({ currentPassword: 'a', newPassword: 'assez-long' });
    expect(save).toHaveBeenCalledWith({ currentPassword: 'a', otpCode: '', newPassword: 'assez-long' });
  });
});

describe('totpSetupForm', () => {
  it('lit le QR code en arrivant, puis active avec le code saisi', async () => {
    const enable = vi.fn(async () => {});
    const definition = totpSetupForm(async () => ({ secret: 'ABCD', qr: 'data:image/png;base64,xx' }), enable);
    const values = definition.initial();
    expect(field(definition, 'qr').when(values)).toBe(false);
    await definition.steps[0].onEnter(values);
    expect(values).toMatchObject({ secret: 'ABCD', qr: 'data:image/png;base64,xx' });
    expect(field(definition, 'qr').when(values)).toBe(true);
    expect(field(definition, 'secretHelp').text(values)).toContain('ABCD');
    await definition.submit({ ...values, code: ' 123456 ' });
    expect(enable).toHaveBeenCalledWith('123456');
  });

  it('refuse un code qui n’a pas six chiffres', () => {
    for (const definition of [totpSetupForm(vi.fn(), vi.fn()), totpDisableForm(vi.fn())]) {
      const code = field(definition, 'code');
      expect(code.validate('12345')).toBeTruthy();
      expect(code.validate('123456')).toBeUndefined();
    }
  });
});

describe('passkeyForm', () => {
  it('nomme la passkey, « Passkey » à défaut', async () => {
    const register = vi.fn(async () => {});
    const definition = passkeyForm(register);
    await definition.submit({ name: ' iPhone ' });
    await definition.submit({ name: '' });
    expect(register.mock.calls).toEqual([['iPhone'], ['Passkey']]);
  });
});
