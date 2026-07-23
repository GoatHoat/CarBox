/* POST /api/recommend
   Body:  { make, model, year, trim, specs:{engine,horsepower,torque,transmission,drivetrain,accel}, goal }
   Reply: { recommendations: [ { name, benefit, detail }, { name, benefit, detail } ], source: "ai" }

   Holds the Anthropic key SERVER-SIDE (never ship keys in the client).
   Works as a Vercel/Netlify-style serverless function AND under server.js locally. */

var MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

var SYSTEM_PROMPT = [
  'You are an expert automotive performance consultant for the CarBox app.',
  'Given one specific car (make, model, year, trim, engine, horsepower, torque, transmission, drivetrain, 0-60) and the owner\'s goal, recommend EXACTLY 2 aftermarket modifications.',
  '',
  'Hard rules:',
  '- Exactly 2 recommendations. Never label them "Stage 1", "Stage 2", or any stage/tier/phase numbering. Each is titled with the mod\'s real name (e.g. "Cold air intake", "ECU flash tune", "Coilover suspension kit").',
  '- Recommendations must be realistic and SAFE for this exact car and goal. Never recommend a turbo/boost tune on a naturally aspirated engine unless you are recommending adding forced induction itself and the platform commonly supports it. Never recommend engine tunes on EVs (suggest EV-appropriate mods instead). Respect drivetrain (no "add AWD" style suggestions) and the car\'s existing power level.',
  '- BUDGET: the user gives a maximum budget for this goal. EACH recommendation\'s realistic total cost (parts plus install) MUST fit within that cap on its own, so they can afford either one. Never suggest something above the cap. If the cap is very low, recommend the best genuinely affordable option(s) that fit and keep the estimates honest; it is fine if the two are modest.',
  '- "benefit" is one short line: estimated gain and rough parts cost, e.g. "+15-25 hp, roughly $350 in parts". Keep estimates honest for this platform and within budget; use ranges.',
  '- "detail" is one paragraph (3-5 sentences) explaining what the mod is, what it does to the car, and why it is the right choice for this specific car and this goal.',
  '- CRITICAL STYLE RULE: the "detail" paragraph must NOT contain the em dash character or the en dash character anywhere. Do not use "—" and do not use "–". Use commas, periods, or parentheses instead. Plain hyphens inside compound words (like "bolt-on") are fine.',
  '',
  'Answer with ONLY this JSON, no markdown fences, no commentary:',
  '{"recommendations":[{"name":"...","benefit":"...","detail":"..."},{"name":"...","benefit":"...","detail":"..."}]}'
].join('\n');

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

/* strip any em/en dashes the model might still emit (belt and braces) */
function noDashes(s) {
  return String(s || '').replace(/\s*[—–]\s*/g, ', ');
}

function extractJson(text) {
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('no JSON in model reply');
  return JSON.parse(text.slice(a, b + 1));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 503, { error: 'ANTHROPIC_API_KEY not configured' });

  var body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad JSON body' }); }
  }
  var v = body || {};
  if (!v.make || !v.model || !v.year) return send(res, 400, { error: 'make, model, year required' });

  var specs = v.specs || {};
  var b = v.budget || null;
  var budgetLine = b
    ? 'Budget cap per mod: $' + (b.max != null ? b.max : (b.min || 0)) +
      (b.max == null && b.min ? ' or more available' : '') + ' (each recommendation must fit within this)'
    : 'Budget cap per mod: not specified (keep costs sensible)';
  var user = [
    'Car: ' + v.year + ' ' + v.make + ' ' + v.model + (v.trim ? ' (' + v.trim + ')' : ''),
    'Engine: ' + (specs.engine || 'unknown'),
    'Horsepower: ' + (specs.horsepower || 'unknown'),
    'Torque: ' + (specs.torque || 'unknown'),
    'Transmission: ' + (specs.transmission || 'unknown'),
    'Drivetrain: ' + (specs.drivetrain || 'unknown'),
    '0-60 mph: ' + (specs.accel || 'unknown'),
    'Owner goal: ' + (v.goal || 'More power'),
    budgetLine,
    '',
    'Recommend exactly 2 mods as specified, both within the budget cap.'
  ].join('\n');

  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!r.ok) {
      var errTx = await r.text();
      return send(res, 502, { error: 'anthropic ' + r.status, detail: errTx.slice(0, 300) });
    }
    var data = await r.json();
    var text = (data.content && data.content[0] && data.content[0].text) || '';
    var parsed = extractJson(text);
    var recs = (parsed.recommendations || []).slice(0, 2).map(function (m) {
      return {
        name: String(m.name || '').slice(0, 60),
        benefit: noDashes(m.benefit).slice(0, 120),
        detail: noDashes(m.detail).slice(0, 900)
      };
    });
    if (recs.length !== 2) return send(res, 502, { error: 'model did not return 2 recommendations' });
    return send(res, 200, { recommendations: recs, source: 'ai' });
  } catch (e) {
    return send(res, 502, { error: 'recommend failed', detail: String(e && e.message || e).slice(0, 300) });
  }
};

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}
