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
    let promptContent = body.promptObject || body.prompt;

    if (!promptContent) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Request body must contain 'promptObject' or 'prompt'." }) 
      };
    }

    // Den Prompt-Inhalt in einen String umwandeln, falls es ein Objekt ist
    let promptString = typeof promptContent === 'string' 
        ? promptContent 
        : JSON.stringify(promptContent);

    // NEU: Explizite Anweisung für das JSON-Format zum Prompt hinzufügen
    promptString += `\n\nDeine Antwort MUSS exakt folgendes JSON-Format haben, ohne jeglichen Zusatztext oder Erklärungen:
    {
      "mittag": {
        "suppe": "Name der Suppe",
        "dessert": "Name des Desserts",
        "menu": "Name des Hauptgerichts",
        "vegi": "Name des vegetarischen Gerichts"
      },
      "abend": {
        "menu": "Name des Abendessen-Hauptgerichts",
        "vegi": "Name des vegetarischen Abendessens"
      }
    }
    
    WICHTIG: Gib NUR das pure JSON-Objekt zurück!`;
    
    console.log("Sending request to OpenAI...");

    // OpenAI API-Aufruf mit JSON-Modus
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: "Du bist ein KI-Küchenchef für ein Schweizer Altersheim. Deine Aufgabe ist es, genaue Menüpläne nach den angegebenen Regeln zu erstellen. Deine Antworten MÜSSEN ein valides JSON-Objekt sein, exakt im vorgegebenen Format, ohne Zusatztexte."
        },
        {
          role: "user", 
          content: promptString
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    
    // Antwort extrahieren
    const responseText = completion.choices[0].message.content;

    // NEU: Validierung der Antwortstruktur
    try {
      const parsedResponse = JSON.parse(responseText || '{}');
      
      // Prüfen, ob alle benötigten Felder vorhanden sind
      if (!parsedResponse.mittag || !parsedResponse.abend || 
          !parsedResponse.mittag.suppe || !parsedResponse.mittag.dessert || 
          !parsedResponse.mittag.menu || !parsedResponse.mittag.vegi ||
          !parsedResponse.abend.menu || !parsedResponse.abend.vegi) {
        
        console.error("Invalid response structure from OpenAI:", responseText);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: "OpenAI generated an invalid response structure",
            response: responseText
          })
        };
      }
      
      // Korrekte Antwort zurückgeben
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: responseText })
      };

    } catch (parseError) {
      console.error("Invalid JSON in response from OpenAI:", responseText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: "OpenAI did not return valid JSON",
          response: responseText
        })
      };
    }

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
