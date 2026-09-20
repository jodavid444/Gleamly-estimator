// ===============================
// Gleamly Instant Estimate & Quotation System
// Stage 1 (instant estimate) + Stage 2 (final-quote form)
// Photo/media upload is intentionally out of scope for this build.
// ===============================

'use strict';

// -------------------------------
// Pricing configuration
// All rates, labour hours, multipliers and Restore prices live here so the
// site administrator can change them (via the Admin panel, bottom-right gear
// icon) without touching source code. Values persist in localStorage.
// -------------------------------

const DEFAULT_CONFIG = {
    rates: { reset: 22, resetPlus: 22, abc: 26 },

    conditionMultipliers: { average: 1.00, attention: 1.30, heavy: 1.50 },

    labour: {
        reset:      { kitchen: 2.5, bathroom: 1.75, bedroom: 1.25, living: 1.75, hall: 0.75, stairs: 0.6, additionalWC: 0.5, incidentals: 1 },
        resetPlus:  { kitchen: 4,   bathroom: 1.75, bedroom: 1.5,  living: 1.75, hall: 1,    stairs: 0.6, additionalWC: 0.5, incidentals: 1.5 },
        abc:        { kitchen: 5,   bathroom: 3,    bedroom: 2,    living: 2.5,  hall: 1.5,  stairs: 0,   additionalWC: 1,   incidentals: 2.5 }
    },

    additionalRooms: {
        reset:     { dining: 1.75, office: 1.25, utility: 0.75, other: 1.25 },
        resetPlus: { dining: 1.75, office: 1.5,  utility: 1,    other: 1.5 },
        abc:       { dining: 2.5,  office: 2,    utility: 1.5,  other: 2 }
    },

    studioReduction: { kitchen: 0.5, living: 0.5 },

    rangeUplift: 1.10,
    roundTo: 5,

    restore: {
        bedroom: 40, living: 50, dining: 50, hallway: 25, landing: 20,
        stairsBase: 40, stairsBaseSteps: 13, additionalStairEach: 3,
        standaloneMinimum: 70
    }
};

function getByPath(obj, path){
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setByPath(obj, path, value){
    const parts = path.split('.');
    let o = obj;
    for(let i = 0; i < parts.length - 1; i++){ o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
}
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
function deepMerge(base, override){
    Object.keys(override || {}).forEach(k => {
        if(override[k] && typeof override[k] === 'object' && !Array.isArray(override[k]) && base[k] && typeof base[k] === 'object'){
            deepMerge(base[k], override[k]);
        } else {
            base[k] = override[k];
        }
    });
    return base;
}

function loadConfig(){
    try{
        const raw = localStorage.getItem('gleamlyConfig');
        if(!raw) return deepClone(DEFAULT_CONFIG);
        return deepMerge(deepClone(DEFAULT_CONFIG), JSON.parse(raw));
    }catch(e){
        return deepClone(DEFAULT_CONFIG);
    }
}
function saveConfig(){
    localStorage.setItem('gleamlyConfig', JSON.stringify(CONFIG));
}

let CONFIG = loadConfig();

// -------------------------------
// Reference data / wording
// -------------------------------

const SERVICE_META = {
    reset:     { name: 'Gleamly Reset', desc: 'A detailed one-off deep or spring clean for homes needing a thorough reset.' },
    resetPlus: { name: 'Reset Plus',    desc: 'Move-in / move-out & end-of-tenancy deep clean.' },
    abc:       { name: 'ABC',           desc: 'After-builders / post-construction clean.' },
    restore:   { name: 'Restore',       desc: 'Professional carpet cleaning for bedrooms and other carpeted areas.' }
};

const CONDITION_META = {
    average:   { title: 'Average',                     desc: 'Generally maintained - cleaning required, but the property has been reasonably maintained.' },
    attention: { title: 'Needs extra attention',        desc: 'Noticeable grease, limescale, staining, build-up or heavier cleaning required.' },
    heavy:     { title: 'Heavy cleaning required',      desc: 'Significant build-up, prolonged lack of cleaning or multiple areas requiring intensive work.' }
};

const ABC_CONDITION_META = {
    standard:   { title: 'Standard post-build condition', desc: 'Works complete, waste removed, mainly construction dust and normal post-build residue.' },
    residue:    { title: 'Considerable post-build residue', desc: 'Considerable post-build residue/detailing - we’ll need a few extra details for a bespoke estimate.' },
    incomplete: { title: 'Building/decorating works not yet complete', desc: 'Works are still ongoing - we’ll need a few extra details for a bespoke estimate.' }
};

const BEDROOM_OPTIONS = ['studio', '1', '2', '3', '4', '5+'];
const BEDROOM_LABELS = { studio: 'Studio', '1': '1 Bedroom', '2': '2 Bedrooms', '3': '3 Bedrooms', '4': '4 Bedrooms', '5+': '5+ Bedrooms' };

const STEP_LABELS = {
    service: 'Choose your service',
    propertyType: 'Property type',
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms & WCs',
    additionalRooms: 'Additional rooms',
    condition: 'Property condition',
    restoreAreas: 'Areas to clean',
    restoreConcern: 'Stains & concerns',
    bespoke: 'Bespoke estimate',
    estimate: 'Your estimate',
    stage2: 'Final quote details',
    confirmation: 'Request received'
};

const STEP_WEIGHTS = {
    service: 1, propertyType: 2, bedrooms: 2.5, restoreAreas: 2, bathrooms: 3,
    additionalRooms: 3.5, condition: 4, restoreConcern: 3, bespoke: 4.5,
    estimate: 5, stage2: 6, confirmation: 7
};
const TOTAL_WEIGHT = 7;

// -------------------------------
// Application state
// -------------------------------

function freshState(){
    return {
        service: null,
        propertyType: null,
        bedroomsOption: null,
        bathrooms: 1,
        wcs: 0,
        stairsFlights: 0,
        additionalRooms: { dining: 0, office: 0, utility: 0, other: 0 },
        condition: null,
        restoreAreas: { bedroom: 0, living: 0, dining: 0, hallway: 0, landing: 0, stairsSteps: 0 },
        restoreStandalone: true,
        stains: null,
        concernNotes: '',
        estimate: null,
        restoreEstimate: null,
        bespokeReason: null,
        lastEnquiryId: null,
        stage2: {
            name: '', mobile: '', email: '', postcode: '',
            preferredDateOption: '', preferredDate: '',
            furnished: '', floor: '', accessType: '', accessRestrictions: '', parking: '',
            problemAreas: '',
            abcExtent: '', abcTradesFinished: '', abcResidueNotes: '',
            consent: false
        }
    };
}

let state = freshState();
let stepHistory = ['service'];
let analyticsFlags = {};
let editMode = false;
let selectedPhotos = [];

function getStateValue(path){ return getByPath(state, path); }
function setStateValue(path, value){ setByPath(state, path, value); }

// -------------------------------
// Calculation engine
// -------------------------------

function ceilToNearest(value, step){
    const epsilon = 1e-6;
    return Math.round((Math.ceil((value - epsilon) / step) * step) * 100) / 100;
}

function calcLabourHours(){
    const svc = state.service;
    const labour = CONFIG.labour[svc];
    const isStudio = state.bedroomsOption === 'studio';
    const bedroomsCount = isStudio ? 0 : Number(state.bedroomsOption);

    const kitchen = labour.kitchen - (isStudio ? CONFIG.studioReduction.kitchen : 0);
    const living = labour.living - (isStudio ? CONFIG.studioReduction.living : 0);

    const roomsCfg = CONFIG.additionalRooms[svc];

    let hours = kitchen
        + labour.bathroom * state.bathrooms
        + labour.bedroom * bedroomsCount
        + living
        + labour.hall
        + labour.additionalWC * state.wcs
        + labour.incidentals
        + labour.stairs * (state.stairsFlights || 0)
        + roomsCfg.dining * state.additionalRooms.dining
        + roomsCfg.office * state.additionalRooms.office
        + roomsCfg.utility * state.additionalRooms.utility
        + roomsCfg.other * state.additionalRooms.other;

    if(svc === 'reset' || svc === 'resetPlus'){
        hours *= CONFIG.conditionMultipliers[state.condition];
    }

    return hours;
}

function computeEstimate(){
    const hours = calcLabourHours();
    const rate = CONFIG.rates[state.service];
    const internal = hours * rate;
    state.estimate = {
        hours,
        internal,
        from: ceilToNearest(internal, CONFIG.roundTo),
        to: ceilToNearest(internal * CONFIG.rangeUplift, CONFIG.roundTo)
    };
}

function calcRestoreEstimate(){
    const r = CONFIG.restore;
    const a = state.restoreAreas;
    let total = a.bedroom * r.bedroom + a.living * r.living + a.dining * r.dining + a.hallway * r.hallway + a.landing * r.landing;

    if(a.stairsSteps > 0){
        total += r.stairsBase;
        const extraSteps = Math.max(0, a.stairsSteps - r.stairsBaseSteps);
        total += extraSteps * r.additionalStairEach;
    }

    if(state.restoreStandalone){
        total = Math.max(total, r.standaloneMinimum);
    }

    return Math.round(total);
}

function computeRestoreEstimate(){
    state.restoreEstimate = calcRestoreEstimate();
}

// -------------------------------
// Analytics (stub — wire to a real provider as needed)
// -------------------------------

function track(name, data){
    console.log('[analytics]', name, data || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, data || {}));
}

function fireStepAnalytics(key){
    if(key === 'service' && !analyticsFlags.started){
        track('estimator_started');
        analyticsFlags.started = true;
    }
    if((key === 'estimate' || key === 'bespoke') && !analyticsFlags.estimateShown){
        track('estimate_displayed', { service: state.service, bespoke: key === 'bespoke' });
        analyticsFlags.estimateShown = true;
    }
    if(key === 'stage2' && !analyticsFlags.stage2Started){
        track('stage2_started');
        analyticsFlags.stage2Started = true;
    }
}

// -------------------------------
// Escaping helper (prevents free-text answers from being rendered as HTML)
// -------------------------------

function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// -------------------------------
// Reusable field templates
// -------------------------------

function counterRow(path, label, opts){
    opts = opts || {};
    const min = opts.min !== undefined ? opts.min : 0;
    const max = opts.max !== undefined ? opts.max : 20;
    const hint = opts.hint || '';
    const value = getStateValue(path);
    return `<div class="counter-row">
        <span class="counter-label">${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span>
        <div class="counter compact">
            <button type="button" data-action="counter-dec" data-path="${path}" data-min="${min}">−</button>
            <span data-counter-display="${path}">${value}</span>
            <button type="button" data-action="counter-inc" data-path="${path}" data-max="${max}">+</button>
        </div>
    </div>`;
}

function numberField(path, label, opts){
    opts = opts || {};
    const min = opts.min !== undefined ? opts.min : 0;
    const max = opts.max !== undefined ? opts.max : 999;
    const hint = opts.hint || '';
    const value = getStateValue(path);
    return `<div class="form-group">
        <label>${label}</label>
        <input type="number" data-path="${path}" min="${min}" max="${max}" value="${value === '' ? '' : value}">
        ${hint ? `<span class="hint">${hint}</span>` : ''}
    </div>`;
}

function textField(path, label, opts){
    opts = opts || {};
    const type = opts.type || 'text';
    const required = !!opts.required;
    const value = getStateValue(path) || '';
    return `<div class="form-group">
        <label>${escapeHTML(label)}${required ? ' *' : ''}</label>
        <input type="${type}" data-path="${path}" value="${escapeHTML(value)}">
    </div>`;
}

function selectField(path, label, options, opts){
    opts = opts || {};
    const required = !!opts.required;
    const value = getStateValue(path) || '';
    return `<div class="form-group">
        <label>${escapeHTML(label)}${required ? ' *' : ''}</label>
        <select data-path="${path}">
            ${options.map(o => `<option value="${escapeHTML(o)}" ${o === value ? 'selected' : ''}>${o === '' ? 'Select…' : escapeHTML(o)}</option>`).join('')}
        </select>
    </div>`;
}

// -------------------------------
// Logo (replaces prototype emoji icons)
// -------------------------------

function logoIcon(){
    return `<img src="assets/gleamly-logo.png" alt="Gleamly" class="logo-icon">`;
}

// -------------------------------
// Photo uploads (final quote stage)
// -------------------------------

function renderPhotoPreview(){
    if(!selectedPhotos.length) return '';
    return selectedPhotos.map(f => `<div class="photo-thumb"><img src="${URL.createObjectURL(f)}" alt="${escapeHTML(f.name)}"></div>`).join('');
}
function renderPhotoPreviewInto(){
    const el = stepContainer.querySelector('#photoPreview');
    if(el) el.innerHTML = renderPhotoPreview();
}

function textareaField(path, label){
    const value = getStateValue(path) || '';
    return `<div class="form-group">
        <label>${escapeHTML(label)}</label>
        <textarea data-path="${path}">${escapeHTML(value)}</textarea>
    </div>`;
}

// -------------------------------
// Summary of Stage 1 answers, carried into Stage 2 automatically
// -------------------------------

function summaryRow(label, value, editStep){
    const editBtn = editStep ? `<button type="button" class="summary-edit-btn" data-action="edit-answer" data-target-step="${editStep}">Edit</button>` : '';
    return `<li><strong>${label}:</strong> ${value}${editBtn}</li>`;
}

function summaryHTML(){
    const rows = [];
    rows.push(summaryRow('Service', escapeHTML(SERVICE_META[state.service].name)));

    if(state.service !== 'restore'){
        rows.push(summaryRow('Property type', state.propertyType === 'house' ? 'House' : 'Flat/Apartment', 'propertyType'));
        rows.push(summaryRow('Bedrooms', BEDROOM_LABELS[state.bedroomsOption] || '—', 'bedrooms'));
        if(state.bedroomsOption !== '5+'){
            const stairs = state.stairsFlights || 0;
            rows.push(summaryRow(
                'Bathrooms &amp; WCs',
                `${state.bathrooms} bathroom${state.bathrooms === 1 ? '' : 's'}, ${state.wcs} WC${state.wcs === 1 ? '' : 's'}, ${stairs} internal staircase${stairs === 1 ? '' : 's'}`,
                'bathrooms'
            ));

            const r = state.additionalRooms;
            const roomParts = [];
            if(r.dining) roomParts.push(`${r.dining} dining`);
            if(r.office) roomParts.push(`${r.office} office`);
            if(r.utility) roomParts.push(`${r.utility} utility`);
            if(r.other) roomParts.push(`${r.other} other`);
            rows.push(summaryRow('Additional rooms', roomParts.join(', ') || 'None', 'additionalRooms'));

            if(state.condition){
                const meta = state.service === 'abc' ? ABC_CONDITION_META : CONDITION_META;
                rows.push(summaryRow('Condition', escapeHTML(meta[state.condition].title), 'condition'));
            }
        }
    } else {
        const a = state.restoreAreas;
        const parts = [];
        if(a.bedroom) parts.push(`${a.bedroom} bedroom`);
        if(a.living) parts.push(`${a.living} living room`);
        if(a.dining) parts.push(`${a.dining} dining room`);
        if(a.hallway) parts.push(`${a.hallway} hallway`);
        if(a.landing) parts.push(`${a.landing} landing`);
        if(a.stairsSteps) parts.push(`${a.stairsSteps} stair steps`);
        rows.push(summaryRow('Areas selected', parts.join(', ') || '—', 'restoreAreas'));
        rows.push(summaryRow('Stains / concerns', state.stains === 'yes' ? 'Yes' : 'No', 'restoreConcern'));
    }

    if(state.service === 'restore'){
        rows.push(summaryRow('Estimated price', `£${state.restoreEstimate || 0}`));
    } else if(state.bespokeReason){
        rows.push(summaryRow('Estimated price', 'Bespoke — to be confirmed'));
    } else if(state.estimate){
        rows.push(summaryRow('Estimated price', `£${state.estimate.from} — £${state.estimate.to}`));
    }

    return `<div class="summary-box"><h3>Your answers so far</h3><ul>${rows.join('')}</ul></div>`;
}

function bespokeMessage(){
    if(state.bedroomsOption === '5+'){
        return 'For your property we will need to provide you with a bespoke estimate. Please fill in the required details and we will get back to you.';
    }
    return 'Your property needs a closer look before we can price it automatically. Please fill in the required details below and our team will get back to you with a bespoke estimate.';
}

// -------------------------------
// Step templates
// -------------------------------

const TEMPLATES = {

    service: () => `
        <div class="hero-icon">${logoIcon()}</div>
        <h1>Gleamly Instant Estimate</h1>
        <p>Get an instant price range in about a minute — no contact details needed.</p>
        <div class="form-errors" id="formErrors" hidden></div>
        <div class="cards cols-2">
            ${Object.entries(SERVICE_META).map(([key, meta]) => `
                <label>
                    <input type="radio" name="service" data-path="service" value="${key}" ${state.service === key ? 'checked' : ''}>
                    <div class="card-option">${escapeHTML(meta.name)}<small>${escapeHTML(meta.desc)}</small></div>
                </label>
            `).join('')}
        </div>
        <div class="buttons"><button class="next" data-action="next">Continue</button></div>
    `,

    propertyType: () => `
        <h2>What type of property is it?</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        <div class="cards cols-2">
            <label><input type="radio" name="propertyType" data-path="propertyType" value="flat" ${state.propertyType === 'flat' ? 'checked' : ''}><div class="card-option">Flat / Apartment</div></label>
            <label><input type="radio" name="propertyType" data-path="propertyType" value="house" ${state.propertyType === 'house' ? 'checked' : ''}><div class="card-option">House</div></label>
        </div>
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    bedrooms: () => `
        <h2>How many bedrooms?</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        <div class="cards">
            ${BEDROOM_OPTIONS.map(opt => `
                <label><input type="radio" name="bedrooms" data-path="bedroomsOption" value="${opt}" ${state.bedroomsOption === opt ? 'checked' : ''}><div class="card-option">${BEDROOM_LABELS[opt]}</div></label>
            `).join('')}
        </div>
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    bathrooms: () => `
        <h2>Bathrooms &amp; WCs</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        ${counterRow('bathrooms', 'Bathrooms', { min: 1, max: 10 })}
        ${counterRow('wcs', 'Separate WCs', { min: 0, max: 10, hint: 'A WC with no bath or shower.' })}
        ${counterRow('stairsFlights', 'Internal staircase', { min: 0, max: 5, hint: 'Internal staircases within the property.' })}
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    additionalRooms: () => `
        <h2>Any additional rooms?</h2>
        <p>Leave at 0 if not applicable.</p>
        <p>The instant estimate assumes one kitchen and one living space.</p>
        ${counterRow('additionalRooms.dining', 'Dining / additional reception room')}
        ${counterRow('additionalRooms.office', 'Office / study')}
        ${counterRow('additionalRooms.utility', 'Utility room')}
        ${counterRow('additionalRooms.other', 'Other room')}
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    condition: () => {
        const isAbc = state.service === 'abc';
        const meta = isAbc ? ABC_CONDITION_META : CONDITION_META;
        const name = isAbc ? 'abcCondition' : 'condition';
        return `
            <h2>What's the current condition?</h2>
            <div class="form-errors" id="formErrors" hidden></div>
            <div class="condition-list">
                ${Object.entries(meta).map(([key, m]) => `
                    <label><input type="radio" name="${name}" data-path="condition" value="${key}" ${state.condition === key ? 'checked' : ''}>
                    <div class="condition-option"><h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.desc)}</p></div></label>
                `).join('')}
            </div>
            <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
        `;
    },

    restoreAreas: () => `
        <h2>Which areas need cleaning?</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        ${counterRow('restoreAreas.bedroom', `Bedroom <span class="hint">£${CONFIG.restore.bedroom} each</span>`)}
        ${counterRow('restoreAreas.living', `Living room <span class="hint">£${CONFIG.restore.living} each</span>`)}
        ${counterRow('restoreAreas.dining', `Dining room <span class="hint">£${CONFIG.restore.dining} each</span>`)}
        ${counterRow('restoreAreas.hallway', `Hallway <span class="hint">£${CONFIG.restore.hallway} each</span>`)}
        ${counterRow('restoreAreas.landing', `Landing <span class="hint">£${CONFIG.restore.landing} each</span>`)}
        ${numberField('restoreAreas.stairsSteps', 'Stairs — number of steps', { min: 0, max: 60, hint: `First ${CONFIG.restore.stairsBaseSteps} steps £${CONFIG.restore.stairsBase}, then £${CONFIG.restore.additionalStairEach} per extra step.` })}
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    restoreConcern: () => `
        <h2>Stains or areas of concern?</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        <div class="cards cols-2">
            <label><input type="radio" name="stains" data-path="stains" value="yes" ${state.stains === 'yes' ? 'checked' : ''}><div class="card-option">Yes</div></label>
            <label><input type="radio" name="stains" data-path="stains" value="no" ${state.stains === 'no' ? 'checked' : ''}><div class="card-option">No</div></label>
        </div>
        <div class="form-group" id="concernNotesGroup" ${state.stains === 'yes' ? '' : 'hidden'}>
            <label>Tell us more (optional)</label>
            <textarea data-path="concernNotes" placeholder="e.g. red wine stain in the living room carpet">${escapeHTML(state.concernNotes)}</textarea>
        </div>
        <p class="hint" style="text-align:center;">You'll be able to add photos when you request your final quote.</p>
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue</button></div>
    `,

    bespoke: () => `
        <div class="bespoke-icon">${logoIcon()}</div>
        <h2>We'll prepare a bespoke estimate</h2>
        <p>${escapeHTML(bespokeMessage())}</p>
        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Continue to bespoke quote form</button></div>
    `,

    estimate: () => {
        if(state.service === 'restore'){
            const amount = state.restoreEstimate || 0;
            const atMinimum = state.restoreStandalone && amount === CONFIG.restore.standaloneMinimum;
            return `
                <h2>Your Gleamly estimate</h2>
                <div class="price">£${amount}</div>
                <p>Based on the areas you've selected, this is our estimated Restore price. This is an initial estimate, not a final quotation — if we identify staining or treatment needs from what you've told us, our team will confirm any adjustment before your visit.</p>
                ${atMinimum ? `<p class="hint" style="text-align:center;">A £${CONFIG.restore.standaloneMinimum} minimum booking applies to standalone Restore visits.</p>` : ''}
                <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">I'd like a final quote</button></div>
            `;
        }
        const est = state.estimate || { from: 0, to: 0 };
        return `
            <h2>Your Gleamly estimate</h2>
            <div class="price">£${est.from} — £${est.to}</div>
            <p>Based on the information you've provided, we estimate your clean will fall within this range. This is an initial estimate, not a final quotation. Your confirmed price will depend on the actual condition of the property, the full cleaning requirements, access, parking and any additional requirements identified from the information you provide.</p>
            <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">I'd like a final quote</button></div>
        `;
    },

    stage2: () => `
        <h2>A few details for your final quote</h2>
        <div class="form-errors" id="formErrors" hidden></div>
        ${summaryHTML()}

        <p class="hint" style="text-align:left;">By entering your contact details below you agree to our <a href="#privacy-notice" target="_blank" rel="noopener">Privacy Notice</a>.</p>

        <div class="form-row">
            ${textField('stage2.name', 'Full name', { required: true })}
            ${textField('stage2.mobile', 'Mobile number', { type: 'tel', required: true })}
        </div>
        <div class="form-row">
            ${textField('stage2.email', 'Email', { type: 'email', required: true })}
            ${textField('stage2.postcode', 'Property postcode', { required: true })}
        </div>

        <div class="form-group">
            <label>Preferred cleaning date *</label>
            <select data-path="stage2.preferredDateOption">
                <option value="">Select…</option>
                <option value="date" ${state.stage2.preferredDateOption === 'date' ? 'selected' : ''}>Choose a date</option>
                <option value="flexible" ${state.stage2.preferredDateOption === 'flexible' ? 'selected' : ''}>Flexible</option>
                <option value="undecided" ${state.stage2.preferredDateOption === 'undecided' ? 'selected' : ''}>Not decided yet</option>
            </select>
        </div>
        <div class="form-group" id="preferredDateGroup" ${state.stage2.preferredDateOption === 'date' ? '' : 'hidden'}>
            <label>Date</label>
            <input type="date" data-path="stage2.preferredDate" value="${escapeHTML(state.stage2.preferredDate || '')}">
        </div>

        ${state.service !== 'restore' ? `
            ${selectField('stage2.furnished', 'Furnished or unfurnished?', ['', 'Furnished', 'Unfurnished', 'Not applicable'])}
        ` : ''}

        ${state.service === 'abc' ? `
            ${textareaField('stage2.abcExtent', 'Extent / type of building work')}
            <div class="form-group">
                <label>Are all trades finished?</label>
                <div class="cards cols-2">
                    <label><input type="radio" name="tradesFinished" data-path="stage2.abcTradesFinished" value="yes" ${state.stage2.abcTradesFinished === 'yes' ? 'checked' : ''}><div class="card-option">Yes</div></label>
                    <label><input type="radio" name="tradesFinished" data-path="stage2.abcTradesFinished" value="no" ${state.stage2.abcTradesFinished === 'no' ? 'checked' : ''}><div class="card-option">No</div></label>
                </div>
            </div>
            ${textareaField('stage2.abcResidueNotes', 'Any residues or issues we should know about?')}
        ` : ''}

        ${selectField('stage2.floor', 'Floor', ['', 'Ground floor', 'First floor', 'Second floor', 'Third floor or above'], { required: true })}
        ${selectField('stage2.accessType', 'Access', ['', 'Ground floor / no stairs', 'Stairs only', 'Lift available', 'Other access restriction'], { required: true })}
        <div class="info-note" id="accessOtherNote" ${state.stage2.accessType === 'Other access restriction' ? '' : 'hidden'}>Please provide details in the 'anything else we should know box below'</div>
        ${textareaField('stage2.accessRestrictions', 'Any access restrictions?')}
        ${selectField('stage2.parking', 'Parking', ['', 'Free parking or driveway', 'Paid on-street parking', 'Permit required', 'Restricted or no nearby parking', 'Not sure'], { required: true })}
        ${textareaField('stage2.problemAreas', 'Problem areas or anything else we should know')}

        <div class="form-group">
            <label>Photos (optional)</label>
            <input type="file" id="stage2PhotoInput" accept="image/*" multiple>
            <span class="hint">Add photos from your camera or photo gallery — you can select more than one.</span>
            <div class="photo-preview" id="photoPreview">${renderPhotoPreview()}</div>
        </div>

        <div class="form-group">
            <p style="font-size:12px;color:#64748b;text-align:left;margin-top:0;">We'll use these details to prepare your final quotation, in line with our <a href="#privacy-notice" target="_blank" rel="noopener">Privacy Notice</a>. We won't use your details for marketing.</p>
            <label class="checkbox-row"><input type="checkbox" data-path="stage2.consent" ${state.stage2.consent ? 'checked' : ''}><span>I agree to Gleamly contacting me about this enquiry using the details above.</span></label>
        </div>

        <div class="buttons"><button class="back" data-action="back">Back</button><button class="next" data-action="next">Send my request</button></div>
    `,

    confirmation: () => `
        <div class="hero-icon">${logoIcon()}</div>
        <h2>Thanks — your request has been received</h2>
        <p>Gleamly has received your enquiry${state.stage2.name ? `, ${escapeHTML(state.stage2.name)}` : ''}. Our team will review the details and confirm your final quotation shortly.</p>
        ${state.lastEnquiryId ? `<p class="hint" style="text-align:center;">Reference: ${escapeHTML(state.lastEnquiryId)}</p>` : ''}
        <div class="buttons"><button class="next" data-action="restart">Start a new estimate</button></div>
    `
};

// -------------------------------
// Step flow
// -------------------------------

function currentStepKey(){ return stepHistory[stepHistory.length - 1]; }

function nextStepKey(key){
    switch(key){
        case 'service': return state.service === 'restore' ? 'restoreAreas' : 'propertyType';
        case 'propertyType': return 'bedrooms';
        case 'bedrooms': return state.bedroomsOption === '5+' ? 'bespoke' : 'bathrooms';
        case 'bathrooms': return 'additionalRooms';
        case 'additionalRooms': return 'condition';
        case 'condition': return (state.service === 'abc' && state.condition !== 'standard') ? 'bespoke' : 'estimate';
        case 'restoreAreas': return 'restoreConcern';
        case 'restoreConcern': return 'estimate';
        case 'estimate': return 'stage2';
        case 'bespoke': return 'stage2';
        case 'stage2': return 'confirmation';
        default: return 'service';
    }
}

function submitEnquiryRecord(){
    const id = 'GLM-' + Date.now().toString(36).toUpperCase();
    state.lastEnquiryId = id;

    const record = {
        id,
        submittedAt: new Date().toISOString(),
        service: state.service,
        stage1: {
            propertyType: state.propertyType,
            bedroomsOption: state.bedroomsOption,
            bathrooms: state.bathrooms,
            wcs: state.wcs,
            stairsFlights: state.stairsFlights,
            additionalRooms: Object.assign({}, state.additionalRooms),
            condition: state.condition,
            restoreAreas: Object.assign({}, state.restoreAreas),
            stains: state.stains,
            concernNotes: state.concernNotes
        },
        estimate: state.service === 'restore'
            ? { type: 'restore', amount: state.restoreEstimate }
            : (state.bespokeReason ? { type: 'bespoke', reason: state.bespokeReason } : { type: 'range', from: state.estimate.from, to: state.estimate.to }),
        stage2: Object.assign({}, state.stage2),
        photos: selectedPhotos.map(f => f.name)
    };

    try{
        const existing = JSON.parse(localStorage.getItem('gleamlyEnquiries') || '[]');
        existing.push(record);
        localStorage.setItem('gleamlyEnquiries', JSON.stringify(existing));
    }catch(e){ /* storage unavailable — enquiry still logged below */ }

    // In production this would call a backend endpoint to email/notify the
    // Gleamly office (name, mobile, service, postcode, date, estimate) and
    // persist the full structured record. No backend exists in this static
    // build, so we log it instead.
    console.log('New Gleamly enquiry received (would notify office system):', record);

    track('final_quote_submitted', { service: state.service, id });
}

function handleSideEffects(key){
    if(key === 'bedrooms'){
        state.bespokeReason = state.bedroomsOption === '5+' ? 'bedrooms' : null;
    }
    if(key === 'condition'){
        if(state.service === 'abc' && state.condition !== 'standard'){
            state.bespokeReason = 'abc';
        } else {
            state.bespokeReason = null;
            computeEstimate();
        }
    }
    if(key === 'restoreConcern'){
        computeRestoreEstimate();
    }
    if(key === 'stage2'){
        submitEnquiryRecord();
    }
}

// -------------------------------
// Validation
// -------------------------------

function validateStep(key){
    const errors = [];
    switch(key){
        case 'service':
            if(!state.service) errors.push('Please select a service to continue.');
            break;
        case 'propertyType':
            if(!state.propertyType) errors.push('Please select a property type.');
            break;
        case 'bedrooms':
            if(!state.bedroomsOption) errors.push('Please select the number of bedrooms.');
            break;
        case 'condition':
            if(!state.condition) errors.push('Please select the property condition.');
            break;
        case 'restoreAreas': {
            const a = state.restoreAreas;
            const total = a.bedroom + a.living + a.dining + a.hallway + a.landing + a.stairsSteps;
            if(total <= 0) errors.push('Please select at least one area to clean.');
            break;
        }
        case 'restoreConcern':
            if(!state.stains) errors.push('Please let us know if there are any stains or areas of concern.');
            break;
        case 'stage2':
            return validateStage2();
        default:
            break;
    }
    return { valid: errors.length === 0, errors };
}

function validateStage2(){
    const errors = [];
    const s = state.stage2;
    if(!s.name || !s.name.trim()) errors.push('Please enter your name.');
    if(!s.mobile || !/^[0-9+()\-\s]{7,20}$/.test(s.mobile.trim())) errors.push('Please enter a valid mobile number.');
    if(!s.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) errors.push('Please enter a valid email address.');
    if(!s.postcode || !s.postcode.trim()) errors.push('Please enter the property postcode.');
    if(!s.preferredDateOption) errors.push('Please choose a preferred cleaning date option.');
    else if(s.preferredDateOption === 'date' && !s.preferredDate) errors.push('Please choose a preferred cleaning date.');
    if(!s.floor) errors.push('Please select the property floor.');
    if(!s.accessType) errors.push('Please select the access details.');
    if(!s.parking) errors.push('Please select the parking option.');
    if(!s.consent) errors.push('Please confirm you agree to be contacted about this enquiry.');
    return { valid: errors.length === 0, errors };
}

// -------------------------------
// Rendering
// -------------------------------

const stepContainer = document.getElementById('stepContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

function renderCurrent(){
    const key = currentStepKey();
    stepContainer.innerHTML = TEMPLATES[key]();
    updateProgress(key);
    fireStepAnalytics(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress(key){
    const w = STEP_WEIGHTS[key] || 1;
    progressBar.style.width = Math.min(100, (w / TOTAL_WEIGHT) * 100) + '%';
    progressText.textContent = STEP_LABELS[key] || '';
}

function showErrors(errors){
    const box = document.getElementById('formErrors');
    if(!box) return;
    box.hidden = false;
    box.innerHTML = `<ul>${errors.map(e => `<li>${escapeHTML(e)}</li>`).join('')}</ul>`;
    if(box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hideErrors(){
    const box = document.getElementById('formErrors');
    if(box){ box.hidden = true; box.innerHTML = ''; }
}

function goTo(key){
    stepHistory.push(key);
    renderCurrent();
}
function goBack(){
    editMode = false;
    if(stepHistory.length > 1){
        stepHistory.pop();
        renderCurrent();
    }
}
function restart(){
    state = freshState();
    stepHistory = ['service'];
    analyticsFlags = {};
    editMode = false;
    selectedPhotos = [];
    renderCurrent();
}

function editAnswer(step){
    editMode = true;
    goTo(step);
}

function attemptAdvance(){
    const key = currentStepKey();
    const result = validateStep(key);
    if(!result.valid){
        showErrors(result.errors);
        return;
    }
    hideErrors();
    handleSideEffects(key);

    if(editMode){
        editMode = false;
        if(state.service === 'restore'){
            computeRestoreEstimate();
        } else if(!state.bespokeReason){
            computeEstimate();
        }
        goTo('stage2');
        return;
    }

    goTo(nextStepKey(key));
}

// -------------------------------
// Event delegation
// -------------------------------

function adjustCounter(btn, dir){
    const path = btn.dataset.path;
    const limit = dir > 0 ? parseFloat(btn.dataset.max) : parseFloat(btn.dataset.min);
    let v = getStateValue(path);
    const next = dir > 0 ? v + 1 : v - 1;
    if(dir > 0 && next > limit) return;
    if(dir < 0 && next < limit) return;
    setStateValue(path, next);
    const display = stepContainer.querySelector(`[data-counter-display="${path}"]`);
    if(display) display.textContent = next;
}

function handleContainerClick(e){
    const backBtn = e.target.closest('[data-action="back"]');
    if(backBtn){ goBack(); return; }

    const nextBtn = e.target.closest('[data-action="next"]');
    if(nextBtn){ attemptAdvance(); return; }

    const restartBtn = e.target.closest('[data-action="restart"]');
    if(restartBtn){ restart(); return; }

    const decBtn = e.target.closest('[data-action="counter-dec"]');
    if(decBtn){ adjustCounter(decBtn, -1); return; }

    const incBtn = e.target.closest('[data-action="counter-inc"]');
    if(incBtn){ adjustCounter(incBtn, 1); return; }

    const editBtn = e.target.closest('[data-action="edit-answer"]');
    if(editBtn){ editAnswer(editBtn.dataset.targetStep); return; }
}

function handleFieldSync(e){
    const t = e.target;

    if(t.id === 'stage2PhotoInput'){
        Array.from(t.files || []).forEach(f => selectedPhotos.push(f));
        renderPhotoPreviewInto();
        return;
    }

    if(!t.dataset || t.dataset.path === undefined) return;

    let value;
    if(t.type === 'checkbox') value = t.checked;
    else if(t.type === 'number') value = t.value === '' ? '' : Number(t.value);
    else value = t.value;

    setStateValue(t.dataset.path, value);

    if(t.dataset.path === 'stains'){
        const group = document.getElementById('concernNotesGroup');
        if(group) group.hidden = (value !== 'yes');
    }

    if(t.dataset.path === 'propertyType'){
        state.stairsFlights = value === 'house' ? 1 : 0;
    }

    if(t.dataset.path === 'stage2.preferredDateOption'){
        const group = document.getElementById('preferredDateGroup');
        if(group) group.hidden = (value !== 'date');
    }

    if(t.dataset.path === 'stage2.accessType'){
        const note = document.getElementById('accessOtherNote');
        if(note) note.hidden = (value !== 'Other access restriction');
    }
}

stepContainer.addEventListener('click', handleContainerClick);
stepContainer.addEventListener('input', handleFieldSync);
stepContainer.addEventListener('change', handleFieldSync);

// -------------------------------
// Admin panel (pricing variables editable without touching source code)
// -------------------------------

const ADMIN_FIELDS = [
    { section: 'Hourly rates (£)', fields: [
        ['rates.reset', 'Reset'], ['rates.resetPlus', 'Reset Plus'], ['rates.abc', 'ABC']
    ]},
    { section: 'Condition multipliers (Reset / Reset Plus)', fields: [
        ['conditionMultipliers.average', 'Average'], ['conditionMultipliers.attention', 'Needs extra attention'], ['conditionMultipliers.heavy', 'Heavy']
    ]},
    { section: 'Labour hours — Reset', fields: [
        ['labour.reset.kitchen', 'Kitchen'], ['labour.reset.bathroom', 'Bathroom (each)'], ['labour.reset.bedroom', 'Bedroom (each)'],
        ['labour.reset.living', 'Living room'], ['labour.reset.hall', 'Hall/landing'], ['labour.reset.stairs', 'Per staircase'],
        ['labour.reset.additionalWC', 'Additional WC'], ['labour.reset.incidentals', 'Incidentals']
    ]},
    { section: 'Labour hours — Reset Plus', fields: [
        ['labour.resetPlus.kitchen', 'Kitchen'], ['labour.resetPlus.bathroom', 'Bathroom (each)'], ['labour.resetPlus.bedroom', 'Bedroom (each)'],
        ['labour.resetPlus.living', 'Living room'], ['labour.resetPlus.hall', 'Hall/landing'], ['labour.resetPlus.stairs', 'Per staircase'],
        ['labour.resetPlus.additionalWC', 'Additional WC'], ['labour.resetPlus.incidentals', 'Incidentals']
    ]},
    { section: 'Labour hours — ABC', fields: [
        ['labour.abc.kitchen', 'Kitchen'], ['labour.abc.bathroom', 'Bathroom (each)'], ['labour.abc.bedroom', 'Bedroom (each)'],
        ['labour.abc.living', 'Living room'], ['labour.abc.hall', 'Hall/landing'], ['labour.abc.stairs', 'Per staircase'],
        ['labour.abc.additionalWC', 'Additional WC'], ['labour.abc.incidentals', 'Incidentals']
    ]},
    { section: 'Additional rooms — Reset', fields: [
        ['additionalRooms.reset.dining', 'Dining/reception'], ['additionalRooms.reset.office', 'Office/study'],
        ['additionalRooms.reset.utility', 'Utility'], ['additionalRooms.reset.other', 'Other']
    ]},
    { section: 'Additional rooms — Reset Plus', fields: [
        ['additionalRooms.resetPlus.dining', 'Dining/reception'], ['additionalRooms.resetPlus.office', 'Office/study'],
        ['additionalRooms.resetPlus.utility', 'Utility'], ['additionalRooms.resetPlus.other', 'Other']
    ]},
    { section: 'Additional rooms — ABC', fields: [
        ['additionalRooms.abc.dining', 'Dining/reception'], ['additionalRooms.abc.office', 'Office/study'],
        ['additionalRooms.abc.utility', 'Utility'], ['additionalRooms.abc.other', 'Other']
    ]},
    { section: 'Studio reductions', fields: [
        ['studioReduction.kitchen', 'Kitchen reduction'], ['studioReduction.living', 'Living room reduction']
    ]},
    { section: 'Range & rounding', fields: [
        ['rangeUplift', 'Range uplift multiplier'], ['roundTo', 'Round up to nearest (£)']
    ]},
    { section: 'Restore pricing (£)', fields: [
        ['restore.bedroom', 'Bedroom'], ['restore.living', 'Living room'], ['restore.dining', 'Dining room'],
        ['restore.hallway', 'Hallway'], ['restore.landing', 'Landing'], ['restore.stairsBase', 'Stairs (base)'],
        ['restore.stairsBaseSteps', 'Steps included in base'], ['restore.additionalStairEach', 'Additional step each'],
        ['restore.standaloneMinimum', 'Standalone minimum booking']
    ]}
];

const adminModal = document.getElementById('adminModal');
const adminFieldsEl = document.getElementById('adminFields');

function renderAdminFields(){
    adminFieldsEl.innerHTML = ADMIN_FIELDS.map(section => `
        <div class="admin-section">
            <h4>${escapeHTML(section.section)}</h4>
            ${section.fields.map(([path, label]) => `
                <div class="admin-field">
                    <label>${escapeHTML(label)}</label>
                    <input type="number" step="0.01" data-admin-path="${path}" value="${getByPath(CONFIG, path)}">
                </div>
            `).join('')}
        </div>
    `).join('');
}

document.getElementById('adminToggle').addEventListener('click', () => {
    renderAdminFields();
    adminModal.hidden = false;
});
document.getElementById('adminClose').addEventListener('click', () => { adminModal.hidden = true; });
adminModal.addEventListener('click', (e) => { if(e.target === adminModal) adminModal.hidden = true; });

document.getElementById('adminSave').addEventListener('click', () => {
    adminFieldsEl.querySelectorAll('input[data-admin-path]').forEach(inp => {
        const num = parseFloat(inp.value);
        if(!Number.isNaN(num)) setByPath(CONFIG, inp.dataset.adminPath, num);
    });
    saveConfig();
    adminModal.hidden = true;
    renderCurrent();
});
document.getElementById('adminReset').addEventListener('click', () => {
    if(!confirm('Reset all pricing variables to their original defaults?')) return;
    CONFIG = deepClone(DEFAULT_CONFIG);
    saveConfig();
    renderAdminFields();
    renderCurrent();
});

// -------------------------------
// Initialize
// -------------------------------

renderCurrent();
