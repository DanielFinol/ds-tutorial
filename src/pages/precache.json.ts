import type { APIRoute } from 'astro';
import { getLessons } from '../lib/lessons';

// Lesson URLs (relative to the site base) for the service worker to pre-cache.
export const GET: APIRoute = async () => {
  const pages = (await getLessons()).filter((l) => l.data.status === 'ready').map((l) => `lessons/${l.id}/`);
  return new Response(JSON.stringify({ pages }), { headers: { 'Content-Type': 'application/json' } });
};
