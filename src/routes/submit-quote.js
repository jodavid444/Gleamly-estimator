// Handles both the Stage 2 final-quote request and the short general
// enquiry form (distinguished by record.type, same shapes script.js already
// builds in submitEnquiryRecord()/submitGeneralEnquiry()).
//
// Order of checks matters: reCAPTCHA is verified before anything else runs,
// so a failed/missing token never gets as far as emailing anything. Every
// photo is re-validated here against the real rules (type via the
// browser-reported MIME type, 5MB size cap, 10-photo count cap) — frontend
// validation in script.js is only there for fast feedback, this is the
// check that actually matters, since it can't be bypassed by skipping the
// page's JS.
//
// Photos are attached directly to the notification email rather than
// stored anywhere — there's no bucket, so nothing to delete later either.
// Resend caps total attachment size at 40MB after base64 encoding, which
// inflates size by ~1/3, so MAX_ATTACH_RAW_BYTES keeps a safety margin
// under that. In the rare case a submission's photos don't all fit, we
// attach as many as fit and say so in the email so Patricia knows to ask
// the customer to resend the rest directly.

import { resolveSecret } from '../lib/session.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_ATTACH_RAW_BYTES = 28 * 1024 * 1024;

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

function arrayBufferToBase64(buffer){
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for(let i = 0; i < bytes.length; i += chunkSize){
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function buildEmailText(record, totalPhotoCount, omittedCount){
    const lines = [];
    lines.push(`New Gleamly ${record.type === 'general_enquiry' ? 'general enquiry' : 'quote request'} — ${record.id}`);
    lines.push('');
    lines.push(JSON.stringify(record, null, 2));
    if(totalPhotoCount){
        lines.push('');
        lines.push(`${totalPhotoCount} photo(s) submitted, attached to this email.`);
        if(omittedCount){
            lines.push(`${omittedCount} photo(s) could not be attached (total upload too large for email) — ask the customer to resend those directly if needed.`);
        }
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
    const recaptchaSecret = await resolveSecret(env.RECAPTCHA_SECRET_KEY);
    const recaptchaOk = await verifyRecaptcha(recaptchaToken, recaptchaSecret);
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

    const attachments = [];
    let attachedBytes = 0;
    let omittedCount = 0;
    for(const file of files){
        if(attachedBytes + file.size > MAX_ATTACH_RAW_BYTES){
            omittedCount++;
            continue;
        }
        attachments.push({
            filename: file.name || 'photo.jpg',
            content: arrayBufferToBase64(await file.arrayBuffer())
        });
        attachedBytes += file.size;
    }

    const resendApiKey = await resolveSecret(env.RESEND_API_KEY);
    const notifyFrom = await resolveSecret(env.NOTIFY_FROM_EMAIL);
    const notifyTo = await resolveSecret(env.NOTIFY_TO_EMAIL);

    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: notifyFrom,
            to: notifyTo,
            subject: `New Gleamly ${record.type === 'general_enquiry' ? 'enquiry' : 'quote request'} — ${record.id}`,
            text: buildEmailText(record, files.length, omittedCount),
            attachments: attachments.length ? attachments : undefined
        })
    }).catch(() => null);

    if(!emailRes || !emailRes.ok){
        return jsonError('Your details were received but we could not send the notification email. Please try again or contact Gleamly directly.', 502);
    }

    return new Response(JSON.stringify({ success: true, id: record.id }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
