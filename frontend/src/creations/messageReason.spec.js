import { describe, expect, it, vi } from 'vitest';
import { messageReasonForm } from './messageReason';

describe('messageReason', () => {
  it('demande un libellé et un message, et montre un aperçu selon l’usage', () => {
    const cancelled = messageReasonForm('cancelled', 'Annulation', async () => {});
    expect(cancelled.quick).toBe(true);
    expect(cancelled.steps[0].fields.map((field) => [field.key, field.required ?? false])).toEqual([['label', true], ['message', true], ['enabled', false], ['preview', false]]);
    const preview = cancelled.steps[0].fields.find((field) => field.key === 'preview').text;
    expect(preview({ message: 'Hors catalogue' })).toContain('a été annulée — Hors catalogue');
    expect(messageReasonForm('correction', '', async () => {}).steps[0].fields[3].text({})).toContain('Une correction');
  });

  it('enregistre le motif nettoyé', async () => {
    const save = vi.fn(async () => {});
    const result = await messageReasonForm('cancelled', '', save).submit({ label: ' Doublon ', message: ' Déjà demandé. ', enabled: false });
    expect(save).toHaveBeenCalledWith({ label: 'Doublon', message: 'Déjà demandé.', enabled: false });
    expect(result.message).toBe('Motif enregistré');
  });
});
