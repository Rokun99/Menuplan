// Transpiled from user-provided TypeScript for compatibility, with Gemini API calls fixed to adhere to guidelines.
import { createHash } from "crypto";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";

const CONFIG = {
  MODELS: {
    FAST: "gemini-2.5-flash",
    PRO: "gemini-2.5-flash", 
  },
  GENERATION: {
    temperatureBase: 0.5,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 2048,
  },
  RESPONSE: {
    mimeType: "application/json",
  },
  SAFETY: {
    settings: [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  },
  RATE_LIMIT: {
    RPM: 30, BURST: 8, BURST_WINDOW_MS: 5000,
  },
  CACHE_TTL_MS: 60 * 60 * 1000, // 1 hour
  TIMEOUT_MS: 25_000,
  MAX_RETRIES: 3,
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json",
};

const memoryCache = new Map();
const rateLimitMap = new Map();

const ok = (body) => ({
  statusCode: 200,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

const err = (code, message, stage, extra = {}) => {
  return ok({
    success: false,
    data: { suggestions: [] },
    error: { code, message, stage },
    diagnostics: extra,
  });
};

const getClientIp = (event) => (event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || event.headers?.["client-ip"] || event.ip || "unknown");

const checkRateLimit = (ip) => {
  const now = Date.now();
  const windowStart = now - 60_000;
  const burstStart = now - CONFIG.RATE_LIMIT.BURST_WINDOW_MS;
  const arr = rateLimitMap.get(ip) || [];
  const recent = arr.filter((t) => t >= windowStart);
  const recentBurst = arr.filter((t) => t >= burstStart);
  if (recent.length >= CONFIG.RATE_LIMIT.RPM || recentBurst.length >= CONFIG.RATE_LIMIT.BURST) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
};

const hashKey = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const setCache = (key, value) => memoryCache.set(key, { value, expiresAt: Date.now() + CONFIG.CACHE_TTL_MS });
const getCache = (key) => {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) memoryCache.delete(key);
    return null;
  }
  return entry.value;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = async (promise, ms) => {
  let id;
  const timeout = new Promise((_, reject) => { id = setTimeout(() => reject(new Error("Timeout")), ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (id) clearTimeout(id);
  }
};

const sanitizeString = (s) => String(s || "").replace(/\s+/g, " ").trim();
const cleanJsonResponse = (text) => text.replace(/^```(?:json)?/gi, "").replace(/```$/g, "").trim();

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
};
const similarity = (a, b) => 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / (Math.max(a.length, b.length) || 1);

const extractSuggestions = (parsed) => {
  if (!parsed) return [];
  const suggestions = parsed.suggestions || parsed.items || (Array.isArray(parsed) ? parsed : []);
  return suggestions.filter(x => typeof x === 'string');
};

const handlerImpl = async (event) => {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    if (event.httpMethod !== "POST") return err("METHOD_NOT_ALLOWED", "Method Not Allowed. Use POST.", "VALIDATION");
    if (!checkRateLimit(getClientIp(event))) return err("RATE_LIMIT_EXCEEDED", "Rate limit exceeded.", "RATE_LIMIT");
    if (!process.env.API_KEY) return err("NO_API_KEY", "API key is not configured on the server.", "CONFIGURATION");
    
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return err("INVALID_JSON", "Invalid JSON body.", "VALIDATION"); }

    const { promptString, schema, modelPreference, useCache = true, existingItems = [], maxSuggestions = 8 } = body || {};
    if (!promptString) return err("MISSING_PROMPT", "Missing required field: promptString", "VALIDATION");

    const modelName = CONFIG.MODELS[(modelPreference?.toUpperCase())] || CONFIG.MODELS.FAST;
    const cacheKey = hashKey({ modelName, promptString, schema, maxSuggestions, existingItems });
    if (useCache) {
        const cached = getCache(cacheKey);
        if (cached) return ok({ ...cached, diagnostics: { ...cached.diagnostics, cacheHit: true } });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let previous = [];
    let lastError = null;

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            const config = {
                temperature: CONFIG.GENERATION.temperatureBase + (attempt - 1) * 0.1,
                topP: CONFIG.GENERATION.topP, topK: CONFIG.GENERATION.topK,
                maxOutputTokens: CONFIG.GENERATION.maxOutputTokens, responseMimeType: CONFIG.RESPONSE.mimeType,
                responseSchema: schema || undefined,
            };

            const result = await withTimeout(
                ai.models.generateContent({ model: modelName, contents: promptString, config, safetySettings: CONFIG.SAFETY.settings }),
                CONFIG.TIMEOUT_MS
            );
            
            const rawText = cleanJsonResponse(result.text || "");
            let parsed;
            try { parsed = JSON.parse(rawText); } catch { return err("PARSE_FAILED", "Invalid JSON from model.", "PARSE", { rawPreview: rawText.slice(0, 100) }); }

            const existing = new Set((existingItems || []).map(s => sanitizeString(s)));
            const collected = extractSuggestions(parsed).map(s => sanitizeString(s));
            const unique = collected.filter(item => !existing.has(item) && !previous.some(p => similarity(p, item) >= 0.9));

            const suggestions = unique.slice(0, Math.max(1, maxSuggestions));

            if (suggestions.length > 0) {
                const diagnostics = { model: modelName, usage: result.usageMetadata, cacheHit: false, attempt, parseFixed: false };
                const response = { success: true, data: { suggestions }, diagnostics };
                if (useCache) setCache(cacheKey, response);
                return ok(response);
            }
            previous.push(...collected);
        } catch (err) {
            lastError = err;
            if (attempt < CONFIG.MAX_RETRIES) {
                await sleep(400 * Math.pow(2, attempt - 1) + Math.random() * 200);
                continue;
            }
        }
    }
    return err("GENERATION_FAILED", `Failed after ${CONFIG.MAX_RETRIES} attempts`, "GENERATION", { lastError: String(lastError) });
};

export const handler = (event, context) => handlerImpl(event).catch(e => err("INTERNAL_ERROR", e.message, "HANDLER"));
