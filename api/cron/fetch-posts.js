import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const headers = {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'fresh-linkedin-scraper-api.p.rapidapi.com',
        'Content-Type': 'application/json'
    };

    try {
        // --- STEP 1: Fetch the General List ---
        const listUrl = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/posts?company_id=108797979';
        const listResponse = await fetch(listUrl, { headers });
        
        if (!listResponse.ok) throw new Error(`List API error: ${listResponse.status}`);
        
        const listData = await listResponse.json();
        const rawPosts = listData.data || [];
        
        // Limit to top 8 posts to save API credits and prevent timeout
        const recentPosts = rawPosts.slice(0, 8);
        const enrichedPosts = [];

        // --- STEP 2: Enrichment Loop (Double Fetch) ---
        for (const post of recentPosts) {
            try {
                // Determine ID (extracting from URN if needed or using ID field)
                const postId = post.id || post.url?.split('activity:')[1]?.split('/')[0];
                
                if (postId) {
                    const detailUrl = `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/post/details?post_id=${postId}`;
                    const detailResponse = await fetch(detailUrl, { headers });
                    
                    if (detailResponse.ok) {
                        const detailJson = await detailResponse.json();
                        const fullPost = detailJson.data || post; // Fallback to list post if detail fails

                        // Mapping Intelligente del Post Arricchito
                        let articleBox = null;
                        if (fullPost.content?.article) {
                            const art = fullPost.content.article;
                            const thumbs = art.thumbnail || [];
                            const bestThumb = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
                            
                            articleBox = {
                                title: art.title || '',
                                link: art.original_url || fullPost.url,
                                image: bestThumb
                            };
                        }

                        let mainImage = null;
                        if (!articleBox && fullPost.content?.images) {
                            const imgs = fullPost.content.images[0]?.image || [];
                            mainImage = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
                        }

                        enrichedPosts.push({
                            text: fullPost.text || '',
                            date: fullPost.created_at,
                            image_url: mainImage,
                            article: articleBox,
                            url: fullPost.url
                        });
                        continue; // Success, go to next post
                    }
                }
            } catch (innerError) {
                console.warn(`Detail fetch failed for post:`, innerError.message);
            }

            // Fallback: If details fetch fails, use list data (Case C or B basic)
            enrichedPosts.push({
                text: post.text || '',
                date: post.created_at,
                image_url: post.content?.images?.[0]?.image?.[0]?.url || null,
                article: null,
                url: post.url
            });
        }

        // --- STEP 3: Save results ---
        if (enrichedPosts.length > 0) {
            console.log(`Enriched ${enrichedPosts.length} posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(enrichedPosts));
            return res.status(200).json({ success: true, count: enrichedPosts.length });
        } else {
            return res.status(200).json({ success: true, count: 0 });
        }

    } catch (error) {
        console.error('Master API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message });
    }
}
