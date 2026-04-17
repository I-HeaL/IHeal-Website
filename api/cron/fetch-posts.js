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
        
        // 2. Mapping ultra-robusto
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Fix Link: Trasforma link admin in link pubblici
            let publicUrl = post.url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const activityId = publicUrl.split('activity:')[1]?.split('/')[0];
                if (activityId) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
                }
            }

            // Fix Immagine: Cerca in ogni possibile posizione del JSON
            const img = post.image?.[0]?.url || 
                        post.content?.images?.[0]?.url || 
                        post.post_image || null;

            // Fix Avatar: Prendi il logo del Lab
            const avatar = post.author?.avatar?.[0]?.url || null;

            return {
                text: post.text || '',
                date: post.created_at, // ISO string corretta
                image_url: img,
                avatar_url: avatar,
                url: publicUrl
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Ultra-robust mapping completed. Updating KV.');
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
