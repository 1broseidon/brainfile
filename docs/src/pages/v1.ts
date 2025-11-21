import type { APIRoute } from 'astro';
import schema from '../../../brainfile.schema.json';

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(schema, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
