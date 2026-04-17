import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
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
        const rawPosts = result.data || [];
        
        // --- LOGGING DI EMERGENZA ---
        if (rawPosts.length > 0) {
            console.log('Esempio post grezzo:', JSON.stringify(rawPosts[0], null, 2));
        }

        // 2. Mapping robusto per Date e Immagini
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Public URL Cleanup
            let publicUrl = post.url || post.post_url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const urnMatch = publicUrl.match(/activity:(\d+)/);
                if (urnMatch && urnMatch[1]) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}`;
                } else {
                    publicUrl = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
                }
            }

            // Data Dinamica
            const extractedDate = post.posted_at || post.time || post.created_at || post.timestamp || post.date || null;

            // Recupero Immagini (Deep search)
            let img = post.post_image || post.image_url || post.image || null;
            if (!img && post.media && Array.isArray(post.media) && post.media.length > 0) {
                img = post.media[0].url || post.media[0].image;
            }
            if (!img && post.images && Array.isArray(post.images) && post.images.length > 0) {
                img = post.images[0].url || post.images[0];
            }

            return {
                text: post.text || post.commentary || '',
                date: extractedDate,
                image_url: img, // Usiamo image_url come richiesto
                url: publicUrl
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Mappatura completata. Aggiorno KV.');
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('API returned 0 posts.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
