import { Handler } from '@netlify/functions';
import OpenAI from 'openai';

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
    // OpenAI-Client initialisieren
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY // Dein neuer API-Schlüssel
    });
    
    // Körper parsen und Prompt-Inhalt extrahieren
    const body = JSON.parse(event.body || '{}');
    const promptContent = body.promptObject || body.prompt;

    if (!promptContent) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Request body must contain 'promptObject' or 'prompt'." }) 
      };
    }
    
    console.log("Sending request to OpenAI...");

    // OpenAI API-Aufruf mit JSON-Modus
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", // Kostengünstiges und zuverlässiges Modell für JSON
      messages: [
        {
          role: "system",
          content: "Du bist ein KI-Küchenchef, der Menüpläne für ein Schweizer Altersheim erstellt. Deine Ausgaben müssen immer exakt dem angeforderten JSON-Schema entsprechen. Gib NUR das JSON-Objekt zurück, ohne zusätzlichen Text oder Erklärungen."
        },
        {
          role: "user", 
          content: typeof promptContent === 'string' 
            ? promptContent 
            : JSON.stringify(promptContent)
        }
      ],
      response_format: { type: "json_object" }, // Erzwingt eine JSON-Antwort
      temperature: 0.7
    });
    
    // Antwort extrahieren
    const text = completion.choices[0].message.content;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text })
    };

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      })
    };
  }
};
