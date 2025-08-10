import { Handler } from '@netlify/functions';
// Der dynamische Import wird unten verwendet, daher ist kein Top-Level-Import nötig.
// import { GoogleGenerativeAI } from '@google/generative-ai';

export const handler: Handler = async (event) => {
  // CORS-Header, um Anfragen von jeder Domain zu erlauben (wichtig für lokale Entwicklung)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Behandelt die Pre-Flight-Anfrage des Browsers für CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Erlaubt nur POST-Anfragen für die eigentliche Ausführung
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    console.log("Function called with raw body:", event.body);
    
    // Sicheres Parsen des Request-Bodys mit Fallback-Werten
    let parsedBody = {};
    let promptObject = null;
    let schema = null;
    
    try {
      parsedBody = JSON.parse(event.body || '{}');
      console.log("Parsed body:", parsedBody);
      
      // Versucht, den Prompt aus verschiedenen möglichen Schlüsseln zu extrahieren
      promptObject = parsedBody.promptObject || 
                     parsedBody.prompt || 
                     parsedBody.query || 
                     parsedBody.text;
                     
      schema = parsedBody.schema || parsedBody.responseSchema || null;

      if (!promptObject) {
        console.error("Error: Prompt data is missing from the request body.");
        return { 
          statusCode: 400, 
          headers,
          body: JSON.stringify({ 
            error: "Request body must contain a 'promptObject' or 'prompt' key.",
            receivedData: parsedBody
          }) 
        };
      }

    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Invalid JSON in request body" }) 
      };
    }
    
    // API-Schlüssel prüfen
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing from environment variables.");
      return { 
        statusCode: 500, 
        headers,
        body: JSON.stringify({ error: "API key is missing" }) 
      };
    }
    
    // Google AI dynamisch importieren und initialisieren
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // KORREKTUR: Den korrekten und empfohlenen Modellnamen verwenden
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    
    // Anfrage an Google AI senden
    console.log("Sending prompt to Google AI with Gemini 1.5 Pro...");
    let generationResult;
    
    // Konfiguration für mehr Kreativität
    const generationConfig = {
      temperature: 0.9, // Hoher Wert für mehr Kreativität und Abwechslung
      maxOutputTokens: 4096, // Erhöhtes Limit für komplexere Pläne
    };
    
    if (schema) {
      // Generierung mit einem spezifischen JSON-Schema für strukturierte Antworten
      console.log("Generating with schema.");
      generationResult = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: JSON.stringify(promptObject) }] }],
        generationConfig: {
          ...generationConfig,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });
    } else {
      // Standard-Textgenerierung ohne Schema
      console.log("Generating without schema.");
      generationResult = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: typeof promptObject === 'string' ? promptObject : JSON.stringify(promptObject) }] }],
          generationConfig: generationConfig
      });
    }
    
    const text = generationResult.response.text();
    console.log("Response from Google AI:", text.substring(0, 150) + "...");
    
    // Erfolgreiche Antwort zurücksenden
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text })
    };

  } catch (error) {
    console.error("Unhandled function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      })
    };
  }
};
