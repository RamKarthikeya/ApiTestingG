import rateLimit from "express-rate-limit";

export const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 generation requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many generation requests, please try again later." }
});