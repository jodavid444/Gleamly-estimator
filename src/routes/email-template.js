// Builds the HTML version of the quote/enquiry notification email. Table
// layout with inline styles throughout, since that's what survives being
// rendered by Gmail/Outlook/etc. — no external CSS or <style> blocks.

const BRAND_BLUE = '#1864AB';

const SERVICE_LABELS = {
    reset: 'Gleamly Reset',
    resetPlus: 'Gleamly Reset Plus',
    abc: 'ABC Clean',
    restore: 'Restore (Carpet Cleaning)'
};

function esc(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function titleCase(str){
    if(str == null || str === '') return '';
    const withSpaces = String(str).replace(/([a-z])([A-Z])/g, '$1 $2');
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function yesNo(value){
    return value ? 'Yes' : 'No';
}

// A single label/value row. Skips rendering entirely when value is empty,
// so optional fields never show up as blank rows.
function row(label, value){
    if(value === null || value === undefined || value === '') return '';
    return `
        <tr>
            <td style="padding:6px 12px 6px 0; color:#64748b; font-size:13px; white-space:nowrap; vertical-align:top;">${esc(label)}</td>
            <td style="padding:6px 0; color:#0f172a; font-size:13px;">${esc(value)}</td>
        </tr>`;
}

function section(title, rowsHtml){
    const filtered = rowsHtml.filter(Boolean).join('');
    if(!filtered) return '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
            <tr><td style="background:#f1f5f9; padding:10px 16px; font-size:13px; font-weight:700; color:${BRAND_BLUE}; text-transform:uppercase; letter-spacing:0.03em;">${esc(title)}</td></tr>
            <tr><td style="padding:12px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filtered}</table>
            </td></tr>
        </table>`;
}

function roomCounts(obj){
    if(!obj) return '';
    const parts = Object.entries(obj)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${titleCase(k)}: ${v}`);
    return parts.join(', ');
}

function estimateLine(estimate){
    if(!estimate) return '';
    if(estimate.type === 'range') return `£${estimate.from} – £${estimate.to}${estimate.extrasTotal ? ` (includes £${estimate.extrasTotal} of extras)` : ''}`;
    if(estimate.type === 'bespoke') return `Bespoke quote needed — ${estimate.reason}`;
    if(estimate.type === 'restore') return `£${estimate.amount}`;
    return '';
}

function wrap(bodyHtml, headingText){
    return `<!doctype html>
<html>
<body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:24px 0;">
        <tr><td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; max-width:600px; width:100%;">
                <tr><td style="background:${BRAND_BLUE}; padding:20px 24px;">
                    <span style="color:#ffffff; font-size:18px; font-weight:700;">${esc(headingText)}</span>
                </td></tr>
                <tr><td style="padding:24px;">
                    ${bodyHtml}
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}

function buildGeneralEnquiryHtml(record){
    const contact = section('Contact details', [
        row('Name', record.name),
        row('Mobile', record.mobile),
        row('Email', record.email),
        row('Postcode', record.postcode)
    ]);
    const message = section('Message', [row('Message', record.message)]);
    return wrap(`${contact}${message}`, `New general enquiry — ${record.id}`);
}

function buildQuoteRequestHtml(record, photoFilenames, omittedCount){
    const s2 = record.stage2 || {};
    const s1 = record.stage1 || {};

    const customer = section('Customer details', [
        row('Name', s2.name),
        row('Mobile', s2.mobile),
        row('Email', s2.email),
        row('Postcode', s2.postcode),
        row('Preferred date', s2.preferredDateOption === 'flexible' ? 'Flexible' : s2.preferredDate),
        row('Furnished', s2.furnished),
        row('Floor', s2.floor),
        row('Access', s2.accessType),
        row('Access restrictions', s2.accessRestrictions),
        row('Parking', s2.parking),
        row('Problem areas', s2.problemAreas),
        row('ABC — extent of works', s2.abcExtent),
        row('ABC — trades finished', s2.abcTradesFinished),
        row('ABC — residue notes', s2.abcResidueNotes)
    ]);

    const job = section('Job details', [
        row('Service', SERVICE_LABELS[record.service] || titleCase(record.service)),
        row('Property type', titleCase(s1.propertyType)),
        row('Bedrooms', titleCase(s1.bedroomsOption)),
        row('Bathrooms', s1.bathrooms),
        row('WCs', s1.wcs),
        row('Staircases', s1.stairsFlights),
        row('Additional rooms', roomCounts(s1.additionalRooms)),
        row('Condition', titleCase(s1.condition)),
        row('Restore areas', record.service === 'restore' ? roomCounts(s1.restoreAreas) : ''),
        row('Stains', s1.stains),
        row('Notes on concerns', s1.concernNotes)
    ]);

    const extras = record.extras ? section('Optional extras', [
        row('Oven cleaning', record.extras.oven ? yesNo(true) : ''),
        row('Fridge cleaning', record.extras.fridge ? yesNo(true) : ''),
        row('Carpet cleaning', record.extras.carpet ? yesNo(true) : ''),
        row('Carpet areas', record.extras.carpet ? roomCounts(record.extras.carpetAreas) : '')
    ]) : '';

    const estimate = section('Estimate', [row('Estimated price', estimateLine(record.estimate))]);

    let photosHtml = '';
    if(photoFilenames.length){
        const list = photoFilenames.map(name => `<li style="margin-bottom:2px;">${esc(name)}</li>`).join('');
        const note = omittedCount
            ? `<p style="margin:8px 0 0; color:#b91c1c; font-size:12px;">${omittedCount} photo(s) could not be attached (upload too large for email) — ask the customer to resend those directly if needed.</p>`
            : `<p style="margin:8px 0 0; color:#64748b; font-size:12px;">All photos are attached to this email.</p>`;
        photosHtml = section('Photos', [`<tr><td><ul style="margin:0; padding-left:18px; color:#0f172a; font-size:13px;">${list}</ul>${note}</td></tr>`]);
    }

    return wrap(`${customer}${job}${extras}${estimate}${photosHtml}`, `New quote request — ${record.id}`);
}

export function buildEmailHtml(record, photoFilenames, omittedCount){
    if(record.type === 'general_enquiry') return buildGeneralEnquiryHtml(record);
    return buildQuoteRequestHtml(record, photoFilenames, omittedCount);
}
