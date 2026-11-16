// Public, read-only. Returns the live pricing config from KV so every
// visitor's estimator always reflects whatever Patricia last saved in the
// admin panel. script.js merges this over its own bundled defaults on load,
// so the site keeps working even if this returns nothing (e.g. KV hasn't
// been seeded yet) or the request fails entirely.

export async function handlePricingGet(env){
    const stored = await env.PRICING_KV.get('config', { type: 'json' });
    return new Response(JSON.stringify(stored || null), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60'
        }
    });
}
