// TEMPORARY — diagnoses the shape of the ADMIN_PASSWORD binding without
// exposing its value. Delete this file and its route in worker.js once the
// login issue is resolved.
import { resolveSecret } from '../lib/session.js';

export async function handleDebugSecret(env){
    const raw = env.ADMIN_PASSWORD;
    const resolved = await resolveSecret(raw).catch(e => `ERROR: ${e.message}`);
    return new Response(JSON.stringify({
        rawType: typeof raw,
        rawHasGet: raw && typeof raw.get === 'function',
        rawKeys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
        resolvedType: typeof resolved,
        resolvedLength: typeof resolved === 'string' ? resolved.length : null
    }), { headers: { 'Content-Type': 'application/json' } });
}
