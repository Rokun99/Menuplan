import { Handler } from '@netlify/functions';

// Da wir den dynamischen Import verwenden, importieren wir die Typen hier nicht direkt
// import { GoogleGenerativeAI } from '@google/generative-ai';

export const handler: Handler = async (event) => {
  // Nur POST-Anfragen erlauben
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    console.log("Function execution started.");
    console.log("Raw request body:", event.body);
    
    // Den Request-Body sicher parsen
    const body = JSON.parse(event.body || '{}');
    console.log("Parsed request body:", body);

    // Prüfen, ob das erwartete 'promptObject' im Body vorhanden ist
    if (!body.promptObject) {
      console.error("Error: 'promptObject' is missing from the request body.");
      return { 
        statusCode: 400, 
        body: JSON.stringify({ 
          error: "Request body must contain a 'promptObject'.",
          receivedData: body // Senden Sie die empfangenen Daten zurück, um das Debugging zu erleichtern
        }) 
      };
    }
    
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

    // Das Google AI Paket dynamisch importieren
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Ein stabiles und effizientes Modell verwenden
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("Google AI model initialized.");
    
    // Sicherstellen, dass der Prompt-Inhalt ein String ist
    const promptContent = typeof body.promptObject === 'string' 
      ? body.promptObject 
      : JSON.stringify(body.promptObject);
      
    console.log("Generating content for the prompt...");
    const result = await model.generateContent(promptContent);
    const response = result.response;
    const text = response.text();
    
    console.log("Successfully generated content.");
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };

  } catch (error) {
    // Detailliertes Fehler-Logging für alle anderen Fehler
    console.error("An unexpected error occurred in the function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "An internal error occurred.",
        details: error instanceof Error ? error.message : String(error)
      })
    };
  }
};
