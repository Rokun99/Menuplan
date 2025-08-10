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
    let promptContent = body.promptObject || body.prompt;
    const schema = body.schema;
    
    if (!promptContent) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Request body must contain 'promptObject' or 'prompt'." }) 
      };
    }
    
    // OpenAI-Client initialisieren
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Prompt-Inhalt vorbereiten
    let promptString = typeof promptContent === 'string' 
      ? promptContent 
      : JSON.stringify(promptContent);
      
    // Prüfen, ob es ein Vorschlag-Request ist
    const isSuggestionRequest = !schema || 
                                promptString.includes("Vorschläge") || 
                                promptString.includes("suggestions");
                                
    if (isSuggestionRequest) {
      // --- Handhabung für "Ideen generieren" ---
      console.log("Handling suggestion request...");
      promptString += `\n\nDeine Antwort MUSS ein valides JSON-Objekt sein, das ein Array von 5-7 einfachen, kurzen Gerichtnamen unter dem Schlüssel "suggestions" enthält (z.B. {"suggestions": ["Gericht 1", "Gericht 2"]}). KEINE Zeilenumbrüche oder Backslashes (\\) in den Texten!`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [
          {
            role: "system",
            content: "Du bist ein Experte für Menüplanung in Schweizer Pflegeheimen. Gib 5-7 kreative, abwechslungsreiche Vorschläge als JSON-Objekt mit einem 'suggestions'-Array zurück."
          },
          { role: "user", content: promptString }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8
      });
      
      const responseText = completion.choices[0].message.content || '{"suggestions":[]}';
      
      try {
        const parsed = JSON.parse(responseText);
        const suggestions = parsed.suggestions || (Array.isArray(parsed) ? parsed : []);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text: JSON.stringify(suggestions) })
        };
      } catch (e) {
        console.error("Failed to parse suggestions response:", responseText, e);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to parse suggestions from AI" })
        };
      }

    } else {
      // --- Handhabung für Wochenplanung ---
      console.log("Handling weekly plan request...");
      promptString += `\n\nEXTREM WICHTIGE REGELN:
      1. ABSOLUT KEINE WIEDERHOLUNGEN: Kein Gericht (Suppe, Dessert, Menü, Vegi) darf sich in der GESAMTEN Woche wiederholen!
      2. ÜBERPRÜFE JEDEN TAG gegen alle vorherigen Tage auf Duplikate!
      3. KEINE BACKSLASHES (\\): Entferne alle Backslash-Zeichen aus der Ausgabe!
      4. KOMPLETTE VIELFALT: Jede Mahlzeit muss vollständig einzigartig sein!
      5. EINDEUTIGE GERICHTE: VERMEIDE Wiederholungen!`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [
          {
            role: "system",
            content: `Du bist ein KI-Küchenchef für ein Schweizer Altersheim mit einem PERFEKTEN GEDÄCHTNIS. Deine wichtigste Aufgabe ist es, ABSOLUTE VIELFALT zu garantieren. Du musst jeden Tag mit allen bisherigen Tagen vergleichen, um Wiederholungen zu VERHINDERN. Verwende NIEMALS Backslash-Zeichen (\\) in deinen Antworten.`
          },
          { role: "user", content: promptString }
        ],
        response_format: { type: "json_object" },
        temperature: 1.0 // Maximale Kreativität
      });
      
      let responseText = completion.choices[0].message.content || '{}';
      
      // Gründliche, mehrstufige Bereinigung
      responseText = responseText.replace(/\\/g, '').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
      
      try {
        const cleanedJson = JSON.parse(responseText);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text: JSON.stringify(cleanedJson) })
        };
      } catch (e) {
        console.error("Failed to parse menu plan response:", responseText, e);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to parse menu plan from AI", details: e.message })
        };
      }
    }
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(error) })
    };
  }
};
