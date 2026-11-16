// ===============================
// Gleamly pricing admin
// Not linked from anywhere in the customer-facing site. Access control is
// enforced server-side by /api/admin/login and /api/admin/pricing (see
// functions/api/admin/) — this page has no real protection of its own, it
// just won't show any pricing data until the server confirms a valid
// session. Guessing this URL gets you a login form and nothing else.
// ===============================

'use strict';

function getByPath(obj, path){
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setByPath(obj, path, value){
    const parts = path.split('.');
    let o = obj;
    for(let i = 0; i < parts.length - 1; i++){
        if(!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
}
function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Mirrors the CONFIG shape in script.js. Every numeric value a business
// owner might reasonably want to tweak lives here — add a new entry if
// script.js's CONFIG grows a field that should be editable too.
const ADMIN_FIELDS = [
    { title: 'Hourly rates (£/hour)', fields: [
        { path: 'rates.reset', label: 'Gleamly Reset' },
        { path: 'rates.resetPlus', label: 'Reset Plus' },
        { path: 'rates.abc', label: 'ABC' }
    ]},
    { title: 'Condition multipliers', fields: [
        { path: 'conditionMultipliers.average', label: 'Average' },
        { path: 'conditionMultipliers.attention', label: 'Needs extra attention' },
        { path: 'conditionMultipliers.heavy', label: 'Heavy cleaning required' }
    ]},
    { title: 'Reset — labour hours', fields: [
        { path: 'labour.reset.kitchen', label: 'Kitchen' },
        { path: 'labour.reset.bathroom', label: 'Bathroom (each)' },
        { path: 'labour.reset.bedroom', label: 'Bedroom (each)' },
        { path: 'labour.reset.living', label: 'Living room' },
        { path: 'labour.reset.hall', label: 'Hall' },
        { path: 'labour.reset.stairs', label: 'Staircase (each)' },
        { path: 'labour.reset.additionalWC', label: 'Additional WC (each)' },
        { path: 'labour.reset.incidentals', label: 'Incidentals' }
    ]},
    { title: 'Reset Plus — labour hours', fields: [
        { path: 'labour.resetPlus.kitchen', label: 'Kitchen' },
        { path: 'labour.resetPlus.bathroom', label: 'Bathroom (each)' },
        { path: 'labour.resetPlus.bedroom', label: 'Bedroom (each)' },
        { path: 'labour.resetPlus.living', label: 'Living room' },
        { path: 'labour.resetPlus.hall', label: 'Hall' },
        { path: 'labour.resetPlus.stairs', label: 'Staircase (each)' },
        { path: 'labour.resetPlus.additionalWC', label: 'Additional WC (each)' },
        { path: 'labour.resetPlus.incidentals', label: 'Incidentals' }
    ]},
    { title: 'ABC — labour hours', fields: [
        { path: 'labour.abc.kitchen', label: 'Kitchen' },
        { path: 'labour.abc.bathroom', label: 'Bathroom (each)' },
        { path: 'labour.abc.bedroom', label: 'Bedroom (each)' },
        { path: 'labour.abc.living', label: 'Living room' },
        { path: 'labour.abc.hall', label: 'Hall' },
        { path: 'labour.abc.additionalWC', label: 'Additional WC (each)' },
        { path: 'labour.abc.incidentals', label: 'Incidentals' }
    ]},
    { title: 'Additional rooms — Reset (hours each)', fields: [
        { path: 'additionalRooms.reset.dining', label: 'Dining / additional reception' },
        { path: 'additionalRooms.reset.office', label: 'Office / study' },
        { path: 'additionalRooms.reset.utility', label: 'Utility room' },
        { path: 'additionalRooms.reset.other', label: 'Other room' }
    ]},
    { title: 'Additional rooms — Reset Plus (hours each)', fields: [
        { path: 'additionalRooms.resetPlus.dining', label: 'Dining / additional reception' },
        { path: 'additionalRooms.resetPlus.office', label: 'Office / study' },
        { path: 'additionalRooms.resetPlus.utility', label: 'Utility room' },
        { path: 'additionalRooms.resetPlus.other', label: 'Other room' }
    ]},
    { title: 'Additional rooms — ABC (hours each)', fields: [
        { path: 'additionalRooms.abc.dining', label: 'Dining / additional reception' },
        { path: 'additionalRooms.abc.office', label: 'Office / study' },
        { path: 'additionalRooms.abc.utility', label: 'Utility room' },
        { path: 'additionalRooms.abc.other', label: 'Other room' }
    ]},
    { title: 'Studio reduction (hours)', fields: [
        { path: 'studioReduction.kitchen', label: 'Kitchen' },
        { path: 'studioReduction.living', label: 'Living room' }
    ]},
    { title: 'Estimate range & rounding', fields: [
        { path: 'rangeUplift', label: 'Range uplift multiplier (e.g. 1.10 = +10%)' },
        { path: 'roundTo', label: 'Round estimate to nearest (£)' }
    ]},
    { title: 'Restore / carpet cleaning prices (£)', fields: [
        { path: 'restore.bedroom', label: 'Bedroom' },
        { path: 'restore.living', label: 'Living room' },
        { path: 'restore.dining', label: 'Dining room' },
        { path: 'restore.hallway', label: 'Hallway' },
        { path: 'restore.landing', label: 'Landing' },
        { path: 'restore.stairsBase', label: 'Stairs — base price' },
        { path: 'restore.stairsBaseSteps', label: 'Stairs — steps included in base price' },
        { path: 'restore.additionalStairEach', label: 'Stairs — price per extra step' },
        { path: 'restore.standaloneMinimum', label: 'Standalone Restore minimum booking (£)' }
    ]},
    { title: 'Optional extras (£)', fields: [
        { path: 'extras.oven', label: 'Oven cleaning' },
        { path: 'extras.fridge', label: 'Fridge cleaning' }
    ]}
];

const root = document.getElementById('adminRoot');
let currentConfig = null;

function renderLogin(errorMsg){
    root.innerHTML = `
        <h2>Gleamly Pricing Admin</h2>
        ${errorMsg ? `<div class="form-errors"><ul><li>${escapeHTML(errorMsg)}</li></ul></div>` : ''}
        <div class="form-group">
            <label>Password</label>
            <input type="password" id="adminPassword" autocomplete="current-password">
        </div>
        <div class="buttons"><button class="next" id="loginBtn" type="button">Log in</button></div>
    `;
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('adminPassword').addEventListener('keydown', e => {
        if(e.key === 'Enter') handleLogin();
    });
    document.getElementById('adminPassword').focus();
}

async function handleLogin(){
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput ? passwordInput.value : '';
    const btn = document.getElementById('loginBtn');
    if(btn) btn.disabled = true;
    try{
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok || !data.success){
            renderLogin(data.error || 'Login failed.');
            return;
        }
        await loadPricing();
    }catch(e){
        renderLogin('Could not reach the server. Please try again.');
    }
}

async function loadPricing(){
    let res;
    try{
        res = await fetch('/api/admin/pricing');
    }catch(e){
        renderLogin('Could not reach the server. Please try again.');
        return;
    }
    if(res.status === 401){
        renderLogin();
        return;
    }
    const data = await res.json().catch(() => ({}));
    currentConfig = data || {};
    renderEditor();
}

function renderEditor(){
    root.innerHTML = `
        <h2>Gleamly Pricing Admin</h2>
        <div class="form-errors" id="adminErrors" hidden></div>
        <div id="adminFields"></div>
        <div class="buttons">
            <button class="back" id="logoutBtn" type="button">Log out</button>
            <button class="next" id="saveBtn" type="button">Save changes</button>
        </div>
    `;

    const fieldsEl = document.getElementById('adminFields');
    fieldsEl.innerHTML = ADMIN_FIELDS.map(section => `
        <div class="admin-section">
            <h4>${escapeHTML(section.title)}</h4>
            ${section.fields.map(f => {
                const value = getByPath(currentConfig, f.path);
                return `
                <div class="admin-field">
                    <label>${escapeHTML(f.label)}</label>
                    <input type="number" step="0.01" data-admin-path="${f.path}" value="${value == null ? '' : value}">
                </div>`;
            }).join('')}
        </div>
    `).join('');

    document.getElementById('saveBtn').addEventListener('click', handleSave);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

async function handleSave(){
    const errBox = document.getElementById('adminErrors');
    errBox.hidden = true;
    errBox.className = 'form-errors';

    const updated = JSON.parse(JSON.stringify(currentConfig || {}));
    let hasInvalid = false;
    document.querySelectorAll('[data-admin-path]').forEach(input => {
        const num = Number(input.value);
        if(!Number.isFinite(num) || num < 0){ hasInvalid = true; return; }
        setByPath(updated, input.dataset.adminPath, num);
    });

    if(hasInvalid){
        errBox.hidden = false;
        errBox.innerHTML = '<ul><li>Please enter valid, non-negative numbers for every field.</li></ul>';
        return;
    }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    try{
        const res = await fetch('/api/admin/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok || !data.success){
            errBox.hidden = false;
            errBox.innerHTML = `<ul><li>${escapeHTML(data.error || 'Save failed.')}</li></ul>`;
            btn.disabled = false;
            return;
        }
        currentConfig = updated;
        btn.disabled = false;
        errBox.hidden = false;
        errBox.className = 'admin-save-ok';
        errBox.innerHTML = 'Saved — customers will see the new prices immediately.';
    }catch(e){
        errBox.hidden = false;
        errBox.innerHTML = '<ul><li>Could not reach the server. Please try again.</li></ul>';
        btn.disabled = false;
    }
}

async function handleLogout(){
    try{ await fetch('/api/admin/logout', { method: 'POST' }); }catch(e){ /* ignore */ }
    renderLogin();
}

loadPricing();
