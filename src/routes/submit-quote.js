// Handles both the Stage 2 final-quote request and the short general
// enquiry form (distinguished by record.type, same shapes script.js already
// builds in submitEnquiryRecord()/submitGeneralEnquiry()).
//
// Order of checks matters: reCAPTCHA is verified before anything else runs,
// so a failed/missing token never gets as far as touching R2 or sending
// mail. Every photo is re-validated here against the real rules (type via
// the browser-reported MIME type, 5MB size cap, 10-photo count cap) —
// frontend validation in script.js is only there for fast feedback, this is
// the check that actually matters, since it can't be bypassed by skipping
// the page's JS.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

function jsonError(message, status){
    return new Response(JSON.stringify({ error: message }), {
        status: status || 400,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function verifyRecaptcha(token, secret){
    if(!token || !secret) return false;
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
    });
    const data = await res.json().catch(() => ({}));
    return !!data.success;
}

function buildEmailText(record, photoKeys){
    const lines = [];
    lines.push(`New Gleamly ${record.type === 'general_enquiry' ? 'general enquiry' : 'quote request'} — ${record.id}`);
    lines.push('');
    lines.push(JSON.stringify(record, null, 2));
    if(photoKeys.length){
        lines.push('');
        lines.push(`${photoKeys.length} photo(s) received. View them in the admin photo viewer (while logged in) at:`);
        photoKeys.forEach(key => lines.push(`  /api/admin/photo?key=${encodeURIComponent(key)}`));
    }
    return lines.join('\n');
}

export async function handleSubmitQuote(request, env){
    let form;
    try{
        form = await request.formData();
    }catch(e){
        return jsonError('Invalid form data.');
    }

    const recaptchaToken = form.get('g-recaptcha-response');
    const recaptchaOk = await verifyRecaptcha(recaptchaToken, env.RECAPTCHA_SECRET_KEY);
    if(!recaptchaOk){
        return jsonError('CAPTCHA verification failed. Please try again.');
    }

    const recordRaw = form.get('record');
    if(!recordRaw){
        return jsonError('Missing submission data.');
    }
    let record;
    try{
        record = JSON.parse(recordRaw);
    }catch(e){
        return jsonError('Malformed submission data.');
    }
    if(!record || !record.id || !record.type){
        return jsonError('Incomplete submission data.');
    }

    const files = form.getAll('photos').filter(f => f && typeof f === 'object' && typeof f.arrayBuffer === 'function');
    if(files.length > MAX_FILES){
        return jsonError(`Too many photos (max ${MAX_FILES}).`);
    }
    for(const file of files){
        if(file.size > MAX_FILE_BYTES){
            return jsonError(`${file.name} is over the 5MB limit.`);
        }
        if(!ALLOWED_TYPES.includes((file.type || '').toLowerCase())){
            return jsonError(`${file.name} is not an accepted image type.`);
        }
    }

    const uploadedKeys = [];
    for(const file of files){
        const key = `quotes/${record.id}/${crypto.randomUUID()}`;
        await env.PHOTOS_BUCKET.put(key, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type }
        });
        uploadedKeys.push(key);
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.NOTIFY_FROM_EMAIL,
            to: env.NOTIFY_TO_EMAIL,
            subject: `New Gleamly ${record.type === 'general_enquiry' ? 'enquiry' : 'quote request'} — ${record.id}`,
            text: buildEmailText(record, uploadedKeys)
        })
    }).catch(() => null);

    if(!emailRes || !emailRes.ok){
        return jsonError('Your details were received but we could not send the notification email. Please try again or contact Gleamly directly.', 502);
    }

    return new Response(JSON.stringify({ success: true, id: record.id }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
