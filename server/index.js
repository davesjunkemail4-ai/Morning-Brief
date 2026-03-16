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
  { name: "Huberman Lab", rss: "https://feeds.megaphone.fm/hubermanlab" },
  { name: "Office Hours with Arthur Brooks", rss: "https://feeds.simplecast.com/ofRzNjX3" },
  { name: "Retirement Tax Services Podcast", rss: "https://retirement-tax-services.libsyn.com/rss" },
  { name: "BIF Bites", rss: "https://anchor.fm/s/fcf158a4/podcast/rss" },
  { name: "Osaic Technology Podcast", rss: "https://osaictechnology.libsyn.com/rss" },
  { name: "New Planner Podcast", rss: "https://newplannerrecruiting.libsyn.com/rss" },
  { name: "Elite Financial Advisor Podcast", rss: "https://feeds.redcircle.com/55db913a-4cf6-4c07-ab7c-ed36380b84db" },
  { name: "Visionary Advisor Podcast", rss: "https://feeds.buzzsprout.com/2449330.rss" },
  { name: "Titan Wealth Weekly Market Update", rss: "https://feeds.buzzsprout.com/1728327.rss" },
  { name: "Weekly Market Impact", rss: "https://weeklymarketimpact.libsyn.com/rss" },
  { name: "The Compound and Friends", rss: "https://feeds.megaphone.fm/TCP4771071679" },
  { name: "Craft on Top", rss: "https://anchor.fm/s/craft-on-top/podcast/rss" },
  { name: "The Long-Term Investor", rss: "https://thelongterminvestor.libsyn.com/rss" },
  { name: "Schwab Market Update", rss: "https://feeds.schwab.com/schwabmarketupdate" },
  { name: "Fidelity Answers", rss: "https://www.omnycontent.com/d/playlist/32b71747-6282-467f-a657-a8db009910fb/c40f1483-d30d-4c9e-baa0-a8e30063b2c7/8d1e9131-0900-4f40-88f4-a8e30063b2d1/podcast.rss" },
  { name: "Do Business Do Life", rss: "https://rss.art19.com/do-business-do-life" },
  { name: "Facts vs Feelings", rss: "https://feeds.buzzsprout.com/2039027.rss" },
  { name: "Full Advisor Coaching", rss: "https://feeds.blubrry.com/feeds/3568070.xml" },
  { name: "Complete Estate Planning", rss: "https://feed.podbean.com/completeestateplanning/feed.xml" },
  { name: "The White Coat Investor", rss: "https://whitecoatinvestor.libsyn.com/rss" }
];

async function fetchRSS(rssUrl) {
  const res = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastDigest/1.0)' }, timeout: 10000 });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });
  const channel = (parsed && parsed.rss && parsed.rss.channel) || (parsed && parsed.feed);
  if (!channel) throw new Error('No channel found');
  const rawItems = channel.item || channel.entry || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.slice(0, 3).map(function(item) {
    const title = (item.title && item.title._) || item.title || 'Untitled';
    const pubDate = item.pubDate || item.published || item.updated || '';
    const description = (item.description && item.description._) || item.description || item['content:encoded'] || (item.summary && item.summary._) || item.summary || '';
    const link = (typeof item.link === 'object' ? (item.link && item.link.$ && item.link.$.href) || (item.link && item.link._) || '' : item.link) || '';
    const duration = item['itunes:duration'] || '';
    const transcriptEl = item['podcast:transcript'];
    let transcriptUrl = null;
    if (transcriptEl) {
      if (Array.isArray(transcriptEl)) {
        const plain = transcriptEl.find(function(t) { return t.$ && (t.$.type === 'text/plain' || t.$.type === 'text/html'); });
        const chosen = plain || transcriptEl[0];
        transcriptUrl = chosen && chosen.$ && chosen.$.url;
      } else if (transcriptEl.$ && transcriptEl.$.url) {
        transcriptUrl = transcriptEl.$.url;
      }
    }
    return {
      title: typeof title === 'string' ? title.trim() : String(title).trim(),
      date: pubDate ? new Date(pubDate) : new Date(),
      description: typeof description === 'string' ? description : String(description),
      link: typeof link === 'string' ? link.trim() : '',
      duration: typeof duration === 'string' ? duration.trim() : '',
      transcriptUrl: transcriptUrl || null
    };
  });
}

async function fetchTranscript(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastDigest/1.0)' }, timeout: 12000 });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trim().startsWith('{')) {
      try {
        const data = JSON.parse(text);
        if (data.body) return stripHTML(data.body).slice(0, 8000);
        if (data.text) return data.text.slice(0, 8000);
        if (Array.isArray(data.segments)) return data.segments.map(function(s) { return s.body || s.text || ''; }).join(' ').slice(0, 8000);
      } catch(e) {}
    }
    return stripHTML(text).slice(0, 8000);
  } catch(e) { return null; }
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
}

async function analyzeWithClaude(podName, epTitle, description, transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('No ANTHROPIC_API_KEY set'); return null; }
  const content = transcript ? transcript.slice(0, 5000) : stripHTML(description).slice(0, 2500);
  const sourceType = transcript ? 'transcript excerpt' : 'show notes';
  const prompt = 'You are summarizing podcast episodes for a busy financial advisor.\nPodcast: "' + podName + '"\nEpisode: "' + epTitle + '"\nSource: ' + sourceType + '\nContent: "' + (content || '(no content)') + '"\n\nReturn ONLY raw JSON:\n{"tldr":"one punchy sentence under 20 words","keyTakeaways":["takeaway 1","takeaway 2","takeaway 3"],"topics":["topic 1","topic 2","topic 3"],"worthListening":"YES","worthReason":"one sentence"}\nworthListening: YES=actionable/important, MAYBE=interesting not essential, NO=filler/promotional';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      timeout: 20000
    });
    const data = await res.json();
    if (!data.content) { console.error('Claude API error:', JSON.stringify(data)); return null; }
    const text = (data.content[0] && data.content[0].text) || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.error('Claude bad response:', text.slice(0, 200)); return null; }
    return JSON.parse(match[0]);
  } catch(e) {
    console.error('Claude fetch error:', e.message);
    return null;
  }
}

app.get('/api/podcasts', function(req, res) { res.json(PODCASTS.map(function(p) { return { name: p.name }; })); });

app.get('/api/fetch/:index', async function(req, res) {
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= PODCASTS.length) return res.status(400).json({ error: 'Invalid index' });
  const pod = PODCASTS[idx];
  try {
    const items = await fetchRSS(pod.rss);
    const ep = items[0];
    let transcript = null;
    if (ep.transcriptUrl) {
      try { transcript = await fetchTranscript(ep.transcriptUrl); } catch(e) { console.error('Transcript error:', e.message); }
    }
    const analysis = await analyzeWithClaude(pod.name, ep.title, ep.description, transcript);
    res.json({ success: true, podcast: pod.name, episode: { title: ep.title, date: ep.date, link: ep.link, duration: ep.duration, description: stripHTML(ep.description).slice(0, 500), hasTranscript: !!transcript }, analysis: analysis });
  } catch(e) {
    res.json({ success: false, podcast: pod.name, error: e.message });
  }
});

app.get('/api/health', function(req, res) { res.json({ status: 'ok', podcasts: PODCASTS.length, time: new Date().toISOString() }); });

app.listen(PORT, function() { console.log('Morning Brief server running on port ' + PORT); });
