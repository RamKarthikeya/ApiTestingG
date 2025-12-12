// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

if (!process.env.NVIDIA_API_KEY) {
  console.error("❌ FATAL: NVIDIA_API_KEY missing in .env");
  process.exit(1);
}

export const config = {
  port: process.env.PORT || 3000,
  nvidiaKey: process.env.NVIDIA_API_KEY,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:5173",
  ],
};
