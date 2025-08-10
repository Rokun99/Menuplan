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
    const body = JSON.parse(event.body || '{}');
    const promptObject = body.promptObject || body.prompt;
    
    if (!promptObject) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Prompt data is required." }) 
      };
    }
    
    // OpenAI-Client initialisieren
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Prompt für Einzelvorschläge optimieren
    let promptContent = typeof promptObject === 'string' 
      ? promptObject 
      : JSON.stringify(promptObject);
      
    promptContent += `\n\nDeine Antwort MUSS ein valides JSON-Array mit 5-7 einfachen, kurzen Gerichtnamen sein (z.B. ["Gericht 1", "Gericht 2"]). KEINE Zeilenumbrüche oder Backslashes (\\) in den Texten!`;
    
    // OpenAI API-Aufruf
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: "Du bist ein Experte für Menüplanungen und Rezepte. Erstelle präzise, abwechslungsreiche Vorschläge. Deine Antwort muss immer ein valides JSON-Array von Strings sein."
        },
        { role: "user", content: promptContent }
      ],
      // Wichtig: Wir erwarten hier ein Objekt, das ein Array enthält, um den JSON-Modus zu nutzen
      response_format: { type: "json_object" }, 
      temperature: 0.8
    });
    
    // Antwort extrahieren und bereinigen
    let responseText = completion.choices[0].message.content || '{"suggestions": []}';
    
    // JSON parsen und das Array extrahieren
    const parsedJson = JSON.parse(responseText);
    const suggestions = parsedJson.suggestions || parsedJson.ideen || []; // Flexibel für den Schlüsselnamen

    return {
      statusCode: 200,
      headers,
      // Wir geben direkt das Array als Text zurück, wie es das Frontend erwartet
      body: JSON.stringify({ text: JSON.stringify(suggestions) })
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
