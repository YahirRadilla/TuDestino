const YOUTUBE_ID = /^[\w-]{6,20}$/;

function parse(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Only https URLs are ever linked or embedded (a stored `javascript:` URL must stay inert).
export function safeExternalUrl(value) {
  const url = typeof value === 'string' ? parse(value) : null;
  return url && url.protocol === 'https:' ? url.href : null;
}

/**
 * Embeddable player URL for the video hosts we allow (YouTube, Vimeo), or null: then the UI
 * falls back to a plain link. YouTube uses the no-cookie domain.
 */
export function toEmbedUrl(mediaUrl) {
  const href = safeExternalUrl(mediaUrl);
  const url = href ? new URL(href) : null;
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, '');

  let youtubeId = null;
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') youtubeId = url.searchParams.get('v');
    else youtubeId = /^\/(?:embed|shorts)\/([\w-]+)/.exec(url.pathname)?.[1] ?? null;
  } else if (host === 'youtu.be') {
    youtubeId = url.pathname.slice(1);
  }
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /(\d{5,})/.exec(url.pathname)?.[1];
    if (id) return `https://player.vimeo.com/video/${id}`;
  }
  return null;
}
