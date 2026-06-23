// netlify/functions/flight.js
exports.handler = async function(event, context) {
    const { flight_iata, flight_icao } = event.queryStringParameters;
    
    const API_KEY = process.env.AIRLABS_API_KEY;

    if (!API_KEY) return { statusCode: 500, body: JSON.stringify({ error: { message: "Server API Key Missing" } }) };

    let param = flight_icao ? `flight_icao=${flight_icao}` : `flight_iata=${flight_iata}`;

    try {
        const response = await fetch(`https://airlabs.co/api/v9/schedules?${param}&api_key=${API_KEY}`);
        const data = await response.json();
        
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: { message: "Internal Server Error" } }) 
        };
    }
};