/* POST /api/delete-account
   Body: { accessToken }   (the signed-in user's Supabase access token)
   Deletes the user's Auth account with the SERVICE ROLE key (server-side only),
   which cascades their rows (profiles, user_state, ...) via ON DELETE CASCADE.
   Apple requires in-app account deletion; this is the real server side of it.

   Env (see server/README.md):
     SUPABASE_URL                 your project URL (https://xxxx.supabase.co)
     SUPABASE_SERVICE_ROLE_KEY    service_role key — NEVER ship this in the app */

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

  var url = process.env.SUPABASE_URL;
  var service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return send(res, 503, { error: 'delete-account not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
  url = url.replace(/\/+$/, '');

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var token = body.accessToken;
  if (!token) return send(res, 400, { error: 'accessToken required' });

  try {
    /* verify the caller's token -> resolve their user id (they can only delete themselves) */
    var who = await fetch(url + '/auth/v1/user', {
      headers: { apikey: service, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return send(res, 401, { error: 'invalid session' });
    var user = await who.json();
    if (!user || !user.id) return send(res, 401, { error: 'no user' });

    /* delete the auth user with the service role (cascades their data) */
    var del = await fetch(url + '/auth/v1/admin/users/' + user.id, {
      method: 'DELETE',
      headers: { apikey: service, Authorization: 'Bearer ' + service }
    });
    if (!del.ok) {
      var t = await del.text();
      return send(res, 502, { error: 'delete failed ' + del.status, detail: t.slice(0, 200) });
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 502, { error: 'delete-account failed', detail: String(e && e.message || e).slice(0, 200) });
  }
};
