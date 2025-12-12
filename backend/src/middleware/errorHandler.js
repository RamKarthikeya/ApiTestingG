// src/middleware/errorHandler.js
import { ZodError } from 'zod';

export const errorHandler = (err, req, res, next) => {
  console.error("❌ Error:", err);

  // 0. Handle invalid JSON body (from express.json)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON in request body"
    });
  }

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: "Validation Error",
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    });
  }

  // 2. Known API Errors
  if (err.message.includes("AI Service Busy")) {
    return res.status(429).json({ success: false, error: err.message });
  }

  // 3. Default Server Error
  res.status(500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
};
