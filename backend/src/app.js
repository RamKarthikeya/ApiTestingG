// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import { config } from './config/env.js';
import testRoutes from './routes/test.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security & Configuration
app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

/**
 * Robust body parsing:
 * - Accept raw text for all content-types to avoid throwing on invalid JSON.
 * - Attach req.rawBody and req.safeBody for routes to use.
 */
app.use(bodyParser.text({ type: '*/*', limit: '10mb' }));

app.use((req, _res, next) => {
  // If some middleware already produced a parsed object, keep it.
  if (req.body && typeof req.body === 'object') {
    req.rawBody = null;
    req.safeBody = req.body;
    return next();
  }

  const raw = typeof req.body === 'string' ? req.body : '';
  req.rawBody = raw;

  try {
    // Clean common invisible/control characters that break JSON.parse
    const cleaned = raw
      .replace(/\uFEFF/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();

    req.safeBody = cleaned ? JSON.parse(cleaned) : {};
  } catch {
    // failed to parse → keep raw string so routes can decide how to handle it
    req.safeBody = raw;
  }
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 🔥 Shared In-Memory Database
const userDB = new Set();
userDB.add("alice@example.com");
userDB.add("bob@test.org");

// Helper: small security scanner for params / bodies / names
const isMalicious = (s = "") => {
  if (!s || typeof s !== "string") return false;
  const lower = s.toLowerCase();
  return (
    lower.includes("' or ") || lower.includes("1=1") ||
    lower.includes("<script>") || lower.includes("javascript:") ||
    lower.includes(" onerror") || lower.includes("--") || lower.includes("';")
  );
};

// Helper: check if object has any keys (safely)
const hasKeys = (obj) => obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj).length > 0;

// =================================================================
// 👇 UNIFIED MOCK ENDPOINTS (GET & POST) 👇
// =================================================================

// OPTIONS preflight for /users (important for CORS)
app.options('/users', (req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  return res.sendStatus(204);
});

// 1. GET /users - Retrieve Users
app.get('/users', (req, res) => {
  // Use safeBody (GET should normally have none)
  const body = (req.safeBody && typeof req.safeBody === 'object') ? req.safeBody : {};

  // If client sent a content-type but it's not application/json, reject.
  const contentType = req.headers['content-type'];
  if (contentType && !contentType.includes('application/json')) {
    return res.status(400).json({ error: "Invalid Content-Type header (if provided, must include application/json)" });
  }

  // Enforce GET must not have a body (strict)
  if (hasKeys(body)) {
    return res.status(400).json({ error: "GET request must not have a body" });
  }

  // Validate pagination params (if provided)
  if (req.query.page && Number.isInteger(Number(req.query.page)) && Number(req.query.page) < 1) {
    return res.status(400).json({ error: "Invalid page number" });
  }
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const offset = req.query.offset ? Number(req.query.offset) : undefined;
  if (req.query.limit && (isNaN(limit) || limit < 0)) return res.status(400).json({ error: "Invalid limit" });
  if (req.query.offset && (isNaN(offset) || offset < 0)) return res.status(400).json({ error: "Invalid offset" });

  // Global Security Scanner (Query Params)
  const allQueryParams = Object.values(req.query).join(' ').toLowerCase();
  if (isMalicious(allQueryParams)) {
    return res.status(400).json({ error: "Security Alert: Malicious query detected" });
  }

  // Success Response
  const usersList = Array.from(userDB).map((email, idx) => ({
    id: idx + 1,
    name: "Test User",
    email: email
  }));

  return res.status(200).json({
    data: usersList,
    page: 1,
    total: usersList.length
  });
});

// 2. POST /users - Create User
app.post('/users', (req, res) => {
  // Accept either parsed object (if valid JSON) or raw string (invalid JSON testcases)
  const body = (req.safeBody && typeof req.safeBody === 'object') ? req.safeBody : (typeof req.safeBody === 'string' ? { raw: req.safeBody } : {});

  const allowedKeys = ['name', 'email'];
  const receivedKeys = Object.keys(body || {});

  // Strict Payload Validation (No extra fields)
  const extraKeys = receivedKeys.filter(key => !allowedKeys.includes(key));
  if (extraKeys.length > 0) {
    return res.status(400).json({ error: `Unexpected fields detected: ${extraKeys.join(', ')}` });
  }

  const { name, email } = body || {};

  // Type Checking
  if (typeof name !== 'string' || typeof email !== 'string') {
    return res.status(400).json({ error: "Invalid data types" });
  }

  // Required Fields
  if (!name.trim() || !email.trim()) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Email Regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email === "invalid-email") {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Duplicate Check
  if (userDB.has(email)) {
    return res.status(409).json({ error: "User already exists" });
  }

  // Smart Security (Block malicious SQL/XSS)
  if (isMalicious(name) || isMalicious(email)) {
    return res.status(400).json({ error: "Security Alert: Malicious input detected" });
  }

  // Success
  userDB.add(email);
  return res.status(201).json({
    id: Math.floor(Math.random() * 10000),
    name,
    email,
    createdAt: new Date()
  });
});

// 3. Handle Unsupported Methods (PUT, DELETE, PATCH, etc.)
app.all('/users', (req, res) => {
  // If it's OPTIONS we already handled, so reply 405 for others
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return res.status(405).json({ error: "Method Not Allowed" });
});

// =================================================================
// 👆 END MOCK ENDPOINTS 👆
// =================================================================

app.use('/', testRoutes);

// JSON parse error handler (defensive: returns controlled 400 + raw preview)
// Place before the global errorHandler so it can handle body-parsing type errors if any
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.warn('JSON parse failed. Raw body (preview):', String(req.rawBody ?? '').slice(0, 1000));
    return res.status(400).json({ success: false, error: 'Invalid JSON received', rawPreview: String(req.rawBody ?? '').slice(0, 1000) });
  }
  next(err);
});

app.use(errorHandler);

export default app;
