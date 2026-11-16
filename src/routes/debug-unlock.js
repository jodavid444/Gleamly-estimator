// TEMPORARY — clears the login rate-limit lockout for whoever calls this
// (it only ever touches the calling request's own IP, nothing else).
// Delete this file and its route in worker.js once lockouts are cleared.

export async function handleDebugUnlock(request, env){
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    await env.PRICING_KV.delete(`login_attempts:${ip}`);
    return new Response(JSON.stringify({ success: true, clearedFor: ip }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
