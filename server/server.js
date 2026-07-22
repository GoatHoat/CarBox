/* CarBox local API runner — zero dependencies (plain Node http).
   Mounts the same serverless handlers Vercel/Netlify would:
     POST /api/recommend   -> api/recommend.js
     POST /api/shops       -> api/shops.js
   Run:  node server.js   (see README.md for the required env vars) */

var http = require('http');
var recommend = require('./api/recommend.js');
var shops = require('./api/shops.js');

var PORT = process.env.PORT || 8787;

var server = http.createServer(function (req, res) {
  var path = (req.url || '').split('?')[0];
  if (path === '/api/recommend') return recommend(req, res);
  if (path === '/api/shops') return shops(req, res);
  if (path === '/api/health') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      places: !!process.env.GOOGLE_MAPS_API_KEY
    }));
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('CarBox API proxy on 0.0.0.0:' + PORT);
  console.log('  ANTHROPIC_API_KEY   ' + (process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING (recs will 503 -> app uses local fallback)'));
  console.log('  GOOGLE_MAPS_API_KEY ' + (process.env.GOOGLE_MAPS_API_KEY ? 'set' : 'MISSING (shops will 503 -> app shows error state)'));
});
