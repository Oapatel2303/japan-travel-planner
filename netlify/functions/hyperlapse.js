exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { frames } = JSON.parse(event.body);
        const mapillaryToken = process.env.MAPILLARY_CLIENT_TOKEN;

        // 1. We use Promise.all to fetch all images simultaneously instead of one by one
        const fetchPromises = frames.map(async (frame) => {
            try {
                // Radius search: "Find the best image within 30 meters of this GPS coordinate"
                const url = `https://graph.mapillary.com/images?lat=${frame.lat}&lng=${frame.lng}&radius=30&fields=thumb_1024_url`;
                
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `OAuth ${mapillaryToken}`
                    }
                });

                if (!response.ok) return null;

                const data = await response.json();
                
                // If an image exists in this area, return its URL
                if (data.data && data.data.length > 0) {
                    return data.data[0].thumb_1024_url;
                }
                return null; // Return null if it's a dead zone (e.g., deep in the mountains)
                
            } catch (err) {
                console.error("Failed fetching frame:", err);
                return null;
            }
        });

        // 2. Wait for all API calls to finish
        const rawUrls = await Promise.all(fetchPromises);
        
        // 3. Filter out any nulls so our video player doesn't crash on empty frames
        const validUrls = rawUrls.filter(url => url !== null);

        // 4. Send the final valid URLs back to the frontend video player
        return {
            statusCode: 200,
            body: JSON.stringify({ urls: validUrls })
        };

    } catch (error) {
        console.error("Hyperlapse API Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process hyperlapse frames' })
        };
    }
};