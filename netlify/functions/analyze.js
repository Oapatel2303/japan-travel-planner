// netlify/functions/analyze.js

exports.handler = async function(event, context) {
    // 1. Grab JSON payload
    const body = JSON.parse(event.body);
    const tripData = body.tripData;
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert travel agent analyzing a JSON itinerary. 
                        
                        CRITICAL INSTRUCTIONS: 
                        1. You MUST base all geographic distances and travel times strictly on the coordinates (lat/lng) provided in the data. 
                        2. Do NOT guess locations based on names, as this leads to severe geographic hallucinations.
                        3. Look for real red flags: impossible travel times, geographic backtracking across different days, or unrealistic pacing. 
                        
                        Keep your analysis under 3 paragraphs. Use bullet points for warnings.`
                    },
                    {
                        role: "user",
                        content: `Here is my trip data: ${JSON.stringify(tripData)}`
                    }
                ]
            })
        });

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Analysis Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Analysis engine failed" })
        };
    }
};