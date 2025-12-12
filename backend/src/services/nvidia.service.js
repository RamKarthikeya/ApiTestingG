// src/services/nvidia.service.js
import axios from "axios";
import { model } from "../config/nvidia.js";
import cache from "../utils/cache.js";
import { resolveTestUrl } from "../utils/resolveUrl.js";

/* ------------------------------------------------------------------
   Utilities: clean, extract JSON, parse safe, normalize headers,
   curl builder, secret scrubber
-------------------------------------------------------------------*/
const cleanGarbage = (text) => {
  if (typeof text !== "string") return "";
  return text
    .replace(/\uFEFF/g, "")
    .replace(/[…]/g, "...")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/[\u200B-\u200F]/g, "")
    .trim();
};

const extractJson = (raw) => {
  if (!raw) return null;
  const cleaned = cleanGarbage(raw);

  // remove fenced codeblocks but keep inner content
  let txt = cleaned.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "").trim()
  );

  // find all object/array-like blocks and pick the largest one (heuristic)
  const matches = [];
  const objRegex = /\{[\s\S]*?\}/g;
  const arrRegex = /\[[\s\S]*?\]/g;
  let m;
  while ((m = objRegex.exec(txt))) matches.push(m[0]);
  while ((m = arrRegex.exec(txt))) matches.push(m[0]);

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.length - a.length);
  const candidate = matches[0];
  const sanitized = candidate.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
  return sanitized;
};

const safeParse = (str) => {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

/**
 * normalizeHeaders
 * - Accepts objects only, returns a plain header map stringifying values as needed.
 * - Avoids returning '__raw' or nested structures.
 */
const normalizeHeaders = (value) => {
  if (!value) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out = {};
  for (const k of Object.keys(value)) {
    if (value[k] === undefined || value[k] === null) continue;
    // flatten nested objects/arrays by JSON.stringify so axios accepts them
    out[String(k)] = typeof value[k] === "object" ? JSON.stringify(value[k]) : String(value[k]);
  }
  return out;
};

function buildCurl(method, url, headers = {}, body) {
  const headerParts = Object.entries(headers || {}).map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`);
  let dataPart = "";
  if (body !== undefined && body !== null) {
    // If body is an object, convert to JSON string; otherwise use raw string
    const payload = typeof body === "object" ? JSON.stringify(body) : String(body);
    dataPart = `--data ${JSON.stringify(payload)}`;
  }
  return ["curl -i", `-X ${method}`, ...headerParts, dataPart, JSON.stringify(url)]
    .filter(Boolean)
    .join(" ");
}

/**
 * scrubSecrets: shallow scrub of known token-like keys inside an object
 * Used before caching or logging probe results to avoid storing secrets.
 */
const scrubSecrets = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const tokenPatterns = [/token/i, /secret/i, /api[_-]?key/i, /authorization/i, /bearer/i, /x-?api-?key/i];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      try {
        if (tokenPatterns.some((rx) => rx.test(k))) {
          o[k] = "[REDACTED]";
        } else if (typeof o[k] === "object") {
          walk(o[k]);
        }
      } catch {
        // ignore
      }
    }
  };
  walk(clone);
  return clone;
};

/* ------------------------------------------------------------------
   Fallback generator: rich set of testcases (passable + negative)
   NOTE: negative cases here remain for reference but will be filtered
   out at generation time if the global filter is enabled.
-------------------------------------------------------------------*/
const generateFallbackTestCases = (spec = {}, detected = {}) => {
  const endpoint = spec.endpoint || "/";
  const method = (spec.method || "GET").toUpperCase();

  const successStatus = spec.expected_response?.status || (method === "POST" ? 201 : 200);
  const overrides = spec.overrides || {};
  const authErrorStatus = Number.isFinite(overrides.authErrorStatus) ? overrides.authErrorStatus : 401;
  const rateLimitStatus = Number.isFinite(overrides.rateLimitStatus) ? overrides.rateLimitStatus : 429;
  const conflictStatus = Number.isFinite(overrides.conflictStatus) ? overrides.conflictStatus : 409;
  const genericInvalidStatus = Number.isFinite(overrides.invalidStatus) ? overrides.invalidStatus : 400;

  const validHeaders = Object.assign({}, spec.headers || {});
  if (detected.validHeaderName && detected.validHeaderValue) {
    validHeaders[detected.validHeaderName] = detected.validHeaderValue;
  } else {
    if (!validHeaders.Authorization && !validHeaders["x-api-key"]) {
      validHeaders.Authorization = validHeaders.Authorization || "Bearer VALID";
    }
  }

  const cases = [
    {
      id: "TC_001",
      category: "valid",
      description: "Valid request with correct headers and auth",
      request: {
        method,
        endpoint,
        headers: normalizeHeaders(Object.assign({}, validHeaders, { "Content-Type": "application/json" })),
        body: spec.body ?? { sample: true },
      },
      expected_response: { status: successStatus },
    },
    {
      id: "TC_002",
      category: "invalid",
      description: "Missing required parameter or field",
      request: { method, endpoint: endpoint + "?missing=true", headers: normalizeHeaders(spec.headers), body: method === "POST" ? {} : null },
      expected_response: { status: genericInvalidStatus },
    },
    {
      id: "TC_003",
      category: "invalid",
      description: "Empty JSON body",
      request: {
        method,
        endpoint,
        headers: { "Content-Type": "application/json" },
        body: {}
      },
      expected_response: { status: genericInvalidStatus },
    },
    {
      id: "TC_004",
      category: "invalid",
      description: "Missing API key",
      request: { method, endpoint, headers: normalizeHeaders(spec.headers || {}), body: null },
      expected_response: { status: authErrorStatus },
    },
    {
      id: "TC_005",
      category: "invalid",
      description: "Invalid API key",
      request: { method, endpoint, headers: Object.assign({}, spec.headers || {}, { Authorization: "Bearer WRONG" }), body: null },
      expected_response: { status: authErrorStatus },
    },
    {
      id: "TC_006",
      category: "invalid",
      description: "Rate limit exceeded test",
      request: { method, endpoint, headers: Object.assign({}, spec.headers || {}, { "X-Test-Rate": "true" }), body: null },
      expected_response: { status: rateLimitStatus },
    },
    {
      id: "TC_007",
      category: "boundary",
      description: "Very long string field",
      request: { method, endpoint, headers: { "Content-Type": "application/json" }, body: { name: "x".repeat(2000) } },
      expected_response: { status: genericInvalidStatus },
    },
    {
      id: "TC_008",
      category: "security",
      description: "SQL injection attempt in body",
      request: { method, endpoint, headers: { "Content-Type": "application/json" }, body: { name: "' OR '1'='1" } },
      expected_response: { status: genericInvalidStatus },
    },
    {
      id: "TC_009",
      category: "invalid",
      description: "Duplicate resource (simulate conflict)",
      request: { method, endpoint, headers: Object.assign({}, validHeaders, { "Content-Type": "application/json" }), body: { id: "existing-id", name: "dup" } },
      expected_response: { status: conflictStatus },
    },
    {
      id: "TC_010",
      category: "invalid",
      description: "Wrong Content-Type header",
      request: { method, endpoint, headers: { "Content-Type": "text/plain" }, body: JSON.stringify(spec.body ?? { sample: true }) },
      expected_response: { status: genericInvalidStatus },
    },
    {
      id: "TC_011",
      category: "valid",
      description: "Valid request with query params and auth",
      request: { method, endpoint: endpoint + "?q=test", headers: normalizeHeaders(Object.assign({}, validHeaders, { "Content-Type": "application/json" })), body: null },
      expected_response: { status: successStatus },
    },
    {
      id: "TC_012",
      category: "valid",
      description: "Valid request with optional X-Debug header",
      request: { method, endpoint, headers: normalizeHeaders(Object.assign({}, validHeaders, { "X-Debug": "true" })), body: null },
      expected_response: { status: successStatus },
    },
  ];

  return cases.slice(0, 12);
};

/* ------------------------------------------------------------------
   Probing helpers (resilient & safe)
-------------------------------------------------------------------*/

/**
 * probeEndpoint
 * - Resolves endpoint (absolute or relative using spec.targetUrl)
 * - Performs several lightweight requests (noAuth, invalidAuth, rateHint)
 * - Returns status, sample body and headers
 */
const probeEndpoint = async (spec, timeout = 4000) => {
  if (!spec || !spec.endpoint) return {};
  const method = (spec.method || "GET").toUpperCase();
  const cfg = { timeout, validateStatus: null, maxRedirects: 5 };

  const results = {};
  let url;
  try {
    url = resolveTestUrl(spec.endpoint, spec.targetUrl || spec.baseUrl || undefined);
  } catch (err) {
    return { error: `URL resolution error: ${err.message}` };
  }

  try {
    const baseHeaders = normalizeHeaders(spec.headers || {});

    const rNoAuth = await axios.request({ url, method, data: spec.body ?? null, headers: baseHeaders, ...cfg });
    results.noAuth = { status: rNoAuth.status, body: rNoAuth.data, headers: rNoAuth.headers, curl: buildCurl(method, url, baseHeaders, spec.body) };

    const rInvalid = await axios.request({ url, method, data: spec.body ?? null, headers: normalizeHeaders(Object.assign({}, baseHeaders, { Authorization: "Bearer WRONG" })), ...cfg });
    results.invalidAuth = { status: rInvalid.status, body: rInvalid.data, headers: rInvalid.headers, curl: buildCurl(method, url, Object.assign({}, baseHeaders, { Authorization: "Bearer WRONG" }), spec.body) };

    const rRate = await axios.request({ url, method, data: spec.body ?? null, headers: normalizeHeaders(Object.assign({}, baseHeaders, { "X-Test-Rate": "true" })), ...cfg });
    results.rateLimit = { status: rRate.status, body: rRate.data, headers: rRate.headers, curl: buildCurl(method, url, Object.assign({}, baseHeaders, { "X-Test-Rate": "true" }), spec.body) };

    if (spec.sampleValidToken) {
      const rValid = await axios.request({ url, method, data: spec.body ?? null, headers: normalizeHeaders(Object.assign({}, baseHeaders, { Authorization: `Bearer ${spec.sampleValidToken}` })), ...cfg });
      results.validAuth = { status: rValid.status, body: rValid.data, headers: rValid.headers, curl: buildCurl(method, url, Object.assign({}, baseHeaders, { Authorization: `Bearer ${spec.sampleValidToken}` }), spec.body) };
    }

    if (spec.sampleValidApiKey) {
      const rApiKey = await axios.request({ url, method, data: spec.body ?? null, headers: normalizeHeaders(Object.assign({}, baseHeaders, { "x-api-key": spec.sampleValidApiKey })), ...cfg });
      results.validApiKey = { status: rApiKey.status, body: rApiKey.data, headers: rApiKey.headers, curl: buildCurl(method, url, Object.assign({}, baseHeaders, { "x-api-key": spec.sampleValidApiKey }), spec.body) };
    }
  } catch (e) {
    results.error = String(e);
  }
  return results;
};

/**
 * probeAuthHeaderTypes
 * - Try different header styles (Authorization, x-api-key, etc.) to detect which works
 */
const probeAuthHeaderTypes = async (spec, timeout = 4000) => {
  if (!spec || !spec.endpoint) return {};
  const method = (spec.method || "GET").toUpperCase();
  const cfg = { timeout, validateStatus: null, maxRedirects: 5 };

  let url;
  try {
    url = resolveTestUrl(spec.endpoint, spec.targetUrl || spec.baseUrl || undefined);
  } catch (err) {
    return { error: `URL resolution error: ${err.message}` };
  }

  const baseHeaders = normalizeHeaders(spec.headers || {});
  const variants = [
    { name: "none", headers: Object.assign({}, baseHeaders) },
    { name: "authorization_wrong", headers: Object.assign({}, baseHeaders, { Authorization: "Bearer WRONG" }) },
    { name: "x_api_key_wrong", headers: Object.assign({}, baseHeaders, { "x-api-key": "WRONG" }) },
    { name: "X-API-KEY_wrong", headers: Object.assign({}, baseHeaders, { "X-API-KEY": "WRONG" }) },
  ];

  if (spec.sampleValidToken) variants.push({ name: "authorization_valid", headers: Object.assign({}, baseHeaders, { Authorization: `Bearer ${spec.sampleValidToken}` }) });
  if (spec.sampleValidApiKey) variants.push({ name: "x_api_key_valid", headers: Object.assign({}, baseHeaders, { "x-api-key": spec.sampleValidApiKey }) });

  const results = {};
  for (const v of variants) {
    try {
      const r = await axios.request({ url, method, data: spec.body ?? null, headers: normalizeHeaders(v.headers), ...cfg });
      results[v.name] = { status: r.status, body: r.data, headers: r.headers, curl: buildCurl(method, url, v.headers, spec.body) };
    } catch (e) {
      results[v.name] = { error: String(e) };
    }
  }
  return results;
};

/* ------------------------------------------------------------------
   Infer overrides (auth/rateLimit/conflict) from probe responses
-------------------------------------------------------------------*/
const inferOverridesFromProbe = (probe) => {
  const overrides = {};
  const bodyHas = (o, keywords) => {
    if (!o) return false;
    const s = typeof o === "string" ? o.toLowerCase() : JSON.stringify(o).toLowerCase();
    return keywords.some((k) => s.includes(k));
  };

  try {
    // prefer explicit status code signals
    if (probe.noAuth && Number.isFinite(probe.noAuth.status)) {
      if ([401, 403].includes(probe.noAuth.status)) overrides.authErrorStatus = probe.noAuth.status;
      else if (bodyHas(probe.noAuth.body, ["missing api", "missing token", "no api key", "unauthorized", "auth required"])) overrides.authErrorStatus = probe.noAuth.status;
    }

    if (probe.invalidAuth && Number.isFinite(probe.invalidAuth.status)) {
      if ([401, 403].includes(probe.invalidAuth.status)) overrides.authErrorStatus = probe.invalidAuth.status;
      else if (bodyHas(probe.invalidAuth.body, ["invalid api", "invalid token", "unauthorized"])) overrides.authErrorStatus = probe.invalidAuth.status;
    }

    if (probe.rateLimit && Number.isFinite(probe.rateLimit.status)) {
      if ([429].includes(probe.rateLimit.status)) overrides.rateLimitStatus = probe.rateLimit.status;
      else if (bodyHas(probe.rateLimit.body, ["rate", "rate limit", "too many requests", "limit exceeded"])) overrides.rateLimitStatus = probe.rateLimit.status;
    }

    // conflict / duplicate detection
    for (const k of Object.keys(probe || {})) {
      const item = probe[k];
      if (!item || !Number.isFinite(item.status)) continue;
      if (bodyHas(item.body, ["duplicate", "already exists", "conflict", "duplicate entry", "unique constraint"])) {
        overrides.conflictStatus = item.status;
      }
      if (bodyHas(item.body, ["content-type", "unsupported media type", "invalid content type"])) {
        overrides.conflictStatus = item.status;
      }
    }
  } catch {
    // defensive: ignore probing inference errors
  }
  return overrides;
};

/* ------------------------------------------------------------------
   Auto-detect: probes, infers overrides, detects which auth header style works
-------------------------------------------------------------------*/
const autoDetectOverridesAndAuth = async (spec) => {
  const baseProbe = await probeEndpoint(spec).catch(() => ({}));
  const headerVariants = await probeAuthHeaderTypes(spec).catch(() => ({}));
  const merged = Object.assign({}, baseProbe, headerVariants);
  const inferred = inferOverridesFromProbe(merged);

  const detected = {};
  try {
    if (headerVariants.authorization_valid && Number.isFinite(headerVariants.authorization_valid.status) && headerVariants.authorization_valid.status >= 200 && headerVariants.authorization_valid.status < 300) {
      detected.validHeaderName = "Authorization";
      detected.validHeaderValue = spec.sampleValidToken ? `Bearer ${spec.sampleValidToken}` : "[PROVIDED]";
      inferred.successStatus = headerVariants.authorization_valid.status;
    } else if (headerVariants.x_api_key_valid && Number.isFinite(headerVariants.x_api_key_valid.status) && headerVariants.x_api_key_valid.status >= 200 && headerVariants.x_api_key_valid.status < 300) {
      detected.validHeaderName = "x-api-key";
      detected.validHeaderValue = spec.sampleValidApiKey || "[PROVIDED]";
      inferred.successStatus = headerVariants.x_api_key_valid.status;
    } else {
      if (baseProbe.validAuth && Number.isFinite(baseProbe.validAuth.status) && baseProbe.validAuth.status >= 200 && baseProbe.validAuth.status < 300 && spec.sampleValidToken) {
        detected.validHeaderName = "Authorization";
        detected.validHeaderValue = `Bearer ${spec.sampleValidToken}`;
        inferred.successStatus = baseProbe.validAuth.status;
      } else if (baseProbe.validApiKey && Number.isFinite(baseProbe.validApiKey.status) && baseProbe.validApiKey.status >= 200 && baseProbe.validApiKey.status < 300 && spec.sampleValidApiKey) {
        detected.validHeaderName = "x-api-key";
        detected.validHeaderValue = spec.sampleValidApiKey;
        inferred.successStatus = baseProbe.validApiKey.status;
      }
    }
  } catch {
    // ignore
  }

  return { probe: merged, inferred, detected };
};

/* ------------------------------------------------------------------
   Apply probe results to adjust expected_response.status on testcases
-------------------------------------------------------------------*/
const applyProbeToTestCases = (testCases = [], probeResults = {}, spec = {}, inferred = {}) => {
  if (!Array.isArray(testCases)) return testCases;

  const missingAuthStatus = Number.isFinite(probeResults.noAuth?.status) ? probeResults.noAuth.status : null;
  const invalidAuthStatus = Number.isFinite(probeResults.invalidAuth?.status) ? probeResults.invalidAuth.status : null;
  const rateLimitStatus = Number.isFinite(probeResults.rateLimit?.status) ? probeResults.rateLimit.status : null;
  const observedSuccess = Number.isFinite(inferred.successStatus) ? inferred.successStatus : (spec.expected_response?.status || (String(spec.method || "GET").toUpperCase() === "POST" ? 201 : 200));
  const defaultSuccess = spec.expected_response?.status ?? (String(spec.method || "GET").toUpperCase() === "POST" ? 201 : 200);

  testCases.forEach((tc) => {
    const desc = (tc.description || "").toLowerCase();

    if (desc.includes("missing api key") || desc.includes("missing api") || desc.includes("missing auth")) {
      if (missingAuthStatus) tc.expected_response.status = missingAuthStatus;
    } else if (desc.includes("invalid api key") || desc.includes("invalid token") || desc.includes("invalid auth")) {
      if (invalidAuthStatus) tc.expected_response.status = invalidAuthStatus;
    } else if (desc.includes("rate") || desc.includes("rate limit")) {
      if (rateLimitStatus) tc.expected_response.status = rateLimitStatus;
    } else if (desc.includes("duplicate") || desc.includes("conflict")) {
      if (inferred.conflictStatus) tc.expected_response.status = inferred.conflictStatus;
    } else if (desc.includes("valid") || desc.includes("happy path")) {
      tc.expected_response.status = observedSuccess || tc.expected_response.status || defaultSuccess;
    } else {
      if (tc.expected_response && tc.expected_response.status === defaultSuccess && observedSuccess === 409) {
        tc.expected_response.status = 409;
      }
    }
  });

  return testCases;
};

/* ------------------------------------------------------------------
   MAIN: generateTestCases
   - spec.autoProbe: boolean (opt-in)
   - spec.sampleValidToken / spec.sampleValidApiKey: optional credentials for probing
-------------------------------------------------------------------*/
export const generateTestCases = async (spec = {}) => {
  const cacheKey = `gen_${(spec.method || "GET")}_${spec.endpoint || "/"}_${JSON.stringify(spec.headers || {})}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.info("Using cached testcases for", cacheKey, "preview:", (cached.testCases || []).map((t,i) => `${i+1}:${t.id}:${t.description}`).slice(0,12));
    return { ...cached, cached: true };
  }

  const prompt = `You are a QA Engineer. Generate exactly 12 API test cases.

API SPEC:
- Method: ${spec.method}
- Endpoint: ${spec.endpoint}
- Headers: ${JSON.stringify(spec.headers || {})}
- Body: ${JSON.stringify(spec.body || null)}
- Success Status: ${spec.expected_response?.status || (String(spec.method || "GET").toUpperCase() === "POST" ? 201 : 200)}

REQUIREMENTS:
- Output strictly a valid JSON ARRAY ONLY.
- NO markdown, no explanation, no text before or after JSON.

Each testcase:
{ "id":"TC_001", "category":"valid|invalid|boundary|security", "description":"...", "request":{ "method":"...","endpoint":"...","headers":{},"body":{} }, "expected_response":{ "status": number } }
`;

  // 1) optional probing
  let probeResults = {};
  let inferred = {};
  let detected = {};
  if (spec.autoProbe) {
    try {
      const res = await autoDetectOverridesAndAuth(Object.assign({}, spec, { targetUrl: spec.targetUrl || spec.baseUrl }));
      probeResults = res.probe || {};
      inferred = res.inferred || {};
      detected = res.detected || {};
      spec.overrides = Object.assign({}, spec.overrides || {}, inferred);
    } catch (e) {
      console.warn("autoDetectOverridesAndAuth failed:", e?.message ?? e);
    }
  }

  try {
    const result = await model.generateContent(prompt);
    const responseText = (typeof result.response?.text === "function") ? result.response.text() : String(result?.response || "");
    const extracted = extractJson(responseText);
    let parsed = extracted ? safeParse(extracted) : null;
    if (parsed && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.testCases)) parsed = parsed.testCases;
      else if (Array.isArray(parsed.data)) parsed = parsed.data;
    }

    // original rawList generation
    let rawList = Array.isArray(parsed) ? parsed : [];
    if (!Array.isArray(rawList) || rawList.length === 0) {
      rawList = generateFallbackTestCases(spec, detected);
    }

    // ensure length 12 (originally)
    if (rawList.length < 12) {
      const extra = generateFallbackTestCases(spec, detected).slice(0, 12 - rawList.length);
      rawList = rawList.concat(extra);
    }

    // apply probe-driven adjustments if autoProbe enabled
    if (spec.autoProbe) {
      rawList = applyProbeToTestCases(rawList, probeResults, spec, inferred);
      rawList = rawList.map((tc) => {
        const desc = (tc.description || "").toLowerCase();
        if ((desc.includes("valid") || desc.includes("happy")) && detected.validHeaderName && detected.validHeaderValue) {
          tc.request.headers = Object.assign({}, tc.request.headers || {}, { [detected.validHeaderName]: detected.validHeaderValue });
        }
        return tc;
      });
    }

    // -----------------------------
    // NEW: Remove ALL negative testcases
    // -----------------------------
    rawList = rawList.filter((tc) => String(tc.category || "").toLowerCase() !== "invalid");

    // If too short, refill from fallback non-invalid pool (avoid duplicates)
    if (rawList.length < 12) {
      const pool = generateFallbackTestCases(spec, detected).filter((tc) => String(tc.category || "").toLowerCase() !== "invalid");
      const existingSignatures = new Set(rawList.map(tc => `${tc.category}::${String(tc.description || '').slice(0,120)}`));
      const extras = [];
      for (const candidate of pool) {
        if (extras.length >= 12 - rawList.length) break;
        const sig = `${candidate.category}::${String(candidate.description || '').slice(0,120)}`;
        if (!existingSignatures.has(sig)) {
          existingSignatures.add(sig);
          extras.push(candidate);
        }
      }
      rawList = rawList.concat(extras);
    }

    // If still short, pad with minimal valid placeholders
    if (rawList.length < 12) {
      for (let i = rawList.length; i < 12; i += 1) {
        rawList.push({
          id: `TC_PLACEHOLDER_${i + 1}`,
          category: "valid",
          description: `Auto placeholder ${i + 1}`,
          request: {
            method: (spec.method || "GET").toUpperCase(),
            endpoint: spec.endpoint || "/",
            headers: normalizeHeaders(Object.assign({}, spec.headers || {}, { "Content-Type": "application/json" })),
            body: spec.body ?? { sample: true },
          },
          expected_response: { status: spec.expected_response?.status || (String(spec.method || "GET").toUpperCase() === "POST" ? 201 : 200) }
        });
      }
    }

    // Log preview for debugging
    console.info("generateTestCases: returning test preview (non-invalid only):", rawList.map((r, i) => ({ index: i + 1, id: r.id, category: r.category, description: r.description })).slice(0, 12));

    // Force sequential IDs and sanitize
    const sanitized = rawList.slice(0, 12).map((tc, i) => ({
      id: `TC_${String(i + 1).padStart(3, "0")}`, // force sequential ids
      category: tc.category || "valid",
      description: tc.description || `Auto-generated ${i + 1}`,
      request: {
        method: (tc.request?.method || spec.method || "GET").toUpperCase(),
        endpoint: tc.request?.endpoint || spec.endpoint || "/",
        headers: normalizeHeaders(tc.request?.headers),
        body: tc.request?.body ?? (spec.body ?? null),
      },
      expected_response: {
        status: parseInt(tc.expected_response?.status || spec.expected_response?.status || (String(spec.method || "GET").toUpperCase() === "POST" ? 201 : 200), 10),
      },
    }));

    const summary = {
      total: sanitized.length,
      valid: sanitized.filter((t) => t.category === "valid").length,
      invalid: sanitized.filter((t) => t.category === "invalid").length,
      boundary: sanitized.filter((t) => t.category === "boundary").length,
      security: sanitized.filter((t) => t.category === "security").length,
    };

    const data = {
      testCases: sanitized,
      summary,
      probeResults: spec.autoProbe ? scrubSecrets(probeResults) : undefined,
      inferred: spec.autoProbe ? inferred : undefined,
      detected: spec.autoProbe ? (detected.validHeaderName ? { validHeaderName: detected.validHeaderName, validHeaderValue: "[REDACTED]" } : undefined) : undefined,
    };

    // cache sanitized but scrub secrets from probe results and detected
    const safeToCache = Object.assign({}, data, { probeResults: scrubSecrets(data.probeResults), detected: scrubSecrets(data.detected) });
    try {
      cache.set(cacheKey, safeToCache);
    } catch {
      // don't fail generation on cache errors
    }

    return { ...data, cached: false };
  } catch (error) {
    console.error("NVIDIA Gen Error:", error);
    const fallback = generateFallbackTestCases(spec, detected);
    const summary = { total: fallback.length, valid: fallback.filter((t) => t.category === "valid").length, invalid: fallback.filter((t) => t.category === "invalid").length, boundary: fallback.filter((t) => t.category === "boundary").length, security: fallback.filter((t) => t.category === "security").length };
    return { testCases: fallback, summary, cached: false, note: "Returned fallback due to generation error" };
  }
};
