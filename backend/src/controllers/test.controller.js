// src/controllers/test.controller.js
import { testSpecSchema, runTestsSchema } from "../schemas/validation.js";
import { generateTestCases } from "../services/nvidia.service.js";
import { runTestSuite } from "../services/runner.service.js";

export const generate = async (req, res, next) => {
  try {
    const spec = testSpecSchema.parse(req.body);
    const data = await generateTestCases(spec);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

export const run = async (req, res, next) => {
  try {
    const { testCases, targetUrl, concurrency } = runTestsSchema.parse(req.body);
    const data = await runTestSuite(testCases, targetUrl, concurrency);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};
