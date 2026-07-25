/* POST /api/stripe-portal
   Body: { userId }
   Looks up the user's Stripe customer id (stored in user_state.data by
   stripe-webhook.js after their first checkout) and returns a Stripe Billing
   Portal URL where they can update their card, switch plans, or cancel — the
   web/Stripe equivalent of "Manage" in app/billing.js.

   CANCELLATION POLICY: we attach an explicit portal Configuration that sets
   cancellation to "at period end" (mode: 'at_period_end'), so a user who cancels
   KEEPS Pro until the paid period they already paid for actually ends. This is
   forced in code and does not depend on the Stripe Dashboard portal defaults,
   which someone could change later. The return_url carries ?fromPortal=1 so the
   app re-pulls the entitlement and confirms what happened (see app/billing.js).

   Env (see server/README.md):
     STRIPE_SECRET_KEY
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     CARBOX_WEB_URL   e.g. https://carbox-one.vercel.app (return + legal links) */

var Stripe = require('stripe');

/* Cache the portal configuration id per warm instance so we don't create a new
   one on every click. Cold starts recreate it, which is fine. */
var _portalConfigId = null;
async function portalConfigId(stripe, webUrl) {
  if (_portalConfigId) return _portalConfigId;
  var cfg = await stripe.billingPortal.configurations.create({
    business_profile: {
      privacy_policy_url: webUrl + '/privacy.html',
      terms_of_service_url: webUrl + '/terms.html'
    },
    features: {
      /* the important one: cancel takes effect at the END of the paid period */
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address'] }
    }
  });
  _portalConfigId = cfg.id;
  return _portalConfigId;
}

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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var secretKey = process.env.STRIPE_SECRET_KEY;
  var supaUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  var supaService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var webUrl = (process.env.CARBOX_WEB_URL || '').replace(/\/+$/, '');
  if (!secretKey || !supaUrl || !supaService || !webUrl) {
    return send(res, 503, { error: 'stripe-portal not configured' });
  }

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var userId = body.userId;
  if (!userId) return send(res, 400, { error: 'userId required' });

  try {
    var getRes = await fetch(
      supaUrl + '/rest/v1/user_state?user_id=eq.' + encodeURIComponent(userId) + '&select=data',
      { headers: { apikey: supaService, Authorization: 'Bearer ' + supaService } }
    );
    var rows = await getRes.json().catch(function () { return []; });
    var customerId = rows && rows[0] && rows[0].data && rows[0].data.stripeCustomerId;
    if (!customerId) return send(res, 404, { error: 'no Stripe customer on file for this user yet' });

    var stripe = Stripe(secretKey);
    /* Force the at-period-end cancellation config. If creating it fails for any
       reason (e.g. business_profile requirements), fall back to a plain session
       so Manage never breaks — it just uses the dashboard default in that case. */
    var sessionOpts = {
      customer: customerId,
      return_url: webUrl + '/settings.html?fromPortal=1'
    };
    try { sessionOpts.configuration = await portalConfigId(stripe, webUrl); }
    catch (e) { /* fall back to default portal config */ }
    var portal = await stripe.billingPortal.sessions.create(sessionOpts);
    return send(res, 200, { url: portal.url });
  } catch (e) {
    return send(res, 502, { error: 'stripe-portal failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
