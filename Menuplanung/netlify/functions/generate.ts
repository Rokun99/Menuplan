import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const handler: Handler = async (event) => {
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
    const schema = body.schema;
    
    if (!promptObject) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: "Request body must contain 'promptObject' or 'prompt'." }) 
      };
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY is not set.");
        return { statusCode: 500, headers, body: JSON.stringify({ error: "API key is not configured." }) };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest",
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });
    
    const promptContent = typeof promptObject === 'string' 
      ? promptObject 
      : JSON.stringify(promptObject);
      
    const isWeeklyPlan = schema && schema.properties && schema.properties.mittag;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptContent }] }],
      generationConfig: {
        temperature: isWeeklyPlan ? 0.9 : 0.7,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    
    const response = await result.response;
    let responseText = response.text();
    
    responseText = responseText.replace(/\\/g, '').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ').trim();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText })
    };

  } catch (error) {
    console.error("Function Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("429") || errorMessage.includes("quota")) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: "Google Gemini API Rate-Limit erreicht. Bitte versuchen Sie es später erneut.",
          details: errorMessage
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Ein interner Serverfehler ist aufgetreten.",
        details: errorMessage
      })
    };
  }
};
