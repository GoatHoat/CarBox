/* CarBox upgrade goals + their mod-category filters — the SINGLE source of
   truth shared by goal-picker.html (which renders the chips) and upgrades.html
   (whose offline fallback pools are keyed by the same strings). Keep the two in
   step by editing only this file; a filter with no matching pool silently falls
   back to the goal's general pool.

   Goal strings are persisted per car (state.js `goal`), so renaming one here
   needs a matching entry in state.js GOAL_ALIASES or old saves break. */
window.CarBoxGoals = (function () {
  /* Chosen instead of a category: tells the AI to look at THIS car's specs and
     target whatever is weakest for the goal, rather than a fixed part type. */
  var BEST_OVERALL = 'best overall';

  /* order here = order in the picker grid */
  var GOALS = [
    { goal: 'More power',                filters: ['intake', 'exhaust', 'tuning', 'forced induction', 'drivetrain'] },
    { goal: 'Better handling',           filters: ['suspension', 'brakes', 'tires', 'chassis bracing'] },
    { goal: 'Exterior looks',            filters: ['wheels', 'wrap or paint', 'aero and wing', 'lighting', 'stance'] },
    { goal: 'Interior looks and comfort', filters: ['seats', 'screens and infotainment', 'steering wheel', 'lighting', 'storage'] },
    { goal: 'Track ready',               filters: ['brakes', 'tires', 'suspension', 'safety', 'cooling'] },
    { goal: 'Daily reliability',         filters: ['maintenance catch-up', 'cooling', 'brakes and tires', 'protection', 'electrical'] },
    { goal: 'Fuel efficiency',           filters: ['tires', 'intake and exhaust', 'weight reduction', 'aero', 'tuning'] }
  ];

  function find(goal) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].goal === goal) return GOALS[i];
    return null;
  }
  /* Every goal offers Best overall first, then its own categories. */
  function filtersFor(goal) {
    var g = find(goal);
    return [BEST_OVERALL].concat(g ? g.filters : []);
  }
  function isGoal(goal) { return !!find(goal); }
  /* Human-facing form: "Best overall" / "Intake" */
  function label(filter) {
    var s = String(filter || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  return {
    BEST_OVERALL: BEST_OVERALL,
    GOALS: GOALS,
    list: function () { return GOALS.map(function (g) { return g.goal; }); },
    filtersFor: filtersFor,
    isGoal: isGoal,
    label: label
  };
})();
