import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/posts?company_id=108797979';
        
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
        const rawPosts = result.data || [];
        
        // 2. Mapping Essenziale e Pulito
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Immagine Nitida
            const imagesArray = post.content?.images?.[0]?.image || post.image || [];
            const bestImage = [...imagesArray].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            const img = bestImage?.url || null;

            // Avatar Lab Nitido
            const avatars = post.author?.avatar || [];
            const bestAvatar = [...avatars].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            const avatar = bestAvatar?.url || null;

            return {
                text: post.text || '',
                date: post.created_at, 
                image_url: img,
                avatar_url: avatar,
                url: post.url
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Final clean mapping completed. Updating KV.');
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('0 posts found.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
