require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PODCASTS = [
  { name: "Huberman Lab", rss: "https://feeds.libsyn.com/429424/rss" },
  { name: "Office Hours with Arthur Brooks", rss: "https://feeds.simplecast.com/ofRzNjX3" },
  { name: "Retirement Tax Services Podcast", rss: "https://feeds.buzzsprout.com/1538635.rss" },
  { name: "Bif Bites", rss: "https://anchor.fm/s/bif-bites/podcast/rss" },
  { name: "Osaic Technology Podcast", rss: "https://feeds.buzzsprout.com/2056750.rss" },
  { name: "New Planner Podcast", rss: "https://feeds.buzzsprout.com/1413077.rss" },
  { name: "Elite Financial Advisor Podcast", rss: "https://feeds.buzzsprout.com/1822365.rss" },
  { name: "Visionary Advisor Podcast", rss: "https://feeds.simplecast.com/visionary-advisor" },
  { name: "Titan Wealth Weekly Market Update", rss: "https://anchor.fm/s/titan-wealth/podcast/rss" },
  { name: "Weekly Market Impact", rss: "https://feeds.simplecast.com/weekly-market-impact" },
  { name: "The Compound and Friends", rss: "https://feeds.megaphone.fm/thecompound" },
  { name: "Craft on Top", rss: "https://anchor.fm/s/craft-on-top/podcast/rss" },
  { name: "The Long-Term Investor", rss: "https://feeds.buzzsprout.com/1793163.rss" },
  { name: "Schwab Market Update", rss: "https://feeds.libsyn.com/36406/rss" },
  { name: "Fidelity Answers", rss: "https://feeds.libsyn.com/fidelity-answers/rss" },
  { name: "Do Business Do Life", rss: "https://feeds.buzzsprout.com/1886889.rss" },
  { name: "Facts vs Feelings", rss: "https://feeds.megaphone.fm/facts-vs-feelings" },
  { name: "Full Advisor Coaching", rss: "https://anchor.fm/s/full-advisor-coaching/podcast/rss" },
  { name: "Complete Estate Planning", rss: "https://anchor.fm/s/complete-estate-planning/podcast/rss" },
  { name: "The White Coat Investor", rss: "https://feeds.libsyn.com/93256/rss" }
];

async function fetchRSS(rssUrl) {
  const res = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastDigest/1.0)' }, timeout: 10000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });
  const channel = (parsed && parsed.rss && parsed.rss.channel) || (parsed && parsed.feed);
  if (!channel) throw new Error('No channel found');
  const rawItems = channel.item || channel.entry || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.slice(0, 3).map(item => {
    const title = (item.title && item.title._) || item.title || 'Untitled';
    const pubDate = item.pubDate || item.published || item.updated || '';
    const description = (item.description && item.description._) || item.description || item['content:encoded'] || (item.summary && item.summary._) || item.summary || '';
    const link = (typeof item.link === 'object' ? (item.link && item.link.$ && item.link.$.href) || (item.link && item.link._) || '' : item.link) || '';
    const duration = item['itunes:duration'] || '';
    return {
      title: typeof title === 'string' ? title.trim() : String(title).trim(),
      date: pubDate ? new Date(pubDate) : new Date(),
      description: typeof description === 'string' ? description : String(description),
      link: typeof link === 'string' ? link.trim() : '',
      duration: typeof duration === 'string' ? duration.trim() : ''
    };
  });
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
}

async function analyzeWithClaude(podName, epTitle, description) {
  const cleanDesc = stripHTML(description).slice(0, 2500);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const prompt = `You are summarizing podcast episodes for a busy financial advisor who listens during morning workouts.

Podcast: "${podName}"
Episode: "${epTitle}"
Description: "${cleanDesc || '(no description available)'}"

Return ONLY raw JSON, no markdown, no explanation:
{
  "tldr": "One punchy sentence max 20 words capturing the single most important idea",
  "keyTakeaways": ["specific takeaway 1", "specific takeaway 2", "specific takeaway 3"],
  "topics": ["topic 1", "topic 2", "topic 3"],
  "worthListening": "YES",
  "worthReason": "One sentence explaining the rating"
}

worthListening rules: YES=genuinely actionable or important info. MAYBE=interesting but not essential. NO=filler/heavily promotional/no new info.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    timeout: 20000
  });
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

app.get('/api/podcasts', (req, res) => res.json(PODCASTS.map(p => ({ name: p.name }))));

app.get('/api/fetch/:index', async (req, res) => {
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= PODCASTS.length) return res.status(400).json({ error: 'Invalid index' });
  const pod = PODCASTS[idx];
  try {
    const items = await fetchRSS(pod.rss);
    const ep = items[0];
    let analysis = null;
    try { analysis = await analyzeWithClaude(pod.name, ep.title, ep.description); } catch(e) { console.error('Claude error:', e.message); }
    res.json({ success: true, podcast: pod.name, episode: { title: ep.title, date: ep.date, link: ep.link, duration: ep.duration, description: stripHTML(ep.description).slice(0, 500) }, analysis });
  } catch(e) {
    res.json({ success: false, podcast: pod.name, error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', podcasts: PODCASTS.length, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Morning Brief server running on port ${PORT}`));
