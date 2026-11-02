import { describe, it, expect, afterEach, vi } from 'vitest';
import { shareOrCopy, normalizeText } from './share.js';

const payload = { title: 'Balandra', text: 'Mira este lugar', url: 'https://example.com/destinos/balandra' };

describe('shareOrCopy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(await shareOrCopy(payload)).toBe('shared');
    expect(share).toHaveBeenCalledWith(payload);
  });

  it('reports cancellation without copying', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await shareOrCopy(payload)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying the link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareOrCopy(payload)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(payload.url);
  });

  it('reports failure when nothing works', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareOrCopy(payload)).toBe('failed');
  });
});

describe('normalizeText', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeText('Espíritu Santo')).toBe('espiritu santo');
  });
});
