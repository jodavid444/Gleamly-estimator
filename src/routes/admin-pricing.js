// Protected pricing read/write. GET returns the current config to populate
// the admin edit form; POST validates and saves it. Both refuse without a
// valid session cookie — this is what actually stops a customer who finds
// /admin.html (or this URL directly) from ever seeing or changing prices.

import { requireAdminSession } from '../lib/session.js';

function unauthorized(){
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
}

function flattenNumbers(obj, prefix){
    prefix = prefix || '';
    let out = [];
    for(const [k, v] of Object.entries(obj)){
        const path = `${prefix}${k}`;
        if(v && typeof v === 'object' && !Array.isArray(v)){
            out = out.concat(flattenNumbers(v, `${path}.`));
        } else {
            out.push([path, v]);
        }
    }
    return out;
}

export async function handleAdminPricingGet(request, env){
    if(!(await requireAdminSession(request, env))) return unauthorized();

    const stored = await env.PRICING_KV.get('config', { type: 'json' });
    return new Response(JSON.stringify(stored || {}), {
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function handleAdminPricingPost(request, env){
    if(!(await requireAdminSession(request, env))) return unauthorized();

    const body = await request.json().catch(() => null);
    if(!body || typeof body !== 'object' || Array.isArray(body)){
        return new Response(JSON.stringify({ error: 'Invalid payload.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    for(const [path, value] of flattenNumbers(body)){
        if(typeof value !== 'number' || !Number.isFinite(value) || value < 0){
            return new Response(JSON.stringify({ error: `Invalid value for ${path}.` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    await env.PRICING_KV.put('config', JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
