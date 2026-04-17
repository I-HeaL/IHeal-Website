import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

// Array of diverse User-Agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

function extractLinkedInPosts(html, maxPosts) {
    const $ = cheerio.load(html);
    const posts = [];

    const pageTitle = $('title').text().trim();
    console.log("--- SCRAPE INFO ---");
    console.log("Page Title: " + pageTitle);

    // Stop if we hit a login or verification wall
    if (pageTitle.toLowerCase().includes('login') || pageTitle.toLowerCase().includes('verification') || html.includes('authwall')) {
        console.error('STATUS: BLOCCATO DA LOGIN');
        return { posts: [], error: 'Login required' };
    }

    // Resilience: search through various common LinkedIn tags
    $('article, .base-card, .feed-shared-update-v2, div[data-test-id]').each((i, el) => {
        if (posts.length >= maxPosts) return false;
        
        const textContainer = $(el).find('.feed-shared-update-v2__description, .update-components-text, .feed-shared-text, .base-card__full-link, p').first();
        let text = textContainer.text().trim();
        text = text.replace(/\s+/g, ' ');

        if (text && text.length > 20) {
            let dateStr = "Recent";
            const dateEl = $(el).find('.update-components-actor__sub-description, .visually-hidden, time, .base-node__label').first();
            if (dateEl.length) {
                dateStr = dateEl.text().replace(/\s+/g, ' ').trim().split('•')[0] || dateStr;
            }

            posts.push({ text, date: dateStr });
        }
    });

    return { posts };
}

export default async function handler(req, res) {
    // Auth Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
        const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        console.log('Fetching URL:', url);
        console.log('Using UA:', randomUA);

        const response = await fetch(url, { 
            headers: {
                'User-Agent': randomUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'no-cache'
            }
        });

        // 404/403/999 Resilience: log but don't crash
        if (!response.ok) {
            console.error(`LinkedIn respond con status: ${response.status}. Scraping saltato.`);
            return res.status(200).json({ success: true, warning: 'Fetch failed with status ' + response.status, preserved: true });
        }

        const html = await response.text();
        const { posts, error } = extractLinkedInPosts(html, 15);

        // KV GUARD: Don't overwrite if no posts found
        if (posts && posts.length > 0) {
            console.log('Post trovati:', posts.length, '. Aggiorno KV...');
            await kv.set('linkedin_posts', JSON.stringify(posts));
            return res.status(200).json({ success: true, count: posts.length });
        } else {
            console.warn('Nessun post trovato o bloccato da login. Mantenimento dati precedenti.');
            return res.status(200).json({ success: true, count: 0, preserved: true, login_blocked: !!error });
        }

    } catch (err) {
        console.error('Fetch Crash:', err.message);
        return res.status(200).json({ success: true, error: err.message, preserved: true });
    }
}
