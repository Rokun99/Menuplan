import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import crypto from 'crypto';

// Enhanced configuration
const CONFIG = {
  MAX_RETRIES: 4,
  RETRY_DELAY: 1500,
  CACHE_TTL: 3600000, // 1 hour
  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 40,
    BURST_LIMIT: 5
  },
  MODELS: {
    FAST: 'gemini-1.5-flash-latest',
    PRO: 'gemini-1.5-pro-latest'
  },
  TEMPERATURE: {
    DEFAULT: 0.8,
    CREATIVE: 1.2,
    CONSERVATIVE: 0.4
  }
};

// Enhanced prompt templates for menu generation
const PROMPT_TEMPLATES = {
  menuGeneration: {
    system: `Du bist ein erfahrener Küchenchef mit 20+ Jahren Erfahrung in Schweizer Altersheimen.
    Deine Expertise umfasst:
    - Ernährung für ältere Menschen (Kau-/Schluckbeschwerden, Nährstoffbedarf)
    - Schweizer und regionale Küche
    - Saisonale Menüplanung
    - Kosteneffiziente Grossküche
    - Diätetische Anforderungen (Diabetes, Salzarm, Vegetarisch)`,
    
    enhancers: {
      seasonal: (season) => `Fokussiere auf ${season}-typische Zutaten aus der Region.`,
      nutritional: (context) => `Beachte: ${context.proteinNeeds ? 'Erhöhter Proteinbedarf' : ''} 
        ${context.fiberNeeds ? 'Ballaststoffreich' : ''} ${context.lowSodium ? 'Salzreduziert' : ''}`,
      variety: (recentMeals) => `Vermeide Wiederholungen dieser Gerichte: ${recentMeals.join(', ')}`,
      texture: () => `Berücksichtige verschiedene Texturen: weich gekocht, püriert-Option, normal.`
    }
  }
};

// Distributed cache implementation
class DistributedCache {
  constructor() {
    this.memory = new Map();
    this.redis = null; // Initialize Redis connection if available
  }

  async get(key) {
    const memoryResult = this.memory.get(key);
    if (memoryResult && Date.now() - memoryResult.timestamp < CONFIG.CACHE_TTL) {
      return memoryResult.data;
    }
    
    if (this.redis) {
      try {
        const redisResult = await this.redis.get(key);
        if (redisResult) {
          const parsed = JSON.parse(redisResult);
          this.memory.set(key, parsed); // Update memory cache
          return parsed.data;
        }
      } catch (e) {
        console.error('Redis error:', e);
      }
    }
    
    return null;
  }

  async set(key, data) {
    const cacheData = { data, timestamp: Date.now() };
    this.memory.set(key, cacheData);
    
    if (this.redis) {
      try {
        await this.redis.setex(key, CONFIG.CACHE_TTL / 1000, JSON.stringify(cacheData));
      } catch (e) {
        console.error('Redis error:', e);
      }
    }
    
    // Cleanup old entries
    if (this.memory.size > 100) {
      const sortedEntries = Array.from(this.memory.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 20; i++) {
        this.memory.delete(sortedEntries[i][0]);
      }
    }
  }
}

const cache = new DistributedCache();
const rateLimiter = new Map();

// Enhanced prompt builder with context awareness
function buildEnhancedPrompt(promptObject, attempt = 1, previousResponses = []) {
  const { role, task, context, rules, examples } = promptObject;
  
  const temperature = context.requiresCreativity 
    ? Math.min(CONFIG.TEMPERATURE.CREATIVE + (attempt * 0.1), 1.5)
    : CONFIG.TEMPERATURE.DEFAULT;
  
  let enhancedPrompt = `${PROMPT_TEMPLATES.menuGeneration.system}\n\n`;
  enhancedPrompt += `ROLLE: ${role}\n`;
  enhancedPrompt += `AUFGABE: ${task}\n\n`;
  
  enhancedPrompt += `KONTEXT:\n`;
  Object.entries(context).forEach(([key, value]) => {
    if (value) enhancedPrompt += `- ${key}: ${JSON.stringify(value)}\n`;
  });
  
  enhancedPrompt += `\nREGELN:\n`;
  rules.forEach((rule, index) => {
    enhancedPrompt += `${index + 1}. ${rule}\n`;
  });
  
  if (attempt > 1) {
    enhancedPrompt += `\nWICHTIG: Dies ist Versuch ${attempt}. 
    Generiere KOMPLETT ANDERE Vorschläge als: ${previousResponses.join(', ')}.
    Sei ${attempt > 2 ? 'besonders kreativ und unkonventionell' : 'kreativ mit neuen Ideen'}.`;
  }
  
  if (examples && examples.length > 0) {
    enhancedPrompt += `\nBEISPIELE erfolgreicher Vorschläge:\n`;
    examples.forEach(ex => enhancedPrompt += `- ${ex}\n`);
  }
  
  return { prompt: enhancedPrompt, temperature };
}

// Similarity detection for response validation
function calculateSimilarity(str1, str2) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9äöüàéè]/g, '');
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Enhanced response processor with validation
function processAndValidateResponse(text, schema, existingItems = []) {
  try {
    const cleaned = text
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\/g, '')
      .trim();
      
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const fixed = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      parsed = JSON.parse(fixed);
    }
    
    let suggestions = parsed.suggestions || parsed.items || parsed;
    if (!Array.isArray(suggestions)) {
      suggestions = Object.values(suggestions);
    }
    
    const uniqueSuggestions = suggestions.filter(suggestion => {
      const isTooSimilar = existingItems.some(existing => 
        calculateSimilarity(suggestion, existing) > 0.7
      );
      return !isTooSimilar && suggestion.length > 3;
    });
    
    if (schema && schema.properties) {
      return { suggestions: uniqueSuggestions };
    }
    
    return uniqueSuggestions;
    
  } catch (error) {
    console.error('Response processing error:', error);
    throw new Error('Failed to process AI response');
  }
}

// Main handler with progressive enhancement
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  
  try {
    const now = Date.now();
    const userRateLimit = rateLimiter.get(clientIp) || { requests: [], burst: 0 };
    
    userRateLimit.requests = userRateLimit.requests.filter(t => now - t < 60000);
    
    const recentRequests = userRateLimit.requests.filter(t => now - t < 5000).length;
    if (recentRequests >= CONFIG.RATE_LIMIT.BURST_LIMIT) {
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Burst limit exceeded. Please wait a moment.',
          retryAfter: 5 
        })
      };
    }
    
    if (userRateLimit.requests.length >= CONFIG.RATE_LIMIT.REQUESTS_PER_MINUTE) {
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60 
        })
      };
    }
    
    userRateLimit.requests.push(now);
    rateLimiter.set(clientIp, userRateLimit);
    
    const { promptObject, schema, existingItems = [], useCache = true, modelPreference = 'FAST' } = JSON.parse(event.body);
    
    const cacheKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ promptObject, schema }))
      .digest('hex');
      
    if (useCache) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            text: JSON.stringify(cached),
            cached: true,
            model: 'cache'
          })
        };
      }
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let modelName = modelPreference === 'PRO' ? CONFIG.MODELS.PRO : CONFIG.MODELS.FAST;
    
    let lastError;
    let allResponses = [];
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        const { prompt, temperature } = buildEnhancedPrompt(
          promptObject, 
          attempt, 
          allResponses
        );
        
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: temperature,
            topK: attempt > 2 ? 50 : 40,
            topP: attempt > 2 ? 0.95 : 0.9,
            maxOutputTokens: 2048,
            responseMimeType: schema ? "application/json" : "text/plain",
            responseSchema: schema
          },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
          ]
        });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Generation timeout')), 25000)
        );
        
        const result = await Promise.race([
          model.generateContent(prompt),
          timeoutPromise
        ]);
        
        const responseText = result.response.text();
        
        const processed = processAndValidateResponse(
          responseText, 
          schema, 
          [...existingItems, ...allResponses]
        );
        
        const suggestions = processed.suggestions || processed;
        if (Array.isArray(suggestions) && suggestions.length >= 3) {
          await cache.set(cacheKey, processed);
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              text: JSON.stringify(processed),
              model: modelName,
              attempt: attempt,
              temperature: temperature
            })
          };
        }
        
        allResponses = [...allResponses, ...suggestions];
        
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        lastError = error;
        
        if (attempt < CONFIG.MAX_RETRIES) {
          await new Promise(resolve => 
            setTimeout(resolve, CONFIG.RETRY_DELAY * Math.pow(1.5, attempt - 1))
          );
          
          if (attempt === 2 && modelName === CONFIG.MODELS.FAST) {
            console.log('Switching to Pro model for better results');
            modelName = CONFIG.MODELS.PRO;
          }
        }
      }
    }
    
    throw lastError || new Error('Failed to generate adequate response');
    
  } catch (error) {
    console.error('Handler error:', error);
    
    return {
      statusCode: error.message.includes('Rate limit') ? 429 : 500,
      body: JSON.stringify({
        error: 'Generation failed',
        message: error.message,
        suggestions: [] // Fallback empty array
      })
    };
  }
};
