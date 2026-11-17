// TEMPORARY — checks whether RECAPTCHA_SECRET_KEY resolves to a real value
// and what Google's siteverify says about it, without needing a real
// browser token. Delete this file and its route in worker.js once done.
import { resolveSecret } from '../lib/session.js';

export async function handleDebugRecaptcha(env){
    const secret = await resolveSecret(env.RECAPTCHA_SECRET_KEY);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secret || '')}&response=deliberately-invalid-token`
    });
    const data = await res.json().catch(e => ({ fetchError: e.message }));
    return new Response(JSON.stringify({
        secretType: typeof secret,
        secretLength: typeof secret === 'string' ? secret.length : null,
        secretPrefix: typeof secret === 'string' ? secret.slice(0, 6) : null,
        googleResponse: data
    }), { headers: { 'Content-Type': 'application/json' } });
}
