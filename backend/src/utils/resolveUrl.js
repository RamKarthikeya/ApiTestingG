// src/utils/resolveUrl.js

function joinUrl(base, path) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : "/" + path;
  return b + p;
}

export function resolveTestUrl(endpoint, targetUrl) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint; // full URL already
  }

  if (!targetUrl) {
    throw new Error(`Missing targetUrl for relative endpoint: ${endpoint}`);
  }

  return joinUrl(targetUrl, endpoint);
}

export function getFinalRequestUrl(testCase, targetUrl) {
  return resolveTestUrl(testCase.request.endpoint, targetUrl);
}
