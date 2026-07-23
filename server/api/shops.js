/* POST /api/shops
   Body:  { lat, lng, modName }
   Reply: { shops: [ { name, distanceMiles, mapsUrl } ] }

   Uses Google Places Nearby Search to FIND relevant shops near the user and
   their location; distance is computed here from the user's coords. We do NOT
   fetch ratings or generate price estimates — just name, distance, and a Google
   Maps link for directions. */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, code, obj) {
  cors(res);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  var R = 3958.8, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* what kind of shop performs this mod — keeps Places keyword relevant */
function searchKeyword(modName) {
  var m = String(modName || '').toLowerCase();
  if (/tune|ecu|flash|dyno/.test(m)) return 'performance tuning dyno shop';
  if (/exhaust|downpipe|muffler|header/.test(m)) return 'custom exhaust shop';
  if (/suspension|coilover|spring|sway|alignment/.test(m)) return 'suspension performance shop';
  if (/wheel|tire/.test(m)) return 'wheel and tire shop';
  if (/brake|rotor|caliper|pad/.test(m)) return 'brake service performance shop';
  if (/intake|intercooler|turbo|supercharg|charge pipe/.test(m)) return 'auto performance shop';
  if (/wrap|tint|paint|body/.test(m)) return 'auto customization shop';
  return 'car performance shop';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var gkey = process.env.GOOGLE_MAPS_API_KEY;
  if (!gkey) return send(res, 503, { error: 'GOOGLE_MAPS_API_KEY not configured' });

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var lat = Number(body.lat), lng = Number(body.lng);
  var modName = String(body.modName || '');
  if (!isFinite(lat) || !isFinite(lng)) return send(res, 400, { error: 'lat, lng required' });

  try {
    /* Places Nearby Search just to FIND relevant shops + their location */
    var url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
      '?location=' + lat + ',' + lng +
      '&radius=24000' +                                   /* ~15 miles */
      '&keyword=' + encodeURIComponent(searchKeyword(modName)) +
      '&key=' + gkey;
    var r = await fetch(url);
    if (!r.ok) return send(res, 502, { error: 'places ' + r.status });
    var data = await r.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return send(res, 502, { error: 'places status ' + data.status });
    }
    var results = (data.results || [])
      .filter(function (p) { return p.business_status === 'OPERATIONAL' && p.geometry && p.geometry.location; })
      .map(function (p) {
        var plat = p.geometry.location.lat, plng = p.geometry.location.lng;
        return {
          name: p.name,
          distanceMiles: Math.round(haversineMiles(lat, lng, plat, plng) * 10) / 10,
          /* Google Maps directions link (opened externally by the client) */
          mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=' +
            encodeURIComponent(plat + ',' + plng) +
            '&destination_place_id=' + encodeURIComponent(p.place_id)
        };
      })
      .sort(function (a, b) { return a.distanceMiles - b.distanceMiles; })
      .slice(0, 5);

    return send(res, 200, { shops: results });
  } catch (e) {
    return send(res, 502, { error: 'shops failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};
