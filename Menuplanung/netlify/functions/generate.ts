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
    
    // Verwende das "flash"-Modell für höhere Limits und deaktiviere Sicherheitseinstellungen für Menüplanung
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
    let promptContent = typeof promptObject === 'string' 
      ? promptObject 
      : JSON.stringify(promptObject);
      
    // Für Wochenplanungen (erkennbar am komplexeren Schema) füge zusätzliche Anweisungen hinzu
    if (schema && schema.properties && schema.properties.mittag) {
      promptContent += `\n\nEXTREM WICHTIGE REGELN:
      1. ABSOLUT KEINE WIEDERHOLUNGEN: Kein Gericht (Suppe, Dessert, Menü, Vegi) darf sich in der GESAMTEN Woche wiederholen!
      2. ÜBERPRÜFE JEDEN TAG gegen alle vorherigen Tage auf Duplikate!
      3. KEINE BACKSLASHES (\\): Entferne alle Backslash-Zeichen aus der Ausgabe!
      4. KOMPLETTE VIELFALT: Jede Mahlzeit muss vollständig einzigartig sein!
      5. EINDEUTIGE GERICHTE: Jeder Tag braucht unterschiedliche Suppen, Desserts und alle anderen Gerichte.`;
    }
    
    // Google Gemini API-Aufruf
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptContent }] }],
      generationConfig: {
        temperature: schema ? 0.9 : 0.7, // Höhere Temperatur für Wochenplan
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    
    const response = await result.response;
    let responseText = response.text();
    
    // Entferne Backslashes und problematische Zeichen
    responseText = responseText.replace(/\\/g, '').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText })
    };

  } catch (error) {
    console.error("Function error:", error);
    
    // Spezifische Fehlerbehandlung für Gemini-Rate-Limits
    const errorMessage = error.toString();
    if (errorMessage.includes("429") || errorMessage.includes("quota")) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: "Google Gemini API Rate-Limit erreicht. Bitte versuchen Sie es später erneut.",
          details: errorMessage
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      })
    };
  }
};
