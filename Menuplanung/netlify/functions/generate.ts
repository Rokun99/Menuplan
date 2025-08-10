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
      apiKey: process.env.OPENAI_API_KEY
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

    // Explizite Anweisung für das JSON-Format zum Prompt hinzufügen
    promptString += `\n\nWICHTIG: Deine Antwort MUSS exakt folgendes Format haben:
    {
      "mittag": {
        "suppe": "Name der Suppe (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)",
        "dessert": "Name des Desserts (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)",
        "menu": "Name des Hauptgerichts (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)",
        "vegi": "Name des vegetarischen Gerichts (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)"
      },
      "abend": {
        "menu": "Name des Abendessen-Hauptgerichts (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)",
        "vegi": "Name des vegetarischen Abendessens (ein kurzer, präziser Name ohne Zeilenumbrüche oder Backslashes)"
      }
    }
    
    WICHTIG: KEINE Zeilenumbrüche oder Backslashes (\\) in den Texten!`;
    
    console.log("Sending request to OpenAI...");

    // OpenAI API-Aufruf mit JSON-Modus
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: "Du bist ein KI-Küchenchef für ein Schweizer Altersheim. Erstelle kurze, präzise Gerichte ohne Zeilenumbrüche oder Sonderzeichen. Verwende NUR EINFACHE TEXT-STRINGS als Werte im JSON."
        },
        {
          role: "user", 
          content: promptString
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    
    // Antwort extrahieren und bereinigen
    let responseText = completion.choices[0].message.content || '{}';
    
    // Problematische Zeichen entfernen, die das Parsing stören könnten
    responseText = responseText
      .replace(/\\n/g, ' ')      // Zeilenumbrüche durch Leerzeichen ersetzen
      .replace(/\\"/g, '"')      // Escaped quotes korrigieren
      .replace(/\\r/g, '')       // Carriage returns entfernen
      .replace(/\\t/g, ' ');      // Tabs durch Leerzeichen ersetzen

    try {
      const parsedResponse = JSON.parse(responseText);
      
      // Rekursive Funktion zur Bereinigung aller Textfelder im Objekt
      const cleanTextFields = (obj: any) => {
        Object.keys(obj).forEach(key => {
          if (typeof obj[key] === 'string') {
            // Entfernt verbleibende Backslashes und trimmt Leerzeichen
            obj[key] = obj[key].replace(/\\/g, '').trim();
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            cleanTextFields(obj[key]);
          }
        });
        return obj;
      };
      
      const cleanedResponse = cleanTextFields(parsedResponse);
      
      // Validieren der Struktur
      if (!cleanedResponse.mittag || !cleanedResponse.abend || 
          !cleanedResponse.mittag.suppe || !cleanedResponse.mittag.dessert || 
          !cleanedResponse.mittag.menu || !cleanedResponse.mittag.vegi ||
          !cleanedResponse.abend.menu || !cleanedResponse.abend.vegi) {
        
        console.error("Invalid response structure after cleaning:", JSON.stringify(cleanedResponse));
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: "OpenAI generated an invalid response structure",
            response: cleanedResponse
          })
        };
      }
      
      // Bereinigtes und validiertes JSON zurückgeben
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: JSON.stringify(cleanedResponse) })
      };

    } catch (parseError) {
      console.error("Invalid JSON in response after cleaning:", responseText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: "OpenAI did not return valid JSON",
          responseText: responseText
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
