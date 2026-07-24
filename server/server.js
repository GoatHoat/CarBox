/* CarBox local API runner — zero dependencies (plain Node http).
   Mounts the same serverless handlers Vercel/Netlify would:
     POST /api/recommend               -> api/recommend.js
     POST /api/shops                   -> api/shops.js
     POST /api/delete-account          -> api/delete-account.js
     POST /api/create-checkout-session -> api/create-checkout-session.js
     POST /api/billing-portal          -> api/billing-portal.js
     POST /api/stripe-webhook          -> api/stripe-webhook.js
   Run:  node server.js   (see README.md for the required env vars) */

var http = require('http');
var recommend = require('./api/recommend.js');
var shops = require('./api/shops.js');
var deleteAccount = require('./api/delete-account.js');
var createCheckoutSession = require('./api/create-checkout-session.js');
var billingPortal = require('./api/billing-portal.js');
var stripeWebhook = require('./api/stripe-webhook.js');

var PORT = process.env.PORT || 8787;

var server = http.createServer(function (req, res) {
  var path = (req.url || '').split('?')[0];
  if (path === '/api/recommend') return recommend(req, res);
  if (path === '/api/shops') return shops(req, res);
  if (path === '/api/delete-account') return deleteAccount(req, res);
  if (path === '/api/create-checkout-session') return createCheckoutSession(req, res);
  if (path === '/api/billing-portal') return billingPortal(req, res);
  if (path === '/api/stripe-webhook') return stripeWebhook(req, res);
  if (path === '/api/health') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      places: !!process.env.GOOGLE_MAPS_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY
    }));
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('CarBox API proxy on 0.0.0.0:' + PORT);
  console.log('  ANTHROPIC_API_KEY     ' + (process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING (recs will 503 -> app uses local fallback)'));
  console.log('  GOOGLE_MAPS_API_KEY   ' + (process.env.GOOGLE_MAPS_API_KEY ? 'set' : 'MISSING (shops will 503 -> app shows error state)'));
  console.log('  STRIPE_SECRET_KEY     ' + (process.env.STRIPE_SECRET_KEY ? 'set' : 'MISSING (checkout/billing-portal will 503)'));
  console.log('  STRIPE_WEBHOOK_SECRET ' + (process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'MISSING (webhook will 503)'));
});
