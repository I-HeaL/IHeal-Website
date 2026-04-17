import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

// Separate parsing logic into a dedicated function for easy updating
function extractLinkedInPosts(html, maxPosts) {
    const $ = cheerio.load(html);
    const posts = [];

    // Organic post text is often inside these classes. 
    // If LinkedIn changes their DOM, update these selectors.
    $('.feed-shared-update-v2__description, .update-components-text, .feed-shared-text').each((i, el) => {
        if (posts.length >= maxPosts) return false;
        
        let text = $(el).text().trim();
        // Clean up excess whitespace
        text = text.replace(/\s+/g, ' ');

        if (text && text.length > 10) {
            // Find the date or time elapsed
            let dateStr = "Recent";
            const updateContainer = $(el).closest('.feed-shared-update-v2, .feed-shared-update');
            const dateEl = updateContainer.find('.update-components-actor__sub-description, .visually-hidden, .feed-shared-actor__sub-description').first();
            
            if (dateEl.length) {
                dateStr = dateEl.text().replace(/\s+/g, ' ').trim().split('•')[0] || dateStr;
            }

            posts.push({
                text: text,
                date: dateStr,
                url: 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/'
            });
        }
    });

    return posts;
}

export default async function handler(req, res) {
    // 1. Debug Logs for Auth
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    console.log('--- Cron Job Debug ---');
    console.log('Auth Header Present:', !!authHeader);
    console.log('Match with Secret:', authHeader === expectedAuth);
    
    // 2. Strict Authorization check
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
        console.error('Authorization Failed. Check CRON_SECRET environment variable.');
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized',
            debug: { headerPresent: !!authHeader, secretConfigured: !!process.env.CRON_SECRET }
        });
    }

    try {
        const url = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
        
        // 3. Robust User-Agent
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
        };

        console.log('Fetching LinkedIn URL:', url);
        const response = await fetch(url, { headers });
        
        console.log('Fetch Status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`Failed to fetch LinkedIn: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        
        // 4. Parse posts
        const posts = extractLinkedInPosts(html, 15);
        console.log('Posts found:', posts.length);

        // 5. If no posts found, log the HTML for debugging
        if (posts.length === 0) {
            console.warn('WARNING: No posts found in HTML.');
            console.log('HTML Snippet (first 1000 chars):', html.substring(0, 1000));
            // Check if login wall is present
            if (html.includes('login') || html.includes('authwall')) {
                console.error('DETECTED: LinkedIn Authwall / Login required page.');
            }
        }

        // Store even if empty to clear old/stale data
        await kv.set('linkedin_posts', JSON.stringify(posts));

        return res.status(200).json({ 
            success: true, 
            count: posts.length, 
            posts: posts,
            debug: { status: response.status, htmlLength: html.length }
        });

    } catch (error) {
        console.error('Execution Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal Server Error during fetch' 
        });
    }
}
