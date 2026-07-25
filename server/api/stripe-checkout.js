/* POST /api/stripe-checkout
   Body: { plan: 'monthly'|'annual', userId, email }
   Creates a Stripe Checkout Session for the CarBox Pro subscription and
   returns { url } for the browser to redirect to. This is the WEB/Stripe
   purchase path, used only when the app is running as a normal website
   (not inside the native iOS shell) — see app/billing.js for the gating.
   Apple's StoreKit/RevenueCat path still handles native purchases; this
   endpoint never runs there.

   Env (see server/README.md):
     STRIPE_SECRET_KEY      sk_live_... / sk_test_...
     STRIPE_PRICE_MONTHLY   price_...  (Stripe Dashboard -> Product -> pricing)
     STRIPE_PRICE_ANNUAL    price_...
     CARBOX_WEB_URL         e.g. https://carbox-one.vercel.app (redirect target) */

var Stripe = require('stripe');

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
  var priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
  var priceAnnual = process.env.STRIPE_PRICE_ANNUAL;
  var webUrl = (process.env.CARBOX_WEB_URL || '').replace(/\/+$/, '');
  if (!secretKey || !priceMonthly || !priceAnnual || !webUrl) {
    return send(res, 503, {
      error: 'stripe-checkout not configured (need STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, CARBOX_WEB_URL)'
    });
  }

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var plan = body.plan === 'monthly' ? 'monthly' : 'annual';
  var userId = body.userId;
  var email = body.email;
  if (!userId) return send(res, 400, { error: 'userId required (must be signed in)' });

  var stripe = Stripe(secretKey);
  var price = plan === 'monthly' ? priceMonthly : priceAnnual;

  try {
    var session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price, quantity: 1 }],
      client_reference_id: userId,
      customer_email: email || undefined,
      /* stash the CarBox user id on the subscription itself so later
         customer.subscription.updated/deleted webhooks (which don't carry
         client_reference_id) can still find who to update. NO trial — the
         subscription charges immediately at checkout, matching the paywall
         copy in app/pro.js. */
      subscription_data: { metadata: { carbox_user_id: userId } },
      metadata: { carbox_user_id: userId },
      allow_promotion_codes: true,
      success_url: webUrl + '/index.html?stripe=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: webUrl + '/index.html?stripe=cancel'
    });
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, 502, { error: 'stripe-checkout failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
