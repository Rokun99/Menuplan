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
    const promptObject = body.promptObject;
    
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
      
    promptContent += `\n\nDeine Antwort MUSS ein valides JSON-Objekt sein, das ein Array von 5-7 einfachen, kurzen Gerichtnamen unter dem Schlüssel "suggestions" enthält (z.B. {"suggestions": ["Gericht 1", "Gericht 2"]}). KEINE Zeilenumbrüche oder Backslashes (\\) in den Texten!`;
    
    // OpenAI API-Aufruf
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: "Du bist ein Experte für Menüplanungen und Rezepte. Erstelle präzise, abwechslungsreiche Vorschläge. Deine Antwort muss immer ein valides JSON-Objekt sein, das ein Array von Strings unter dem Schlüssel 'suggestions' enthält."
        },
        { role: "user", content: promptContent }
      ],
      response_format: { type: "json_object" }, 
      temperature: 0.8
    });
    
    // Antwort extrahieren
    const responseText = completion.choices[0].message.content || '{"suggestions": []}';
    
    // JSON parsen und das Array extrahieren
    const parsedJson = JSON.parse(responseText);
    const suggestions = parsedJson.suggestions || [];

    return {
      statusCode: 200,
      headers,
      // Wir geben direkt das Array als Text zurück, wie es das Frontend erwartet
      body: JSON.stringify({ text: JSON.stringify(suggestions) })
    };
    
  } catch (error) {
    console.error("Suggestion function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(error) })
    };
  }
};
