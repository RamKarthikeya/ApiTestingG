// src/schemas/validation.js
import { z } from "zod";

/**
 * Preprocess endpoint strings:
 * - Trim whitespace
 * - If starts with http(s):// -> keep
 * - If starts with / -> keep
 * - Otherwise (like "users/2") -> prepend "/"
 */
const preprocessEndpoint = z.preprocess((val) => {
  if (val == null) return val;
  let s = typeof val === "string" ? val : String(val);
  s = s.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s === "") return s;
  if (s.startsWith("/")) return s;
  return "/" + s;
}, z.string().min(1).max(1000).refine((val) => {
  return /^\/.+/.test(val) || /^https?:\/\/.+/i.test(val);
}, {
  message: 'Endpoint must be either a relative path starting with "/" or a full http(s) URL',
}));

// Status can be a single number or an array of numbers
const statusOrArray = z.union([
  z.number().int().min(100).max(599),
  z.array(z.number().int().min(100).max(599)).nonempty()
]).optional().default(200);

export const testSpecSchema = z.object({
  endpoint: preprocessEndpoint,
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  headers: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .default({}),
  body: z.union([z.record(z.any()), z.array(z.any()), z.string()]).optional(),
  expected_response: z.object({
    status: statusOrArray,
  }).optional().default({ status: 200 }),
});

const requestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  endpoint: preprocessEndpoint,
  headers: z.record(z.any()).optional(),
  body: z.any().optional(),
});

export const runTestsSchema = z.object({
  testCases: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        description: z.string().optional(),
        request: requestSchema,
        expected_response: z.object({
          // reuse statusOrArray but make required for run-time usage
          status: z.union([z.number().int().min(100).max(599), z.array(z.number().int().min(100).max(599))])
        }),
      })
    )
    .min(1, "At least one test case is required"),

  // optional base URL for relative endpoints
  targetUrl: z.string().url("Invalid Target URL format").optional(),

  concurrency: z.number().int().min(1).max(50).default(5),
});
