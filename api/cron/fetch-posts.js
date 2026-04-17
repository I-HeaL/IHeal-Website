import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

// Separate parsing logic into a dedicated function for easy updating
function extractLinkedInPosts(html, maxPosts) {
    const $ = cheerio.load(html);
    const posts = [];

    const pageTitle = $('title').text().trim();
    console.log("Page Title: " + pageTitle);

    if (pageTitle.toLowerCase().includes('login') || pageTitle.toLowerCase().includes('verification')) {
        console.error('BLOCCATO DA LOGIN');
        return { posts: [], blocked: true };
    }

    // Fuzzy and updated selectors for LinkedIn Posts (Public View)
    // .base-card is common for public posts view
    // article is the semantic container
    $('article, .base-card, .feed-shared-update-v2, div[data-test-id], .main-feed .card').each((i, el) => {
        if (posts.length >= maxPosts) return false;
        
        // Content search: look for paragraphs or description containers
        const textContainer = $(el).find('.feed-shared-update-v2__description, .update-components-text, .feed-shared-text, .base-card__full-link, p').first();
        let text = textContainer.text().trim();
        
        // Clean up excess whitespace
        text = text.replace(/\s+/g, ' ');

        if (text && text.length > 15) {
            // Find the date or time elapsed
            let dateStr = "Recent";
            const dateEl = $(el).find('.update-components-actor__sub-description, .visually-hidden, .feed-shared-actor__sub-description, time, .base-node__label').first();
            
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

    return { posts, blocked: false };
}

export default async function handler(req, res) {
    // 1. Debug Logs for Auth
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
        console.error('Authorization Failed.');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        // Target URL with feedView=all parameter
        const url = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/?feedView=all';
        
        // 'Browser-Perfect' headers implementation
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        };

        console.log('Fetching LinkedIn URL:', url);
        const response = await fetch(url, { headers });
        console.log('Fetch Status:', response.status);

        if (!response.ok) {
            throw new Error(`LinkedIn Fetch Failed: ${response.status}`);
        }

        const html = await response.text();
        
        // Parse posts
        const { posts, blocked } = extractLinkedInPosts(html, 15);
        console.log('Posts found:', posts.length);

        // CONDITIONAL KV SAVING: Only save if posts were actually found
        if (posts.length > 0) {
            console.log('Updating KV with ' + posts.length + ' posts.');
            await kv.set('linkedin_posts', JSON.stringify(posts));
        } else {
            console.warn('No posts found. Skipping KV overwrite to preserve existing data.');
        }

        return res.status(200).json({ 
            success: true, 
            count: posts.length, 
            blocked: blocked,
            preserved: posts.length === 0
        });

    } catch (error) {
        console.error('Runtime Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
