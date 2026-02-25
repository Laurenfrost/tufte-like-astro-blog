interface Env {
  R2_BUCKET: R2Bucket;
  IMAGES: Fetcher;
}

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/** Formats that should skip transformation (not supported or no benefit) */
const SKIP_TRANSFORM = new Set(['svg', 'gif']);

/**
 * Pick the best output format based on the Accept header.
 * Priority: AVIF > WebP > original format.
 */
function pickOutputFormat(accept: string, originalExt: string): string | null {
  if (accept.includes('image/avif')) return 'image/avif';
  if (accept.includes('image/webp')) return 'image/webp';
  // Fall back to original — return null to signal "use original as-is"
  // (We still transform to apply quality compression for jpeg/png)
  const originalMime = MIME_TYPES[originalExt];
  if (originalMime && originalMime !== 'image/gif' && originalMime !== 'image/svg+xml') {
    return originalMime;
  }
  return null;
}

/**
 * Derive a short format tag for cache key differentiation.
 */
function formatTag(accept: string): string {
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'orig';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // Remove leading slash

    if (!key) {
      return new Response('Not Found', { status: 404 });
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET and HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const accept = request.headers.get('Accept') || '';
    const ext = key.split('.').pop()?.toLowerCase() || '';
    const tag = formatTag(accept);

    // Check Cache API first
    const cache = caches.default;
    const cacheUrl = new URL(url.toString());
    cacheUrl.searchParams.set('_fmt', tag);
    const cacheKey = new Request(cacheUrl.toString(), request);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const object = await env.R2_BUCKET.get(key);

      if (!object) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Vary', 'Accept');

      // Set content type from extension if not set by R2 metadata
      if (!headers.has('Content-Type') && ext && MIME_TYPES[ext]) {
        headers.set('Content-Type', MIME_TYPES[ext]);
      }

      let response: Response;

      if (SKIP_TRANSFORM.has(ext)) {
        // SVG and GIF: return original without transformation
        response = new Response(object.body, { headers });
      } else {
        // Apply Image Transformations
        const outputFormat = pickOutputFormat(accept, ext);
        if (outputFormat) {
          try {
            const transformed = await env.IMAGES
              .input(object.body)
              .output({ format: outputFormat, quality: 80 });

            const transformedResponse = transformed.response();
            // Build response with our headers + transformed body
            headers.set('Content-Type', outputFormat);
            response = new Response(transformedResponse.body, { headers });
          } catch {
            // Transformation failed — fall back to original
            // Need to re-fetch since object.body was consumed
            const fallback = await env.R2_BUCKET.get(key);
            if (!fallback) return new Response('Not Found', { status: 404 });
            response = new Response(fallback.body, { headers });
          }
        } else {
          response = new Response(object.body, { headers });
        }
      }

      // Store in cache (non-blocking)
      const responseToCache = response.clone();
      cache.put(cacheKey, responseToCache);

      return response;
    } catch (error) {
      console.error('Error fetching from R2:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
