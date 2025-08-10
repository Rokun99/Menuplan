import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const handler: Handler = async (event) => {
  // CORS-Header für die Kompatibilität
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
    const promptObject = body.promptObject;
    
    if (!promptObject) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "promptObject is required." }) 
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
    
    // Prompt erstellen
    const prompt = typeof promptObject === 'string' ? promptObject : JSON.stringify(promptObject);
    
    // Definiere das Schema für die Antwort
    const responseSchema = {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: { type: "string" }
        }
      }
    };
    
    // Google Gemini API-Aufruf
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });
    
    const response = await result.response;
    let responseText = response.text();
    
    // Entferne problematische Zeichen
    responseText = responseText.replace(/\\/g, '').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText })
    };
    
  } catch (error) {
    console.error("Suggestion function error:", error);
    
    const errorMessage = error.toString();
    if (errorMessage.includes("429") || errorMessage.includes("quota")) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: "Google Gemini API Rate-Limit erreicht.",
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
