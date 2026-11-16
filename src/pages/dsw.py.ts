import type { APIRoute } from 'astro';
import source from '../lib/py/dsw.py?raw';

// Serves the practice-data module so learners can download it for the local labs.
export const GET: APIRoute = () => new Response(source, { headers: { 'Content-Type': 'text/x-python; charset=utf-8' } });
