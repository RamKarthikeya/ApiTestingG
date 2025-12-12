// src/services/runner.service.js
import axios from "axios";
import pLimit from "p-limit";
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { resolveTestUrl } from "../utils/resolveUrl.js";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

/* -------------------------
   Helpers
-------------------------*/

function findHeaderKey(headers, name) {
  if (!headers) return undefined;
  const low = name.toLowerCase();
  return Object.keys(headers).find((k) => k.toLowerCase() === low);
}

function normalizeExpectedStatuses(expected) {
  if (Array.isArray(expected)) return expected.map((s) => parseInt(s, 10));
  if (expected === undefined || expected === null) return [200];
  return [parseInt(expected, 10)];
}

function buildCurl(method, url, headers = {}, body) {
  const headerParts = Object.entries(headers || {}).map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`);
  let dataPart = "";
  if (body !== undefined && body !== null) {
    const payload = typeof body === "object" ? JSON.stringify(body) : String(body);
    dataPart = `--data ${JSON.stringify(payload)}`;
  }
  return ["curl -i", `-X ${method}`, ...headerParts, dataPart, JSON.stringify(url)]
    .filter(Boolean)
    .join(" ");
}

/**
 * Suggest expected status updates for failing results.
 * Returns an array of suggestion objects.
 */
function suggestExpectedStatusUpdates(results) {
  const suggestions = [];
  for (const r of results) {
    if (!r || !r.actual) continue;
    const observed = r.actual.status;
    const expectedArr = Array.isArray(r.expected?.status) ? r.expected.status : [r.expected?.status];
    if (!expectedArr.includes(observed)) {
      suggestions.push({
        id: r.id,
        description: r.description || null,
        currentExpected: expectedArr,
        observed,
        recommendedExpected: Array.from(new Set([...expectedArr, observed])).sort((a, b) => a - b),
        hint: r.hint || null,
        curl: r.diagnostics?.curl || null,
      });
    }
  }
  return suggestions;
}

/* -------------------------
   Core: single test execution
-------------------------*/
const executeSingleTest = async (test, baseUrl) => {
  const startTime = Date.now();

  // Resolve final URL (handles absolute endpoints or relative ones using baseUrl)
  let fullUrl;
  try {
    fullUrl = resolveTestUrl(test.request.endpoint, baseUrl);
  } catch (err) {
    const duration = Date.now() - startTime;
    return {
      id: test.id,
      category: test.category,
      description: test.description,
      status: "ERROR ❌",
      error: `URL Resolution Error: ${err.message}`,
      duration: `${duration}ms`,
      expected: { status: normalizeExpectedStatuses(test.expected_response?.status) },
    };
  }

  const expectedStatuses = normalizeExpectedStatuses(test.expected_response?.status);
  const method = (test.request.method || "GET").toUpperCase();

  // Prepare headers safely (shallow copy)
  const headers = { ...(test.request.headers || {}) };

  // Ensure a User-Agent exists (some WAFs block unknown clients)
  if (!findHeaderKey(headers, "User-Agent")) {
    headers["User-Agent"] = "Mozilla/5.0 (compatible; API-Tester/1.0)";
  }

  // Determine body/data handling
  let dataToSend;
  if (method === "GET" || method === "HEAD") {
    dataToSend = undefined;
  } else {
    let payload = test.request.body;
    if (payload === null || payload === undefined) {
      dataToSend = undefined;
    } else if (typeof payload === "object") {
      dataToSend = payload;
      if (!findHeaderKey(headers, "Content-Type")) headers["Content-Type"] = "application/json";
    } else if (typeof payload === "string") {
      // try parse string as JSON
      try {
        const parsed = JSON.parse(payload);
        dataToSend = parsed;
        if (!findHeaderKey(headers, "Content-Type")) headers["Content-Type"] = "application/json";
      } catch {
        dataToSend = payload;
        if (!findHeaderKey(headers, "Content-Type")) headers["Content-Type"] = "text/plain";
      }
    } else {
      dataToSend = payload;
      if (!findHeaderKey(headers, "Content-Type")) headers["Content-Type"] = "application/json";
    }
  }

  // Axios config
  const cfg = {
    method,
    url: fullUrl,
    headers,
    data: dataToSend,
    timeout: 10000,
    validateStatus: () => true, // accept any status code for assertion
    maxRedirects: 5,
  };

  try {
    const response = await axios.request(cfg);
    const duration = Date.now() - startTime;
    const actualStatus = response.status;
    const passedStatus = expectedStatuses.includes(actualStatus);

    // Body hint extraction for 4xx/5xx and WAF detection
    let bodyValidationHint = null;
    try {
      const data = response.data;
      if (data && typeof data === "object") {
        const possibleKeys = ["error", "errors", "message", "detail", "validation"];
        const found = possibleKeys.filter((k) => Object.prototype.hasOwnProperty.call(data, k));
        if (found.length) bodyValidationHint = `Response contains keys: ${found.join(", ")}`;
      } else if (typeof data === "string" && data.length < 2000) {
        if (data.toLowerCase().includes("forbidden") || data.toLowerCase().includes("access denied")) {
          bodyValidationHint = "Response body contains 'forbidden'/'access denied' — possible WAF/proxy block";
        }
      }
    } catch {
      // ignore extraction errors
    }

    // Schema enforcement (AJV) - if expected_response.schema exists, compile and validate.
    let schemaValidation = { ok: true, errors: null };
    if (test.expected_response && test.expected_response.schema) {
      try {
        const validate = ajv.compile(test.expected_response.schema);
        const valid = validate(response.data);
        if (!valid) {
          schemaValidation.ok = false;
          schemaValidation.errors = validate.errors;
        }
      } catch (e) {
        schemaValidation.ok = false;
        schemaValidation.errors = [{ message: `Schema compile error: ${String(e.message || e)}` }];
      }
    }

    // Final pass determination: must pass both status and schema (if schema provided).
    const passed = passedStatus && (schemaValidation.ok === true);

    // Truncate large response data to keep result compact
    let responseData = response.data;
    try {
      if (typeof responseData === "string" && responseData.length > 64 * 1024) {
        responseData = responseData.slice(0, 64 * 1024) + "\n...TRUNCATED...";
      }
    } catch { /* ignore */ }

    const curl = buildCurl(method, fullUrl, headers, dataToSend);

    const result = {
      id: test.id,
      category: test.category,
      description: test.description,
      status: passed ? "PASSED ✅" : "FAILED ❌",
      duration: `${duration}ms`,
      actual: {
        status: actualStatus,
        statusText: response.statusText,
        data: responseData,
        headers: response.headers,
      },
      expected: { status: expectedStatuses },
      hint: bodyValidationHint,
      schemaValidation: schemaValidation.ok ? undefined : schemaValidation.errors,
      diagnostics: {
        resolvedUrl: fullUrl,
        requestHeaders: headers,
        requestBody: dataToSend,
        curl,
      },
    };

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    let errorMsg = error.message;
    if (error.code === "ECONNREFUSED") errorMsg = "Connection Refused (server down?)";
    else if (error.code === "ENOTFOUND") errorMsg = "Invalid Host/URL";

    return {
      id: test.id,
      category: test.category,
      description: test.description,
      status: "ERROR ❌",
      error: errorMsg,
      duration: `${duration}ms`,
      expected: { status: normalizeExpectedStatuses(test.expected_response?.status) },
      diagnostics: {
        resolvedUrl: fullUrl,
        requestHeaders: headers,
        requestBody: dataToSend,
        curl: buildCurl(method, fullUrl, headers, dataToSend),
      },
    };
  }
};

/* -------------------------
   Public runner
-------------------------*/
export const runTestSuite = async (testCases = [], targetUrl = undefined, concurrency = 5, opts = {}) => {
  const limit = pLimit(concurrency);

  const results = await Promise.all(
    testCases.map((tc) => limit(() => executeSingleTest(tc, targetUrl)))
  );

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status && r.status.includes("PASSED")).length,
    failed: results.filter((r) => r.status && r.status.includes("FAILED")).length,
    errors: results.filter((r) => r.status && r.status.includes("ERROR")).length,
    target: targetUrl || null,
  };

  // generate suggestions for expected status updates
  const suggestions = suggestExpectedStatusUpdates(results);

  // write suggestions to file if any (and not disabled)
  try {
    if (suggestions.length && opts.writeSuggestions !== false) {
      const outPath = path.resolve(process.cwd(), opts.suggestionsFile || "expected-suggestions.json");
      fs.writeFileSync(outPath, JSON.stringify(suggestions, null, 2), "utf8");
    }
  } catch {
    // don't fail the run on write errors
  }

  return { results, summary, suggestions };
};
