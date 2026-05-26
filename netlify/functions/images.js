exports.handler = async function(event, context) {
    const query = event.queryStringParameters.q;
    const UNSPLASH_KEY = process.env.UNSPLASH_API_KEY;

    try {
        const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=4&orientation=landscape`, {
            headers: {
                "Authorization": `Client-ID ${UNSPLASH_KEY}`
            }
        });

        const data = await response.json();
        
        // Check if Unsplash rejected request
        if (!response.ok) {
            console.error("Unsplash API Rejected:", data.errors);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: data.errors ? data.errors[0] : "API request failed" })
            };
        }

        // Only run map if 'results' exists
        const urls = data.results.map(img => img.urls.small);

        return {
            statusCode: 200,
            body: JSON.stringify(urls)
        };

    } catch (error) {
        console.error("Unsplash Fatal Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Image engine failed completely" })
        };
    }
};