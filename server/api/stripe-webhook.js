/* POST /api/stripe-webhook
   Stripe calls this whenever a subscription is created, renewed, changed, or
   canceled. It verifies the request really came from Stripe, then mirrors the
   CarBox Pro entitlement into Supabase (user_state.data.isPro) using the
   service_role key, keyed by the carbox_user_id stashed in metadata at
   checkout time (see stripe-checkout.js). The web app already syncs its
   whole local state from user_state on login/reload (see app/supabase.js),
   so writing isPro here is enough to unlock Pro on the user's device.

   Env (see server/README.md):
     STRIPE_SECRET_KEY
     STRIPE_WEBHOOK_SECRET       whsec_...  (Stripe Dashboard -> Webhooks -> Signing secret)
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   service_role key — server-side only

   IMPORTANT: this endpoint needs the RAW request body to verify the Stripe
   signature, so JSON body-parsing is disabled below (Vercel reads `config`;
   the local plain-Node runner in server.js never parses bodies anyway). */

var Stripe = require('stripe');

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    var c = [];
    req.on('data', function (x) { c.push(x); });
    req.on('end', function () { resolve(Buffer.concat(c)); });
    req.on('error', reject);
  });
}

/* read the current user_state row, merge in the new fields, upsert it back.
   Mirrors what app/supabase.js does client-side, just with the service role. */
async function mergeUserState(supaUrl, supaService, userId, patch) {
  var getRes = await fetch(
    supaUrl + '/rest/v1/user_state?user_id=eq.' + encodeURIComponent(userId) + '&select=data',
    { headers: { apikey: supaService, Authorization: 'Bearer ' + supaService } }
  );
  var rows = await getRes.json().catch(function () { return []; });
  var current = (rows && rows[0] && rows[0].data) || {};
  var next = Object.assign({}, current, patch);

  await fetch(supaUrl + '/rest/v1/user_state', {
    method: 'POST',
    headers: {
      apikey: supaService, Authorization: 'Bearer ' + supaService,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ user_id: userId, data: next, updated_at: new Date().toISOString() })
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.statusCode = 204; return res.end();
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }

  var secretKey = process.env.STRIPE_SECRET_KEY;
  var whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  var supaUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  var supaService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !whSecret || !supaUrl || !supaService) {
    res.statusCode = 503; return res.end('stripe-webhook not configured');
  }

  var stripe = Stripe(secretKey);
  var raw = await readRawBody(req);
  var event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], whSecret);
  } catch (e) {
    res.statusCode = 400; return res.end('signature verification failed: ' + e.message);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      var session = event.data.object;
      var userId = session.client_reference_id || (session.metadata && session.metadata.carbox_user_id);
      if (userId) {
        await mergeUserState(supaUrl, supaService, userId, {
          isPro: true,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription
        });
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      var sub = event.data.object;
      var uid = sub.metadata && sub.metadata.carbox_user_id;
      if (uid) {
        /* Stripe keeps status 'active' (or 'trialing') for the WHOLE paid period
           even after the user schedules a cancel (cancel_at_period_end = true).
           So isPro stays true until the period genuinely ends, at which point
           this fires again as 'deleted'/status 'canceled' and flips it false.
           We also persist the cancel intent + period end so the app can tell the
           user "Pro until <date>" without another Stripe round-trip. */
        var active = sub.status === 'active' || sub.status === 'trialing';
        await mergeUserState(supaUrl, supaService, uid, {
          isPro: active,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          /* epoch seconds; the scheduled end (cancel_at) if set, else the current
             period end. null once there is no active period. */
          currentPeriodEnd: sub.cancel_at || sub.current_period_end || null
        });
      }
    }
    /* other event types (invoice.paid, payment_failed, etc.) are ignored for
       now — acknowledge them so Stripe doesn't retry. */
    res.statusCode = 200; return res.end('ok');
  } catch (e) {
    res.statusCode = 500; return res.end('webhook handling failed: ' + String(e && e.message || e).slice(0, 300));
  }
}

/* tell Vercel not to pre-parse the body, so the raw bytes match what Stripe signed */
handler.config = { api: { bodyParser: false } };

module.exports = handler;
