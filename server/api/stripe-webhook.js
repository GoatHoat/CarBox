/* POST /api/stripe-webhook
   Configure this URL in Stripe Dashboard -> Developers -> Webhooks, listening
   for: checkout.session.completed, customer.subscription.updated,
   customer.subscription.deleted.

   Verifies the Stripe-Signature header by hand (HMAC-SHA256 over the RAW
   request body — no `stripe` npm package, to match this server's
   zero-dependency style, same as delete-account.js/recommend.js).

   Grants/revokes CarBox Pro by calling the `set_pro_entitlement` Postgres
   function (see supabase_stripe_migration.sql) with the service_role key,
   which merges just the "isPro" key into user_state.data without touching
   the rest of that user's synced app state.

   Env (see server/README.md):
     STRIPE_WEBHOOK_SECRET       whsec_... (from the Stripe webhook's settings page)
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY  server-side only, never ship in the app */

var crypto = require('crypto');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    var c = [];
    req.on('data', function (x) { c.push(x); });
    req.on('end', function () { resolve(Buffer.concat(c)); });
    req.on('error', reject);
  });
}

/* Stripe-Signature: "t=<timestamp>,v1=<hex hmac>[,v0=...]" */
function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSeconds) {
  if (!sigHeader) return false;
  var parts = {};
  sigHeader.split(',').forEach(function (kv) {
    var idx = kv.indexOf('=');
    if (idx > -1) parts[kv.slice(0, idx)] = kv.slice(idx + 1);
  });
  if (!parts.t || !parts.v1) return false;
  var signedPayload = parts.t + '.' + rawBody.toString('utf8');
  var expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  var a = Buffer.from(expected, 'utf8'), b = Buffer.from(parts.v1, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  var age = Math.abs(Date.now() / 1000 - Number(parts.t));
  return age <= (toleranceSeconds || 300);
}

async function sbRest(path, opts) {
  var url = process.env.SUPABASE_URL.replace(/\/+$/, '') + path;
  var service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var headers = Object.assign({
    apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'
  }, (opts && opts.headers) || {});
  return fetch(url, Object.assign({}, opts, { headers: headers }));
}

/* find the CarBox user id for a Stripe customer, preferring subscription
   metadata (set at checkout time) and falling back to the stored mapping */
async function resolveUserId(object) {
  if (object.metadata && object.metadata.supabase_user_id) return object.metadata.supabase_user_id;
  if (!object.customer) return null;
  var r = await sbRest('/rest/v1/profiles?stripe_customer_id=eq.' + encodeURIComponent(object.customer) + '&select=id', {});
  if (!r.ok) return null;
  var rows = await r.json();
  return (rows && rows[0] && rows[0].id) || null;
}

async function setEntitlement(userId, pro) {
  if (!userId) return;
  await sbRest('/rest/v1/rpc/set_pro_entitlement', {
    method: 'POST',
    body: JSON.stringify({ uid: userId, pro: !!pro })
  });
}

async function storeCustomerId(userId, customerId) {
  if (!userId || !customerId) return;
  await sbRest('/rest/v1/profiles?id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stripe_customer_id: customerId })
  });
}

/* Vercel auto-parses JSON bodies by default, which would hand us a
   re-serialized (and therefore signature-mismatching) body. Disable that so
   readRawBody() below gets the exact bytes Stripe signed. (No-op under
   server.js's plain http server, which never parses bodies itself.) */
module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 503, { error: 'stripe webhook not configured' });
  }

  var raw = req.body && Buffer.isBuffer(req.body) ? req.body : await readRawBody(req);
  var sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(raw, sig, secret)) return send(res, 400, { error: 'invalid signature' });

  var event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad JSON' }); }

  try {
    var obj = event.data && event.data.object;
    if (event.type === 'checkout.session.completed') {
      var userId = obj.client_reference_id;
      if (userId && obj.customer) await storeCustomerId(userId, obj.customer);
      await setEntitlement(userId, true);
    } else if (event.type === 'customer.subscription.updated') {
      var active = ['active', 'trialing'].indexOf(obj.status) !== -1;
      await setEntitlement(await resolveUserId(obj), active);
    } else if (event.type === 'customer.subscription.deleted') {
      await setEntitlement(await resolveUserId(obj), false);
    }
    return send(res, 200, { received: true });
  } catch (e) {
    return send(res, 500, { error: 'webhook handling failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
