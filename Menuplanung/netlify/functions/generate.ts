import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  // Nur POST-Anfragen erlauben
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    console.log("Function execution started.");
    
    // API-Schlüssel aus den Umgebungsvariablen holen und prüfen
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing.");
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "GEMINI_API_KEY is not configured in Netlify environment variables." }) 
      };
    }
    console.log("API key found.");

    // Das Google AI Paket dynamisch importieren, um Kaltstart-Probleme zu minimieren
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Ein stabiles und weniger ressourcenintensives Modell für den Test verwenden
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("Google AI model initialized.");
    
    // Den Request-Body sicher parsen
    const body = JSON.parse(event.body || '{}');
    const prompt = body.promptObject;

    if (!prompt) {
        console.error("Prompt object is missing in the request body.");
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Request body must contain a 'promptObject'."})
        };
    }
    
    console.log("Generating content for the received prompt...");
    const result = await model.generateContent(JSON.stringify(prompt));
    const response = result.response;
    const text = response.text();
    
    console.log("Successfully generated content.");
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };

  } catch (error) {
    // Detailliertes Fehler-Logging
    console.error("An error occurred in the function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "An internal error occurred.",
        details: error instanceof Error ? error.message : String(error)
      })
    };
  }
};
