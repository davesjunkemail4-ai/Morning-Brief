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
