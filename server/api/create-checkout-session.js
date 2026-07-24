/* POST /api/create-checkout-session
   Body: { accessToken, plan }   plan: 'monthly' | 'annual'
   Reply: { url }   — redirect the browser here to complete payment on Stripe's
                       own hosted page. Called ONLY from app/upgrade.html (a
                       plain web page, never linked from inside the iOS app —
                       see that file's header comment for why).

   This is the "companion app" monetization model: CarBox Pro is sold on the
   web via Stripe, not through Apple's In-App Purchase, so Apple takes no cut.
   That's only compliant (guideline 3.1.3(f)) because the iOS app itself has
   NO purchase button/pricing/CTA anywhere — see app/pro.js. Do not add one.

   Env (see server/README.md):
     STRIPE_SECRET_KEY        sk_live_... / sk_test_...
     STRIPE_PRICE_MONTHLY     price_... (create in Stripe Dashboard -> Products)
     STRIPE_PRICE_ANNUAL      price_...
     CARBOX_WEB_ORIGIN        e.g. https://carbox-one.vercel.app (for success/cancel redirect)
     SUPABASE_URL / SUPABASE_ANON_KEY  to verify the caller's session (not service_role) */

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

/* Stripe's API takes application/x-www-form-urlencoded with bracket
   notation for nested params, e.g. line_items[0][price]=price_x. */
function toFormBody(obj, prefix) {
  var pairs = [];
  Object.keys(obj).forEach(function (k) {
    var key = prefix ? prefix + '[' + k + ']' : k;
    var val = obj[k];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      pairs.push(toFormBody(val, key));
    } else if (Array.isArray(val)) {
      val.forEach(function (item, i) {
        if (item && typeof item === 'object') pairs.push(toFormBody(item, key + '[' + i + ']'));
        else pairs.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(item));
      });
    } else if (val !== undefined && val !== null) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  });
  return pairs.join('&');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var secretKey = process.env.STRIPE_SECRET_KEY;
  var priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
  var priceAnnual = process.env.STRIPE_PRICE_ANNUAL;
  var origin = (process.env.CARBOX_WEB_ORIGIN || '').replace(/\/+$/, '');
  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseAnon = process.env.SUPABASE_ANON_KEY;
  if (!secretKey || !priceMonthly || !priceAnnual || !origin || !supabaseUrl || !supabaseAnon) {
    return send(res, 503, { error: 'checkout not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL / CARBOX_WEB_ORIGIN / SUPABASE_URL / SUPABASE_ANON_KEY)' });
  }

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var token = body.accessToken;
  var plan = body.plan === 'monthly' ? 'monthly' : 'annual';
  if (!token) return send(res, 400, { error: 'accessToken required' });

  try {
    /* resolve the caller's identity from their own session token (anon key,
       NOT service_role — this endpoint only ever acts on the caller's own account) */
    var who = await fetch(supabaseUrl.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: supabaseAnon, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return send(res, 401, { error: 'invalid session' });
    var user = await who.json();
    if (!user || !user.id || !user.email) return send(res, 401, { error: 'no user' });

    var priceId = plan === 'monthly' ? priceMonthly : priceAnnual;
    var params = {
      mode: 'subscription',
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: origin + '/upgrade.html?success=1',
      cancel_url: origin + '/upgrade.html?canceled=1',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: user.id } }
    };

    var r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: toFormBody(params)
    });
    if (!r.ok) {
      var errTx = await r.text();
      return send(res, 502, { error: 'stripe ' + r.status, detail: errTx.slice(0, 300) });
    }
    var session = await r.json();
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'checkout session failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
