// src/controllers/test.controller.js
import { testSpecSchema, runTestsSchema } from "../schemas/validation.js";
import { generateTestCases } from "../services/nvidia.service.js";
import { runTestSuite } from "../services/runner.service.js";

export const generate = async (req, res, next) => {
  try {
    const incoming = req.safeBody ?? {};

    if (typeof incoming === "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON in request body",
        raw: incoming.slice ? incoming.slice(0, 2000) : incoming
      });
    }

    const spec = testSpecSchema.parse(incoming);
    const data = await generateTestCases(spec);
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
};

export const run = async (req, res, next) => {
  try {
    const incoming = req.safeBody ?? {};

    if (typeof incoming === "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON in request body for /run-tests",
        raw: incoming.slice ? incoming.slice(0, 2000) : incoming
      });
    }

    const { testCases, targetUrl, concurrency } = runTestsSchema.parse(incoming);
    const data = await runTestSuite(testCases, targetUrl, concurrency);
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
};
