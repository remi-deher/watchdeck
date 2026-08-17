import { describe, expect, it } from 'vitest';
import { useFeedback } from './useFeedback';

describe('useFeedback', () => {
  it('expose un message typé et réinitialisable', () => {
    const feedback = useFeedback();
    feedback.success('Enregistré');
    expect(feedback.message.value).toBe('Enregistré');
    expect(feedback.type.value).toBe('success');
    expect(feedback.visible.value).toBe(true);
    feedback.error(new Error('Échec'));
    expect(feedback.message.value).toBe('Échec');
    expect(feedback.type.value).toBe('error');
    feedback.clear();
    expect(feedback.visible.value).toBe(false);
  });
});
