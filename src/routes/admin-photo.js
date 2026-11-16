// Lets a logged-in admin view a submitted photo. Photos are never public —
// this is the only way to read one back out of R2, and it refuses without a
// valid session cookie, same as the pricing endpoints.

import { requireAdminSession } from '../lib/session.js';

export async function handleAdminPhoto(request, env){
    if(!(await requireAdminSession(request, env))){
        return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if(!key || !key.startsWith('quotes/')){
        return new Response('Invalid key', { status: 400 });
    }

    const obj = await env.PHOTOS_BUCKET.get(key);
    if(!obj){
        return new Response('Not found', { status: 404 });
    }

    return new Response(obj.body, {
        headers: {
            'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
            'Cache-Control': 'private, no-store'
        }
    });
}
