// Checks the submitted password against the ADMIN_PASSWORD secret and, on
// success, issues a signed HttpOnly session cookie. Failed attempts are
// rate-limited per IP via KV to deter brute-forcing — this is the real
// security boundary for the admin panel, not anything in admin.html/admin.js.

import { createSessionToken, resolveSecret } from '../lib/session.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900; // 15 minutes

export async function handleAdminLogin(request, env){
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const attemptsKey = `login_attempts:${ip}`;
    const attempts = Number(await env.PRICING_KV.get(attemptsKey)) || 0;

    if(attempts >= MAX_ATTEMPTS){
        return new Response(JSON.stringify({ error: 'Too many attempts. Please try again in 15 minutes.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const adminPassword = await resolveSecret(env.ADMIN_PASSWORD);

    if(!adminPassword || password !== adminPassword){
        await env.PRICING_KV.put(attemptsKey, String(attempts + 1), { expirationTtl: LOCKOUT_SECONDS });
        return new Response(JSON.stringify({ error: 'Incorrect password.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    await env.PRICING_KV.delete(attemptsKey);
    const sessionSecret = await resolveSecret(env.ADMIN_SESSION_SECRET);
    const token = await createSessionToken(sessionSecret, 7200);

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`
        }
    });
}
