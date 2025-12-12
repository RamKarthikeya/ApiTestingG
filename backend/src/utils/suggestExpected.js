// src/utils/suggestExpected.js
export function suggestExpectedStatusUpdates(results) {
  // results: array of runner result objects { id, actual: { status }, expected: { status: [..] } }
  const suggestions = [];
  for (const r of results) {
    if (r.status.includes("FAILED") || r.status.includes("ERROR")) {
      // If actual status not in expected set, recommend using observed status in addition
      const observed = r.actual?.status;
      const expected = Array.isArray(r.expected?.status) ? r.expected.status : [r.expected?.status];
      if (observed && !expected.includes(observed)) {
        suggestions.push({
          id: r.id,
          currentExpected: expected,
          observed: observed,
          recommendedExpected: Array.from(new Set([...expected, observed])).sort(),
          note: r.hint || null
        });
      }
    }
  }
  return suggestions;
}
