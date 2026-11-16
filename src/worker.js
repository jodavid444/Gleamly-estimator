// Single Worker entry point. This project deploys as a Cloudflare "Worker
// with static assets" (not classic Pages), so there is no automatic
// file-based routing for an API folder — every request is matched here by
// hand, and anything that isn't one of these routes falls through to the
// static assets binding (the rest of the site: index.html, script.js,
// admin.html, etc).

import { handlePricingGet } from './routes/pricing.js';
import { handleAdminLogin } from './routes/admin-login.js';
import { handleAdminLogout } from './routes/admin-logout.js';
import { handleAdminPricingGet, handleAdminPricingPost } from './routes/admin-pricing.js';
import { handleSubmitQuote } from './routes/submit-quote.js';
import { handleDebugSecret } from './routes/debug-secret.js';

export default {
    async fetch(request, env){
        const { pathname } = new URL(request.url);
        const method = request.method;

        if(method === 'GET' && pathname === '/api/pricing') return handlePricingGet(env);
        if(method === 'POST' && pathname === '/api/admin/login') return handleAdminLogin(request, env);
        if(method === 'POST' && pathname === '/api/admin/logout') return handleAdminLogout();
        if(method === 'GET' && pathname === '/api/admin/pricing') return handleAdminPricingGet(request, env);
        if(method === 'POST' && pathname === '/api/admin/pricing') return handleAdminPricingPost(request, env);
        if(method === 'POST' && pathname === '/api/submit-quote') return handleSubmitQuote(request, env);
        if(method === 'GET' && pathname === '/api/debug-secret') return handleDebugSecret(env);

        return env.ASSETS.fetch(request);
    }
};
