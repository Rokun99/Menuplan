import { GoogleGenAI } from "@google/genai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Content-Type": "application/json",
};

const ok = (body) => ({
  statusCode: 200,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

const err = (code, message, stage, extra = {}) => {
  return ok({
    success: false,
    data: { plan: null },
    error: { code, message, stage },
    diagnostics: extra,
  });
};

const getSampleNames = (list, filterFn, max = 15) => {
    if (!list) return [];
    const filtered = list.filter(filterFn);
    return filtered.sort(() => 0.5 - Math.random()).slice(0, max).map(r => r.name);
}

const getSeason = (date) => {
    const d = new Date(date);
    const month = d.getMonth();
    if (month > 1 && month < 5) return 'Frühling';
    if (month > 4 && month < 8) return 'Sommer';
    if (month > 7 && month < 11) return 'Herbst';
    return 'Winter';
};

const handlerImpl = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return err("METHOD_NOT_ALLOWED", "Method Not Allowed. Use POST.", "VALIDATION");
    }
    if (!process.env.API_KEY) {
        return err("NO_API_KEY", "API key is not configured on the server.", "CONFIGURATION");
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return err("INVALID_JSON", "Invalid JSON body.", "VALIDATION"); }

    const { date, recipes } = body;
    if (!date || !Array.isArray(recipes)) {
        return err("MISSING_DATA", "Missing 'date' or 'recipes' in request body.", "VALIDATION");
    }
    
    const currentDate = new Date(date);
    const season = getSeason(currentDate);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const samples = {
        suppe: getSampleNames(recipes, r => r.sourceCategory === 'suppe', 20),
        dessert: getSampleNames(recipes, r => r.sourceCategory === 'dessert', 20),
        hauptgang_fleisch: getSampleNames(recipes, r => r.sourceCategory === 'fleisch', 30),
        hauptgang_vegi: getSampleNames(recipes, r => r.sourceCategory === 'vegi', 30),
        fisch: getSampleNames(recipes, r => r.sourceCategory === 'fisch', 15),
        abend_menu: getSampleNames(recipes, r => r.sourceCategory === 'abend-menu', 20),
        abend_vegi: getSampleNames(recipes, r => r.sourceCategory === 'abend-vegi', 20),
    };

    const systemInstruction = "You are a structured planner for a menu-planning platform. Output must be strict JSON following the schema. Do NOT compute totals. Use concise numbers; free-form text only in notes. If uncertain, omit optional fields or use safe defaults and add a short notes hint. Response MIME type is application/json. No extra prose.";
    const userPrompt = `
      **Task:** Create a balanced, varied, and seasonal weekly menu plan for a Swiss retirement home.
      - **Season:** ${season}
      
      **Strict Rules:**
      1.  **FISH FRIDAY:** The lunch menu ("menu" category) on Friday MUST be a fish dish. No fish as a main course ("menu") on other days.
      2.  **VEGGIE DAY:** At least ONE day must be fully vegetarian (both lunch and dinner main courses, "menu" and "vegi").
      3.  **VARIETY:** Do not repeat any main course ("menu" or "vegi") within the week.
      4.  **SOURCE:** Use ONLY dishes from the provided recipe lists. Do not invent dishes.
      5.  **STRUCTURE:** Fill ALL fields for EVERY day (Mittag: suppe, dessert, menu, vegi; Abend: menu, vegi).
      
      **Available Recipes (Sample):**
      - Soups: ${JSON.stringify(samples.suppe)}
      - Desserts: ${JSON.stringify(samples.dessert)}
      - Main (Meat): ${JSON.stringify(samples.hauptgang_fleisch)}
      - Main (Vegi): ${JSON.stringify(samples.hauptgang_vegi)}
      - Fish (Friday Lunch only): ${JSON.stringify(samples.fisch)}
      - Dinner (Menu): ${JSON.stringify(samples.abend_menu)}
      - Dinner (Vegi): ${JSON.stringify(samples.abend_vegi)}
      
      **Output Schema:**
      Return a COMPLETE and valid JSON plan for the ENTIRE week (Monday to Sunday) matching this structure:
      { "Montag": { "mittag": { "suppe": "...", "dessert": "...", "menu": "...", "vegi": "..." }, "abend": { "menu": "...", "vegi": "..." } }, ... }
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
            }
        });

        const rawText = result.text.trim();
        let plan;
        try {
            plan = JSON.parse(rawText);
        } catch(e) {
            return err("PARSE_FAILED", `AI returned invalid JSON. Preview: ${rawText.slice(0,100)}`, "PARSE", { error: e.message });
        }
        
        const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
        if (!plan || !days.every(day => plan[day]?.mittag && plan[day]?.abend)) {
             return err("INCOMPLETE_PLAN", "AI returned an incomplete plan.", "VALIDATION");
        }

        return ok({ success: true, data: { plan }, diagnostics: { model: 'gemini-2.5-flash', usage: result.usageMetadata } });

    } catch (e) {
        return err("GENERATION_FAILED", `AI generation failed: ${e.message}`, "GENERATION");
    }
};

export const handler = (event, context) => handlerImpl(event).catch(e => err("INTERNAL_ERROR", e.message, "HANDLER"));
