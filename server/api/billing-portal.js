/* POST /api/billing-portal
   Body: { accessToken }
   Reply: { url }  — Stripe's hosted "manage my subscription" page (update
                      card, switch plan, cancel). This is account SELF-SERVICE
                      for an existing subscriber, not a purchase flow, so it's
                      fine to link to from Settings even under the
                      no-purchase-CTA model (see app/pro.js header comment).

   Env: STRIPE_SECRET_KEY, CARBOX_WEB_ORIGIN, SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY (needed to read stripe_customer_id off the
        caller's own profile row) */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, code, obj) {
  cors(res); res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    var c = [];
    req.on('data', function (x) { c.push(x); });
    req.on('end', function () { resolve(Buffer.concat(c).toString('utf8')); });
    req.on('error', reject);
  });
}
function toFormBody(obj) {
  return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var secretKey = process.env.STRIPE_SECRET_KEY;
  var origin = (process.env.CARBOX_WEB_ORIGIN || '').replace(/\/+$/, '');
  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !origin || !supabaseUrl || !serviceKey) {
    return send(res, 503, { error: 'billing-portal not configured' });
  }

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var token = body.accessToken;
  if (!token) return send(res, 400, { error: 'accessToken required' });

  try {
    var who = await fetch(supabaseUrl.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return send(res, 401, { error: 'invalid session' });
    var user = await who.json();
    if (!user || !user.id) return send(res, 401, { error: 'no user' });

    var profRes = await fetch(supabaseUrl.replace(/\/+$/, '') + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=stripe_customer_id', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    var rows = await profRes.json();
    var customerId = rows && rows[0] && rows[0].stripe_customer_id;
    if (!customerId) return send(res, 404, { error: 'no Stripe customer on file for this account yet' });

    var r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secretKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toFormBody({ customer: customerId, return_url: origin + '/upgrade.html' })
    });
    if (!r.ok) {
      var errTx = await r.text();
      return send(res, 502, { error: 'stripe ' + r.status, detail: errTx.slice(0, 300) });
    }
    var session = await r.json();
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'billing-portal failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
