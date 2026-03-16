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

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchRSS(url) {
  const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MorningBrief/1.0)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const channel = parsed.rss.channel;
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];
  return items.filter(Boolean).map(function(item) {
    var transcriptUrl = null;
    var ns = item['podcast:transcript'];
    if (ns) {
      var t = Array.isArray(ns) ? ns[0] : ns;
      if (t && t['$'] && (t['$'].type === 'text/plain' || t['$'].type === 'text/html' || t['$'].type === 'text/vtt')) {
        transcriptUrl = t['$'].url;
      }
    }
    return {
      title: item.title || '',
      date: item.pubDate || '',
      link: item.link || '',
      duration: (item['itunes:duration'] || ''),
      description: stripHTML(item.description || item['content:encoded'] || ''),
      transcriptUrl: transcriptUrl,
      hasTranscript: !!transcriptUrl
    };
  });
}

async function fetchTranscript(url) {
  var res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error('Transcript HTTP ' + res.status);
  var text = await res.text();
  text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 8000);
}

async function analyzeWithClaude(podName, epTitle, description, transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('No ANTHROPIC_API_KEY set'); return null; }
  const content = transcript ? transcript.slice(0, 5000) : stripHTML(description).slice(0, 2500);
  const sourceType = transcript ? 'transcript excerpt' : 'show notes';
  const prompt = 'You are analyzing podcast episodes for a busy financial advisor to help them prioritize listening time.\nPodcast: "' + podName + '"\nEpisode: "' + epTitle + '"\nSource: ' + sourceType + '\nContent: "' + (content || '(no content)') + '"\n\nReturn ONLY raw JSON:\n{"tldr":"one punchy sentence under 20 words","keyTakeaways":["takeaway 1","takeaway 2","takeaway 3"],"topics":["topic 1","topic 2","topic 3"],"tier":"1","tierReason":"one sentence explaining the tier assignment"}\n\nTIER CRITERIA (assign the single best-matching tier):\ntier "1" = PRIORITY: episode primarily covers marketing strategies for financial advisors OR market/economic updates (Fed policy, interest rates, market outlook, economic data, investment commentary)\ntier "2" = VALUABLE: episode primarily covers retirement planning strategies, estate planning, or tax updates/strategies\ntier "3" = OPTIONAL: client conversation topics, advisor wellness/health/happiness/mindset, practice management, general business content, or anything else\nAUTOMATIC DOWNGRADE: if the episode is primarily promotional, sponsor-heavy, or a product/service pitch, increase the tier number by 1 (tier 1 becomes tier 2, tier 2 becomes tier 3)';
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

app.get('/api/podcasts', function(req, res) { res.json(PODCASTS.map(function(p) { return { name: p.name, rss: p.rss }; })); });

app.get('/api/fetch/:index', async function(req, res) {
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= PODCASTS.length) return res.status(400).json({ error: 'Invalid index' });
  const pod = PODCASTS[idx];
  try {
    const items = await fetchRSS(pod.rss);
    const ep = items[0];
    let transcript = null;
    if (ep.transcriptUrl) {
      try { transcript = await fetchTranscript(ep.transcriptUrl); } catch(e) { console.error('Transcript fetch error:', e.message); }
    }
    const analysis = await analyzeWithClaude(pod.name, ep.title, ep.description, transcript);
    res.json({ success: true, podcast: pod.name, episode: { title: ep.title, date: ep.date, link: ep.link, duration: ep.duration, description: ep.description, hasTranscript: ep.hasTranscript }, analysis: analysis });
  } catch(e) {
    res.json({ success: false, podcast: pod.name, error: e.message });
  }
});

app.get('/api/health', function(req, res) { res.json({ status: 'ok', podcasts: PODCASTS.length, timestamp: new Date().toISOString() }); });

app.listen(PORT, function() { console.log('Morning Brief server running on port ' + PORT); });
