interface Env {
  IMAGES: R2Bucket;
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

    try {
      const object = await env.IMAGES.get(key);

      if (!object) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');

      // Set content type based on extension if not set
      if (!headers.has('Content-Type')) {
        const ext = key.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          avif: 'image/avif',
          svg: 'image/svg+xml',
        };
        if (ext && mimeTypes[ext]) {
          headers.set('Content-Type', mimeTypes[ext]);
        }
      }

      return new Response(object.body, { headers });
    } catch (error) {
      console.error('Error fetching from R2:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
