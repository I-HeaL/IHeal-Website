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
        
        // 2. Mapping ultra-robusto con Repost e Documenti
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // URL Pubblico
            let publicUrl = post.url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const activityId = publicUrl.split('activity:')[1]?.split('/')[0];
                if (activityId) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
                }
            }

            // Selezione Immagine Massima Qualità
            const imagesArray = post.content?.images?.[0]?.image || post.image || [];
            const bestImage = [...imagesArray].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            const img = bestImage?.url || null;

            // Avatar
            const avatars = post.author?.avatar || [];
            const avatar = avatars[avatars.length - 1]?.url || null;

            // --- REPOST / ARTICLE / DOCUMENT DATA ---
            let resharedData = null;
            
            // Priority 1: Classic Reshared Post
            if (post.reshared_post) {
                resharedData = {
                    author: post.reshared_post.author?.name || 'LinkedIn User',
                    text: post.reshared_post.text || '',
                    url: post.reshared_post.url || null
                };
            } 
            // Priority 2: Article or Document in Content
            else if (post.content?.article || post.content?.document) {
                const item = post.content.article || post.content.document;
                resharedData = {
                    author: item.source || 'External Source',
                    text: item.title || '',
                    url: item.url || null,
                    isExternal: true
                };
            }

            return {
                text: post.text || '',
                date: post.created_at, 
                image_url: img,
                avatar_url: avatar,
                url: publicUrl,
                reshared_data: resharedData
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Mapping completed with reshared data support. Updating KV.');
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
