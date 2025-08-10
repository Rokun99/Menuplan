import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const promptObject = body.promptObject || body.prompt;
    const schema = body.schema;
    
    if (!promptObject) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Request body must contain 'promptObject' or 'prompt'." }) 
      };
    }
    
    // Google Gemini API-Client initialisieren
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest",
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });
    
    // Prompt-Inhalt vorbereiten
    let promptContent = typeof promptObject === 'string' ? promptObject : JSON.stringify(promptObject);
    
    // Zusätzliche, extrem strenge Anweisungen für Vielfalt
    promptContent += `\n\nEXTREM WICHTIGE REGELN (BEFOLGE SIE STRENG!):
    1. ABSOLUTE EINZIGARTIGKEIT: JEDES Gericht (Suppe, Dessert, Menü, Vegi) MUSS 100% EINZIGARTIG sein! Keine Wiederholung in der Woche!
    2. ÜBERPRÜFE ALLES: Vergleiche mit plan_so_far_this_week und stelle sicher, dass KEIN Gericht (nicht nur Hauptgerichte) wiederholt wird!
    3. KEINE BACKSLASHES ODER SONDERZEICHEN: Schreibe reine Textnamen ohne \\, /, Zeilenumbrüche oder ähnliches!
    4. MAXIMALE VIELFALT: Variiere Zutaten, Zubereitungsarten und Kategorien. Kein Gericht darf ähnlich klingen!
    5. ABENDESSEN-SPEZIALREGEL: Abend.menu und abend.vegi MÜSSEN IMMER unterschiedlich sein, außer bei Vegi-Tagen!`;
    
    // Gemini API-Aufruf
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptContent }] }],
      generationConfig: {
        temperature: 0.95, // Hohe Temperatur für maximale Vielfalt
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    
    const response = await result.response;
    let responseText = response.text();
    
    // Entferne problematische Zeichen (Backslashes, Zeilenumbrüche usw.)
    responseText = responseText
      .replace(/\\/g, '')  // Backslashes entfernen
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .trim(); // Überflüssige Leerzeichen entfernen
      
    // Validiere grundlegende Struktur
    try {
      const parsed = JSON.parse(responseText);
      if (schema && schema.properties.mittag && (!parsed.mittag || !parsed.abend)) {
        throw new Error("Invalid structure: missing 'mittag' or 'abend' keys.");
      }
    } catch (e) {
      console.error("Invalid JSON structure from AI:", responseText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Generated invalid JSON structure", details: responseText })
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText })
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(error) })
    };
  }
};
