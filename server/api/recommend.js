/* POST /api/recommend
   Body:  { make, model, year, trim, specs:{engine,horsepower,torque,transmission,drivetrain,accel},
            goal, filter, budget:{min,max} }
   Reply: { recommendations: [ { name, benefit, detail } x5 ], source: "ai" }

   `filter` is the mod category the user picked in the Upgrades setup flow, or
   the literal string "best overall", which asks the model to choose from the
   car's WEAKEST attributes instead of a fixed part type.

   The client shows the first 2 to everyone and locks the rest behind Pro, so
   the ORDER matters: strongest recommendation first.

   Holds the Anthropic key SERVER-SIDE (never ship keys in the client).
   Works as a Vercel/Netlify-style serverless function AND under server.js locally. */

var MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
var WANT = 5;   /* default / maximum; the client asks for fewer for free users */

/* The count is parameterised: a free user only pays for 2 generations, a Pro
   user gets the full 5. The client sends `count`; we never generate more than
   asked, so we never spend tokens on mods a free user can't see. */
function buildSystemPrompt(n) {
  return [
    'You are an expert automotive performance consultant for the CarBox app.',
    'Given one specific car (make, model, year, trim, engine, horsepower, torque, transmission, drivetrain, 0-60), the owner\'s goal, and a focus area, recommend EXACTLY ' + n + ' aftermarket modification' + (n === 1 ? '' : 's') + '.',
    '',
    'Hard rules:',
    '- Exactly ' + n + ' recommendation' + (n === 1 ? '' : 's') + '. Never label them "Stage 1", "Stage 2", or any stage/tier/phase numbering. Each is titled with the mod\'s real name (e.g. "Cold air intake", "ECU flash tune", "Coilover suspension kit").',
    '- ORDER MATTERS. Sort them best first: index 0 is the single recommendation you would make if the owner could only do one thing, and each following entry is the next best use of their money. The user sees them in this order.',
    '- All ' + n + ' must be genuinely distinct mods. Do not pad the list with variations of the same part, and do not include filler you would not actually recommend.',
    '- FOCUS AREA: the user picks one category to concentrate on (for example intake, suspension, wheels, seats). When a specific category is given, all ' + n + ' recommendations must belong to that category and address the goal through it.',
    '- FOCUS AREA "best overall": when the focus area is exactly "best overall", do NOT restrict yourself to one category. Instead, reason about THIS car\'s actual specifications and identify where it is weakest relative to the stated goal (for example: a heavy car with modest brakes for track use, a powerful car on all season tires, a soft chassis for handling, an old infotainment system for interior comfort). Recommend the ' + n + ' mods that best address those specific weaknesses, strongest first, and in each "detail" say which weakness of this car it fixes.',
    '- Recommendations must be realistic and SAFE for this exact car and goal. Never recommend a turbo/boost tune on a naturally aspirated engine unless you are recommending adding forced induction itself and the platform commonly supports it. Never recommend engine tunes on EVs (suggest EV-appropriate mods instead). Respect drivetrain (no "add AWD" style suggestions) and the car\'s existing power level.',
    '- BUDGET: the user gives a maximum budget for this goal. EACH recommendation\'s realistic total cost (parts plus install) MUST fit within that cap on its own, so they can afford any one of them. Never suggest something above the cap. If the cap is very low, recommend the best genuinely affordable options that fit and keep the estimates honest; it is fine if they are modest.',
    '- "benefit" is one short line: estimated gain and rough parts cost, e.g. "+15-25 hp, roughly $350 in parts". Keep estimates honest for this platform and within budget; use ranges.',
    '- "detail" is one paragraph (3-5 sentences) explaining what the mod is, what it does to the car, and why it is the right choice for this specific car and this goal.',
    '- CRITICAL STYLE RULE: the "detail" paragraph must NOT contain the em dash character or the en dash character anywhere. Do not use "—" and do not use "–". Use commas, periods, or parentheses instead. Plain hyphens inside compound words (like "bolt-on") are fine.',
    '',
    'Answer with ONLY this JSON, no markdown fences, no commentary, with exactly ' + n + ' entr' + (n === 1 ? 'y' : 'ies') + ':',
    '{"recommendations":[{"name":"...","benefit":"...","detail":"..."}]}'
  ].join('\n');
}

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

  /* how many to generate — clamped to [1, WANT]; defaults to the full set for
     older clients that don't send it */
  var want = Math.max(1, Math.min(WANT, parseInt(v.count, 10) || WANT));

  var specs = v.specs || {};
  var b = v.budget || null;
  var budgetLine = b
    ? 'Budget cap per mod: $' + (b.max != null ? b.max : (b.min || 0)) +
      (b.max == null && b.min ? ' or more available' : '') + ' (each recommendation must fit within this)'
    : 'Budget cap per mod: not specified (keep costs sensible)';
  var filter = String(v.filter || 'best overall').trim().toLowerCase();
  var bestOverall = filter === 'best overall';
  var user = [
    'Car: ' + v.year + ' ' + v.make + ' ' + v.model + (v.trim ? ' (' + v.trim + ')' : ''),
    'Engine: ' + (specs.engine || 'unknown'),
    'Horsepower: ' + (specs.horsepower || 'unknown'),
    'Torque: ' + (specs.torque || 'unknown'),
    'Transmission: ' + (specs.transmission || 'unknown'),
    'Drivetrain: ' + (specs.drivetrain || 'unknown'),
    '0-60 mph: ' + (specs.accel || 'unknown'),
    'Owner goal: ' + (v.goal || 'More power'),
    bestOverall
      ? 'Focus area: best overall (analyse this car\'s specs, find its weakest points for this goal, and pick across any categories)'
      : 'Focus area: ' + filter + ' (every recommendation must be in this category)',
    budgetLine,
    '',
    'Recommend exactly ' + want + ' mod' + (want === 1 ? '' : 's') + ' as specified, best first, each within the budget cap.'
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
        max_tokens: Math.min(2400, Math.max(700, want * 480)),   /* scales with count */
        system: buildSystemPrompt(want),
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
    var recs = (parsed.recommendations || []).slice(0, want).map(function (m) {
      return {
        name: String(m.name || '').slice(0, 60),
        benefit: noDashes(m.benefit).slice(0, 120),
        detail: noDashes(m.detail).slice(0, 900)
      };
    });
    if (recs.length !== want) {
      return send(res, 502, { error: 'model did not return ' + want + ' recommendations' });
    }
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
