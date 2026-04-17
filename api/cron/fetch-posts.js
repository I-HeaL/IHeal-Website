import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Final Company Posts Endpoint with Numerical ID
        const url = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/posts?company_id=108797979';
        
        console.log('Fetching LinkedIn Company Posts via Fresh API...');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'fresh-linkedin-scraper-api.p.rapidapi.com',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        
        // --- DEBUG LOG ---
        console.log('Raw API Response Snippet:', JSON.stringify(result).substring(0, 500));

        // The API returns posts inside the 'data' field
        const rawPosts = result.data || [];
        
        // 2. Precise Mapping
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            return {
                text: post.text || post.commentary || '',
                date: post.posted_at || 'Recent',
                image: post.image_url || post.image || (post.images && post.images.length > 0 ? post.images[0] : null)
            };
        });

        // 3. Safeguard: Only update KV if data is valid
        if (mappedPosts.length > 0) {
            console.log(`Successfully fetched ${mappedPosts.length} company posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('API returned 0 posts. Current KV data preserved.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('Final API Attempt Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
