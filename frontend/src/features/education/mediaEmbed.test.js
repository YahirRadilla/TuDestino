import { describe, expect, it } from 'vitest';
import { safeExternalUrl, toEmbedUrl } from './mediaEmbed.js';

describe('toEmbedUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/abc123_XYZ-', 'https://www.youtube-nocookie.com/embed/abc123_XYZ-'],
    ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789'],
  ])('embeds %s', (input, expected) => {
    expect(toEmbedUrl(input)).toBe(expected);
  });

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ', // not https
    'https://evil.example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=<script>',
    'https://www.youtube.com/watch',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'not a url',
    '',
    null,
    undefined,
  ])('refuses %s', (input) => {
    expect(toEmbedUrl(input)).toBeNull();
  });
});

describe('safeExternalUrl', () => {
  it('allows only https links', () => {
    expect(safeExternalUrl('https://www.gob.mx/conanp')).toBe('https://www.gob.mx/conanp');
    expect(safeExternalUrl('http://www.gob.mx')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
