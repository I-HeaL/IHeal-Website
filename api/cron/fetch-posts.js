import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security check for Cron Secret
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://linkedin-data-api.p.rapidapi.com/get-company-posts?username=intelligent-heart-technology-lab';
        
        console.log('Fetching LinkedIn data via RapidAPI...');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'linkedin-data-api.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            throw new Error(`RapidAPI responded with status: ${response.status}`);
        }

        const result = await response.json();
        
        // RapidAPI usually returns data in a 'data' array or similar. 
        // Based on typical LinkedIn Data API responses:
        const rawPosts = result.data || result.results || [];
        
        // 2. Mapping the data cleanly
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            return {
                text: post.text || post.commentary || '',
                date: post.postDate || post.postedAt || 'Recent',
                image: post.image || (post.images && post.images.length > 0 ? post.images[0] : null)
            };
        });

        if (mappedPosts.length > 0) {
            console.log(`Successfully fetched ${mappedPosts.length} posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
        } else {
            console.warn('No posts found in API response. Preserving old data.');
        }

        return res.status(200).json({ 
            success: true, 
            count: mappedPosts.length,
            message: mappedPosts.length > 0 ? 'KV Updated' : 'No changes made'
        });

    } catch (error) {
        console.error('RapidAPI Fetch Error:', error.message);
        // Important: Still return 200/success to keep Cron from failing, but log error
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            preserved: true 
        });
    }
}
