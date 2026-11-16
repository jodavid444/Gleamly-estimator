// Shared helpers for the admin session cookie. Used by
// src/routes/admin-login.js, src/routes/admin-pricing.js and
// src/routes/admin-photo.js.
//
// The session is a signed, short-lived token: "<expiryMs>.<hmacSignature>".
// Signing uses the ADMIN_SESSION_SECRET Cloudflare secret, which never
// leaves the server — so a valid token can only ever be minted by
// admin-login.js after a correct password check.

async function hmac(secret, data){
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function createSessionToken(secret, ttlSeconds){
    const expires = Date.now() + (ttlSeconds || 7200) * 1000;
    const payload = String(expires);
    const sig = await hmac(secret, payload);
    return `${payload}.${sig}`;
}

export async function verifySessionToken(secret, token){
    if(!token) return false;
    const parts = token.split('.');
    if(parts.length !== 2) return false;
    const [payload, sig] = parts;
    const expected = await hmac(secret, payload);
    if(expected !== sig) return false;
    if(Date.now() > Number(payload)) return false;
    return true;
}

export function getCookie(request, name){
    const header = request.headers.get('Cookie') || '';
    const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export async function requireAdminSession(request, env){
    const token = getCookie(request, 'admin_session');
    return verifySessionToken(env.ADMIN_SESSION_SECRET, token);
}
