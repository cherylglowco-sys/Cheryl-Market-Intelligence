import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV = globalThis.process?.env || {};
const PORT = Number(ENV.PORT || 5173);
const AUTH_USER = ENV.DASHBOARD_USER || "";
const AUTH_PASSWORD = ENV.DASHBOARD_PASSWORD || "";

const STOCK_SYMBOLS = ["ALAB", "INTC", "MU", "NVDA", "QBTS", "TSLA", "ORCL", "DELL", "SPCX", "MSFT", "AMD", "LLY", "AVGO", "META", "QQQM", "SMH"];
const HOLDINGS = [
  { symbol: "ALAB", name: "Astera Labs", type: "stock", aliases: ["Astera Labs", "ALAB"] },
  { symbol: "INTC", name: "Intel", type: "stock", aliases: ["Intel", "INTC"] },
  { symbol: "MU", name: "Micron", type: "stock", aliases: ["Micron", "MU"] },
  { symbol: "NVDA", name: "Nvidia", type: "stock", aliases: ["Nvidia", "NVIDIA", "NVDA"] },
  { symbol: "QBTS", name: "D-Wave Quantum", type: "stock", aliases: ["D-Wave", "D-Wave Quantum", "QBTS"] },
  { symbol: "TSLA", name: "Tesla", type: "stock", aliases: ["Tesla", "TSLA"] },
  { symbol: "ORCL", name: "Oracle", type: "stock", aliases: ["Oracle", "ORCL"] },
  { symbol: "DELL", name: "Dell Technologies", type: "stock", aliases: ["Dell", "Dell Technologies", "DELL"] },
  { symbol: "SPCX", name: "SPCX", type: "stock", aliases: ["SPCX", "SPCX ETF", "SPCX stock", "SpaceX"] },
  { symbol: "MSFT", name: "Microsoft", type: "stock", aliases: ["Microsoft", "MSFT", "Azure"] },
  { symbol: "AMD", name: "Advanced Micro Devices", type: "stock", aliases: ["AMD", "Advanced Micro Devices"] },
  { symbol: "LLY", name: "Eli Lilly", type: "stock", aliases: ["Eli Lilly", "Lilly", "LLY", "Mounjaro", "Zepbound"] },
  { symbol: "AVGO", name: "Broadcom", type: "stock", aliases: ["Broadcom", "AVGO", "VMware"] },
  { symbol: "META", name: "Meta Platforms", type: "stock", aliases: ["Meta", "Meta Platforms", "Facebook", "Instagram", "META"] },
  { symbol: "QQQM", name: "Invesco NASDAQ 100 ETF", type: "stock", aliases: ["QQQM", "Invesco NASDAQ 100 ETF", "Nasdaq 100 ETF"] },
  { symbol: "SMH", name: "VanEck Semiconductor ETF", type: "stock", aliases: ["SMH", "VanEck Semiconductor ETF", "semiconductor ETF"] },
  { symbol: "BTC", name: "Bitcoin", type: "crypto", aliases: ["Bitcoin", "BTC", "spot bitcoin ETF", "Bitcoin ETF"] },
  { symbol: "ETH", name: "Ethereum", type: "crypto", aliases: ["Ethereum", "Ether", "ETH", "spot ether ETF", "spot ethereum ETF", "Ethereum ETF"] }
];

const FEEDS = [
  source("yahoo-holdings", "Yahoo Finance", "stocks", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=ALAB,INTC,MU,NVDA,QBTS,TSLA,ORCL,DELL,SPCX,MSFT,AMD,LLY,AVGO,META,QQQM,SMH&region=US&lang=en-US"),
  source("yahoo-crypto", "Yahoo Finance Crypto", "crypto", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD,ETH-USD&region=US&lang=en-US"),
  source("google-holdings", "Google News: Holdings", "stocks", googleNewsUrl('(Astera Labs OR Intel OR Micron OR Nvidia OR D-Wave Quantum OR Tesla OR Oracle OR Dell OR SPCX OR Microsoft OR AMD OR Eli Lilly OR Broadcom OR Meta OR QQQM OR SMH) (earnings OR stock OR shares OR analyst OR lawsuit OR SEC OR guidance) when:2d')),
  source("google-ai-chips", "Google News: Chips and AI", "stocks", googleNewsUrl('(semiconductor OR chips OR AI infrastructure OR data center) (Nvidia OR Intel OR Micron OR Astera OR Dell OR Oracle OR Microsoft OR AMD OR Broadcom OR Meta OR SMH) when:2d')),
  source("google-macro", "Google News: Macro", "macro", googleNewsUrl('(Federal Reserve OR inflation OR CPI OR PCE OR rates OR Treasury yields OR DXY OR dollar OR jobs OR unemployment OR recession OR liquidity OR QT OR QE OR tariffs OR sanctions OR geopolitics) (stocks OR Nasdaq OR S&P 500 OR bitcoin OR ethereum) when:2d')),
  source("google-regulation", "Google News: Regulation", "regulation", googleNewsUrl('(SEC OR DOJ OR FTC OR regulator OR lawsuit OR antitrust OR investigation) (Nvidia OR Tesla OR Intel OR Oracle OR bitcoin OR ethereum OR crypto OR stocks) when:2d')),
  source("sec-press", "SEC Press Releases", "regulation", "https://www.sec.gov/news/pressreleases.rss"),
  source("coindesk", "CoinDesk", "crypto", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
  source("cointelegraph-bitcoin", "Cointelegraph Bitcoin", "bitcoin", "https://cointelegraph.com/rss/tag/bitcoin"),
  source("cointelegraph-ethereum", "Cointelegraph Ethereum", "ethereum", "https://cointelegraph.com/rss/tag/ethereum"),
  source("google-bitcoin", "Google News: Bitcoin", "bitcoin", googleNewsUrl('(Bitcoin OR BTC) (ETF flows OR spot bitcoin ETF OR whale OR on-chain OR regulation OR SEC OR macro OR rates OR dominance) when:2d')),
  source("google-ethereum", "Google News: Ethereum", "ethereum", googleNewsUrl('(Ethereum OR Ether OR ETH) (ETF flows OR spot ether ETF OR staking OR L2 OR layer 2 OR DeFi OR stablecoin OR SEC OR regulation) when:2d')),
  source("google-etf-flows", "Google News: Crypto ETF Flows", "etf", googleNewsUrl('(Bitcoin ETF OR spot bitcoin ETF OR Ethereum ETF OR spot ether ETF) (flows OR inflows OR outflows OR BlackRock OR Fidelity OR Grayscale) when:2d')),
  source("google-commodities", "Google News: Commodities", "macro", googleNewsUrl('(gold OR silver OR crude oil OR WTI OR Brent OR copper OR natural gas OR commodities) (inflation OR dollar OR yields OR supply OR demand OR inventories OR OPEC OR geopolitics) when:2d'))
];

const MARKET_INSTRUMENTS = [
  { id: "btc", label: "BTC", symbol: "BTC-USD", kind: "crypto", suffix: "" },
  { id: "eth", label: "ETH", symbol: "ETH-USD", kind: "crypto", suffix: "" },
  { id: "tenYear", label: "10Y", symbol: "^TNX", kind: "yield", suffix: "%", divisor: 10 },
  { id: "dxy", label: "DXY", symbol: "DX-Y.NYB", kind: "macro", suffix: "" },
  { id: "nasdaq", label: "Nasdaq Fut", symbol: "NQ=F", kind: "equity", suffix: "" },
  { id: "gold", label: "Gold", symbol: "GC=F", kind: "commodity", suffix: "" },
  { id: "silver", label: "Silver", symbol: "SI=F", kind: "commodity", suffix: "" },
  { id: "wti", label: "WTI Crude", symbol: "CL=F", kind: "commodity", suffix: "" },
  { id: "brent", label: "Brent", symbol: "BZ=F", kind: "commodity", suffix: "" },
  { id: "copper", label: "Copper", symbol: "HG=F", kind: "commodity", suffix: "" },
  { id: "natgas", label: "Natural Gas", symbol: "NG=F", kind: "commodity", suffix: "" }
];

const MACRO_TERMS = ["federal reserve", "fed", "powell", "inflation", "cpi", "pce", "rates", "treasury", "yields", "dxy", "dollar", "jobs", "payroll", "unemployment", "recession", "liquidity", "qt", "qe", "tariff", "sanctions", "war", "geopolitical", "credit", "oil", "gold", "silver", "crude", "wti", "brent", "copper", "natural gas", "commodities", "opec", "inventories"]
const BTC_TERMS = ["bitcoin", "btc", "spot bitcoin", "bitcoin etf", "btc etf", "whale", "on-chain", "miner", "mining", "halving", "btc dominance", "satoshi"];
const ETH_TERMS = ["ethereum", "ether", "eth", "spot ether", "spot ethereum", "ethereum etf", "staking", "validator", "layer 2", "l2", "defi", "stablecoin", "base", "arbitrum", "optimism", "solidity"];
const STOCK_TERMS = ["earnings", "guidance", "revenue", "eps", "profit", "loss", "beat", "miss", "forecast", "outlook", "upgrade", "downgrade", "price target", "analyst", "launch", "product", "data center", "ai", "chip", "semiconductor", "memory", "quantum", "cloud", "contract", "azure", "gpu", "broadcom", "metaverse", "lilly", "obesity drug", "glp-1"]
const RISK_TERMS = ["lawsuit", "probe", "investigation", "sec", "doj", "ftc", "antitrust", "recall", "ban", "hack", "exploit", "outflow", "default", "crisis"];
const POSITIVE = ["beat", "beats", "upgrade", "raises", "surge", "jumps", "rally", "record", "approval", "wins", "launches", "growth", "inflow", "inflows", "eases", "cooling"];
const NEGATIVE = ["miss", "misses", "downgrade", "cuts", "falls", "drops", "slumps", "lawsuit", "probe", "investigation", "recall", "ban", "hack", "outflow", "outflows", "hotter", "crisis"];
const TRUSTED = ["Reuters", "Bloomberg", "Associated Press", "AP News", "CNBC", "Wall Street Journal", "SEC", "Federal Reserve", "Yahoo Finance", "CoinDesk", "Cointelegraph"];
const LANE_LABELS = { btc: "Bitcoin", eth: "Ethereum", macro: "Macro", stocks: "Stocks" };
const MIME = new Map([[".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"]]);

let newsCache = { fetchedAt: null, items: [], errors: [] };
let marketCache = { fetchedAt: null, markets: [], fearGreed: null, dominance: null, etfSignals: [], errors: [] };
let eventCache = { fetchedAt: null, events: [], errors: [] };

function source(id, label, category, url) { return { id, label, category, url }; }
function googleNewsUrl(q) { return "https://news.google.com/rss/search?" + new URLSearchParams({ q, hl: "en-US", gl: "US", ceid: "US:en" }).toString(); }

http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://" + req.headers.host);
  if (url.pathname === "/healthz") return sendText(res, 200, "ok");
  if (!isAuthorized(req)) return requestAuth(res);
  if (url.pathname === "/api/news") return sendJson(res, await getNews(url.searchParams.get("force") === "1"));
  if (url.pathname === "/api/markets") return sendJson(res, await getMarkets(url.searchParams.get("force") === "1"));
  if (url.pathname === "/api/events") return sendJson(res, await getEvents(url.searchParams.get("force") === "1"));
  if (url.pathname === "/api/config") return sendJson(res, { holdings: HOLDINGS, feeds: FEEDS.map(({ id, label, category }) => ({ id, label, category })), lanes: LANE_LABELS });
  return serveStatic(url.pathname, res);
}).listen(PORT, () => console.log("Dashboard running at http://localhost:" + PORT));

async function getNews(force = false) {
  if (!force && newsCache.fetchedAt && Date.now() - new Date(newsCache.fetchedAt).getTime() < 240000) return { ...newsCache, cached: true };
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const raw = [];
  const errors = [];
  settled.forEach((result, i) => result.status === "fulfilled" ? raw.push(...result.value) : errors.push({ source: FEEDS[i].label, message: result.reason?.message || "Feed failed" }));
  const seen = new Set();
  const items = raw.map(scoreItem).filter((item) => {
    const key = normalize(item.title + "|" + item.url).slice(0, 190);
    if (seen.has(key) || item.score < 20) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.score - a.score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)).slice(0, 180);
  newsCache = { fetchedAt: new Date().toISOString(), items, errors };
  return { ...newsCache, cached: false };
}

async function getMarkets(force = false) {
  if (!force && marketCache.fetchedAt && Date.now() - new Date(marketCache.fetchedAt).getTime() < 180000) return { ...marketCache, cached: true };
  const errors = [];
  const quoteResults = await Promise.allSettled(MARKET_INSTRUMENTS.map(fetchYahooQuote));
  const markets = quoteResults.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    errors.push({ source: MARKET_INSTRUMENTS[index].label, message: result.reason?.message || "Quote failed" });
    return { ...MARKET_INSTRUMENTS[index], value: null, changePercent: null };
  });
  const [dominanceResult, fearResult, etfResult] = await Promise.allSettled([fetchDominance(), fetchFearGreed(), fetchEtfSignals()]);
  if (dominanceResult.status === "rejected") errors.push({ source: "CoinGecko Global", message: dominanceResult.reason?.message || "Dominance unavailable" });
  if (fearResult.status === "rejected") errors.push({ source: "Fear & Greed", message: fearResult.reason?.message || "Fear & Greed unavailable" });
  if (etfResult.status === "rejected") errors.push({ source: "ETF flow signals", message: etfResult.reason?.message || "ETF signals unavailable" });
  marketCache = {
    fetchedAt: new Date().toISOString(),
    markets,
    dominance: dominanceResult.status === "fulfilled" ? dominanceResult.value : null,
    fearGreed: fearResult.status === "fulfilled" ? fearResult.value : null,
    etfSignals: etfResult.status === "fulfilled" ? etfResult.value : [],
    errors
  };
  return { ...marketCache, cached: false };
}

async function getEvents(force = false) {
  if (!force && eventCache.fetchedAt && Date.now() - new Date(eventCache.fetchedAt).getTime() < 1800000) return { ...eventCache, cached: true };
  const feeds = ["https://nfs.faireconomy.media/ff_calendar_thisweek.xml"];
  const settled = await Promise.allSettled(feeds.map((feedUrl) => fetchText(feedUrl)));
  const errors = [];
  const events = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") events.push(...parseForexFactory(result.value));
    else errors.push({ source: feeds[index], message: result.reason?.message || "Calendar failed" });
  });
  let filtered = events.filter((event) => isUsEvent(event) && ["High", "Medium"].includes(event.impact) && event.timestamp >= Date.now() - 86400000).sort((a, b) => a.timestamp - b.timestamp).slice(0, 18);
  if (!filtered.length) filtered = fallbackMacroEvents();
  eventCache = { fetchedAt: new Date().toISOString(), events: filtered, errors };
  return { ...eventCache, cached: false };
}

async function fetchFeed(feed) {
  const xml = await fetchText(feed.url, { "User-Agent": "CherylMarketIntelligence/1.0", "Accept": "application/rss+xml, application/xml, text/xml, */*" });
  return parseRss(xml).map((item) => ({ ...item, feedId: feed.id, feedLabel: feed.label, feedCategory: feed.category }));
}

async function fetchText(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function fetchJson(url) {
  const text = await fetchText(url, { "Accept": "application/json, text/plain, */*", "User-Agent": "CherylMarketIntelligence/1.0" });
  return JSON.parse(text);
}

async function fetchYahooQuote(instrument) {
  const data = await fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(instrument.symbol) + "?range=2d&interval=1d");
  const result = data.chart?.result?.[0];
  const meta = result?.meta || {};
  const rawValue = Number(meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose);
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
  const divisor = instrument.divisor || 1;
  const value = Number.isFinite(rawValue) ? rawValue / divisor : null;
  const prevValue = Number.isFinite(previous) ? previous / divisor : null;
  const changePercent = value !== null && prevValue ? ((value - prevValue) / prevValue) * 100 : null;
  return { ...instrument, value, changePercent, asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null };
}

async function fetchDominance() {
  const data = await fetchJson("https://api.coingecko.com/api/v3/global");
  const pct = data.data?.market_cap_percentage || {};
  return { btc: pct.btc ?? null, eth: pct.eth ?? null };
}

async function fetchFearGreed() {
  const data = await fetchJson("https://api.alternative.me/fng/?limit=1&format=json");
  const item = data.data?.[0];
  return item ? { value: Number(item.value), label: item.value_classification, asOf: item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : null } : null;
}

async function fetchEtfSignals() {
  const xml = await fetchText(googleNewsUrl('(Bitcoin ETF OR Ethereum ETF OR spot bitcoin ETF OR spot ether ETF) (flows OR inflows OR outflows) when:2d'));
  return parseRss(xml).slice(0, 5).map((item) => ({ title: item.title, url: item.url, source: item.source, publishedAt: item.publishedAt }));
}

function parseRss(xml) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const entries = blocks.length ? blocks : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return entries.map((block) => {
    const title = getTag(block, "title");
    const url = getTag(block, "link") || decodeXml(block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "");
    const description = stripHtml(getTag(block, "description") || getTag(block, "summary") || getTag(block, "content:encoded"));
    const published = getTag(block, "pubDate") || getTag(block, "published") || getTag(block, "updated");
    return { id: stableId(title + "|" + url), title, url, description, publishedAt: published ? safeDate(published) : null, source: getTag(block, "source") || hostname(url) };
  }).filter((item) => item.title && item.url);
}

function parseForexFactory(xml) {
  const blocks = [...xml.matchAll(/<event\b[\s\S]*?<\/event>/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const title = getTag(block, "title");
    const country = getTag(block, "country");
    const date = getTag(block, "date");
    const time = getTag(block, "time");
    const impact = titleCase(getTag(block, "impact"));
    const forecast = getTag(block, "forecast");
    const previous = getTag(block, "previous");
    const timestamp = forexDateToTimestamp(date, time);
    return { id: stableId(title + country + date + time), title, country, date, time, impact, forecast, previous, timestamp, countdown: countdown(timestamp) };
  }).filter((event) => event.title && event.timestamp);
}

function fallbackMacroEvents() {
  const templates = [
    { title: "ISM Manufacturing PMI", day: 1, hour: 14, minute: 0, impact: "High", source: "Macro fallback" },
    { title: "JOLTS Job Openings", day: 2, hour: 14, minute: 0, impact: "Medium", source: "Macro fallback" },
    { title: "ADP Non-Farm Employment Change", day: 3, hour: 12, minute: 15, impact: "Medium", source: "Macro fallback" },
    { title: "ISM Services PMI", day: 3, hour: 14, minute: 0, impact: "High", source: "Macro fallback" },
    { title: "Unemployment Claims", weekday: 4, hour: 12, minute: 30, impact: "Medium", source: "Macro fallback", weekly: true },
    { title: "Non-Farm Payrolls", weekday: 5, ordinal: 1, hour: 12, minute: 30, impact: "High", source: "Macro fallback" },
    { title: "CPI m/m", day: 13, hour: 12, minute: 30, impact: "High", source: "Macro fallback" },
    { title: "Core CPI m/m", day: 13, hour: 12, minute: 30, impact: "High", source: "Macro fallback" },
    { title: "PPI m/m", day: 14, hour: 12, minute: 30, impact: "Medium", source: "Macro fallback" },
    { title: "Retail Sales m/m", day: 16, hour: 12, minute: 30, impact: "High", source: "Macro fallback" },
    { title: "FOMC Rate Decision", dates: ["2026-07-29T18:00:00Z", "2026-09-16T18:00:00Z", "2026-10-28T18:00:00Z", "2026-12-09T19:00:00Z"], impact: "High", source: "Fed schedule fallback" },
    { title: "Core PCE Price Index m/m", lastBusinessDay: true, hour: 12, minute: 30, impact: "High", source: "Macro fallback" }
  ];
  const now = new Date();
  const candidates = [];
  for (const template of templates) candidates.push(...expandFallbackTemplate(template, now));
  return candidates
    .filter((event) => event.timestamp >= Date.now() - 3600000)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 14)
    .map((event) => ({ ...event, countdown: countdown(event.timestamp) }));
}

function expandFallbackTemplate(template, now) {
  if (template.dates) {
    return template.dates.map((iso) => buildFallbackEvent(template, new Date(iso))).filter((event) => event.timestamp >= Date.now() - 3600000);
  }
  const events = [];
  for (let addMonth = 0; addMonth < 4; addMonth += 1) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + addMonth;
    let date;
    if (template.weekly) date = nextWeekdayAfter(now, template.weekday, template.hour, template.minute);
    else if (template.ordinal) date = nthWeekdayOfMonth(year, month, template.weekday, template.ordinal, template.hour, template.minute);
    else if (template.lastBusinessDay) date = lastBusinessDayOfMonth(year, month, template.hour, template.minute);
    else date = new Date(Date.UTC(year, month, template.day, template.hour, template.minute));
    if (date && date.getTime() >= Date.now() - 3600000) events.push(buildFallbackEvent(template, date));
    if (template.weekly) break;
  }
  return events;
}

function buildFallbackEvent(template, date) {
  return {
    id: stableId(template.title + date.toISOString()),
    title: template.title,
    country: "USD",
    date: String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0") + "-" + date.getUTCFullYear(),
    time: String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + " UTC",
    impact: template.impact,
    forecast: "",
    previous: "",
    timestamp: date.getTime(),
    source: template.source || "Macro fallback"
  };
}

function nextWeekdayAfter(now, weekday, hour, minute) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute));
  const diff = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + diff);
  if (date.getTime() < now.getTime() - 3600000) date.setUTCDate(date.getUTCDate() + 7);
  return date;
}

function nthWeekdayOfMonth(year, month, weekday, ordinal, hour, minute) {
  const date = new Date(Date.UTC(year, month, 1, hour, minute));
  const diff = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + diff + (ordinal - 1) * 7);
  return date.getUTCMonth() === ((month % 12) + 12) % 12 ? date : null;
}

function lastBusinessDayOfMonth(year, month, hour, minute) {
  const date = new Date(Date.UTC(year, month + 1, 0, hour, minute));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function isUsEvent(event) {
  const country = String(event.country || "").toUpperCase();
  return country === "USD" || country === "US" || country === "UNITED STATES";
}

function forexDateToTimestamp(date, time) {
  const dateMatch = String(date || "").match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (!dateMatch) return 0;
  let [, month, day, year] = dateMatch;
  let hour = 8;
  let minute = 30;
  const timeValue = String(time || "").trim().toLowerCase();
  if (timeValue && !timeValue.includes("all day") && !timeValue.includes("tentative")) {
    const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})(am|pm)?/);
    if (timeMatch) {
      hour = Number(timeMatch[1]);
      minute = Number(timeMatch[2]);
      const meridiem = timeMatch[3];
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    }
  }
  return Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute);
}

function scoreItem(item) {
  const text = normalize(item.title + " " + item.description + " " + item.source + " " + item.feedLabel);
  const affected = HOLDINGS.filter((h) => h.aliases.some((a) => present(text, a))).map((h) => h.symbol);
  const categories = inferCategories(text, item.feedCategory);
  const hits = [...new Set([...MACRO_TERMS, ...BTC_TERMS, ...ETH_TERMS, ...STOCK_TERMS, ...RISK_TERMS].filter((term) => present(text, term)))];
  const trusted = TRUSTED.some((s) => present(normalize(item.source + " " + item.feedLabel), s));
  const base = 8 + freshness(item.publishedAt) + (trusted ? 8 : 3);
  const macroScore = termScore(text, MACRO_TERMS, 8) + (categories.includes("macro") ? 24 : 0);
  const btcDirect = termScore(text, BTC_TERMS, 10) + (item.feedCategory === "bitcoin" ? 22 : 0) + (item.feedCategory === "crypto" ? 8 : 0) + (item.feedCategory === "etf" && categories.includes("bitcoin") ? 16 : 0);
  const ethDirect = termScore(text, ETH_TERMS, 10) + (item.feedCategory === "ethereum" ? 22 : 0) + (item.feedCategory === "crypto" ? 8 : 0) + (item.feedCategory === "etf" && categories.includes("ethereum") ? 16 : 0);
  const stockDirect = termScore(text, STOCK_TERMS, 7) + (affected.some((s) => STOCK_SYMBOLS.includes(s)) ? 30 : 0);
  const regulationBoost = categories.includes("regulation") ? 10 : 0;
  const impactScores = {
    btc: clamp(base + btcDirect + (macroScore >= 24 ? 12 : 0) + regulationBoost, 0, 100),
    eth: clamp(base + ethDirect + (macroScore >= 24 ? 10 : 0) + regulationBoost, 0, 100),
    macro: clamp(base + macroScore + (categories.includes("regulation") ? 8 : 0), 0, 100),
    stocks: clamp(base + stockDirect + (macroScore >= 24 ? 10 : 0) + regulationBoost, 0, 100)
  };
  const lanes = Object.entries(impactScores).filter(([, value]) => value >= 45).sort((a, b) => b[1] - a[1]).map(([lane]) => lane);
  const score = Math.max(...Object.values(impactScores));
  const sentiment = inferSentiment(text);
  const finalAffected = affected.length ? affected : inferBroadAffected(impactScores, categories, item.feedCategory);
  return { ...item, score, impactScores, severity: score >= 75 ? "High" : score >= 50 ? "Medium" : "Low", sentiment, affected: finalAffected, lanes: lanes.length ? lanes : [topLane(impactScores)], categories, keywords: hits.slice(0, 10), why: why({ affected: finalAffected, categories, impactScores, sentiment }) };
}

function inferCategories(text, feedCategory) {
  const categories = new Set([feedCategory]);
  const checks = [["earnings", ["earnings", "revenue", "eps", "guidance", "profit", "forecast", "outlook"]], ["analyst", ["upgrade", "downgrade", "price target", "analyst", "rating"]], ["regulation", ["sec", "doj", "ftc", "regulator", "lawsuit", "probe", "investigation", "antitrust"]], ["macro", MACRO_TERMS], ["product", ["launch", "product", "chip", "ai", "data center", "cloud", "robotaxi", "ev", "quantum"]], ["bitcoin", BTC_TERMS], ["ethereum", ETH_TERMS], ["etf", ["etf", "flows", "inflows", "outflows", "blackrock", "fidelity", "grayscale"]]];
  for (const [category, terms] of checks) if (terms.some((term) => present(text, term))) categories.add(category);
  return [...categories].filter(Boolean);
}

function inferBroadAffected(scores, categories, feedCategory) {
  if (feedCategory === "bitcoin" || categories.includes("bitcoin")) return ["BTC"];
  if (feedCategory === "ethereum" || categories.includes("ethereum")) return ["ETH"];
  if (feedCategory === "crypto") return ["BTC", "ETH"];
  if (categories.includes("macro")) return ["Macro", "BTC", "ETH", "Stocks"];
  return [LANE_LABELS[topLane(scores)] || "Watchlist"];
}

function why({ affected, categories, impactScores, sentiment }) {
  const top = Object.entries(impactScores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([lane, value]) => LANE_LABELS[lane] + " " + value + "%").join(", ");
  const reasons = [];
  if (categories.includes("macro")) reasons.push("macro liquidity, rates, dollar, or growth expectations can reprice risk assets");
  if (categories.includes("bitcoin")) reasons.push("Bitcoin-specific liquidity, ETF flow, whale, or on-chain signals are in focus");
  if (categories.includes("ethereum")) reasons.push("Ethereum ETF, staking, L2, DeFi, or regulation signals can shift ETH sentiment");
  if (categories.includes("earnings")) reasons.push("earnings and guidance can shift equity expectations");
  if (categories.includes("regulation")) reasons.push("regulatory or legal headlines can change risk premiums");
  if (!reasons.length) reasons.push("the headline overlaps with your dashboard watch themes");
  const tone = sentiment === "positive" ? "Tone: constructive." : sentiment === "negative" ? "Tone: risk-oriented." : "Tone: mixed.";
  return affected.join(", ") + ": " + top + ". " + reasons.slice(0, 2).join("; ") + ". " + tone;
}

function termScore(text, terms, weight) { return Math.min(terms.filter((term) => present(text, term)).length * weight, 42); }
function topLane(scores) { return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || "macro"; }
function inferSentiment(text) { const p = POSITIVE.filter((term) => present(text, term)).length; const n = NEGATIVE.filter((term) => present(text, term)).length; return p > n ? "positive" : n > p ? "negative" : "mixed"; }
function freshness(publishedAt) { if (!publishedAt) return 3; const hours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 36e5); return hours <= 3 ? 15 : hours <= 12 ? 11 : hours <= 24 ? 8 : hours <= 48 ? 5 : 1; }
function countdown(timestamp) { const diff = timestamp - Date.now(); const abs = Math.abs(diff); const days = Math.floor(abs / 86400000); const hours = Math.floor((abs % 86400000) / 3600000); if (diff < 0) return "released"; if (days > 0) return days + "d " + hours + "h"; return Math.max(0, hours) + "h " + Math.floor((abs % 3600000) / 60000) + "m"; }
function titleCase(value) { const text = String(value || "").trim().toLowerCase(); return text ? text[0].toUpperCase() + text.slice(1) : "Low"; }
function safeDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

async function serveStatic(route, res) {
  const safe = route === "/" ? "/index.html" : route;
  const filePath = path.join(__dirname, "public", path.normalize(safe).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(path.join(__dirname, "public"))) return res.writeHead(403).end("Forbidden");
  try { const body = await readFile(filePath); res.writeHead(200, { "Content-Type": MIME.get(path.extname(filePath)) || "application/octet-stream" }).end(body); }
  catch { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); }
}

function getTag(block, tag) { const escaped = escapeRegex(tag); const match = block.match(new RegExp("<" + escaped + "\\b[^>]*>([\\s\\S]*?)<\\/" + escaped + ">", "i")); return decodeXml(match?.[1]?.trim() || ""); }
function sendJson(res, payload) { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(payload)); }
function sendText(res, status, text) { res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end(text); }
function requestAuth(res) { res.writeHead(401, { "WWW-Authenticate": "Basic realm=\"Cheryl Market Intelligence\"", "Content-Type": "text/plain; charset=utf-8" }).end("Authentication required"); }
function isAuthorized(req) { if (!AUTH_USER || !AUTH_PASSWORD) return true; const header = req.headers.authorization || ""; if (!header.startsWith("Basic ")) return false; const decoded = Buffer.from(header.slice(6), "base64").toString("utf8"); const separator = decoded.indexOf(":"); if (separator === -1) return false; return safeEqual(decoded.slice(0, separator), AUTH_USER) && safeEqual(decoded.slice(separator + 1), AUTH_PASSWORD); }
function safeEqual(actual, expected) { const actualBuffer = Buffer.from(actual); const expectedBuffer = Buffer.from(expected); return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer); }
function normalize(v) { return decodeXml(String(v || "")).toLowerCase(); }
function present(text, term) { return new RegExp("(^|[^a-z0-9])" + escapeRegex(normalize(term)) + "([^a-z0-9]|$)", "i").test(text); }
function escapeRegex(v) { return String(v).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"); }
function decodeXml(v) { return String(v || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))); }
function stripHtml(v) { return decodeXml(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function hostname(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
function stableId(v) { let hash = 0; for (let i = 0; i < v.length; i++) { hash = (hash << 5) - hash + v.charCodeAt(i); hash |= 0; } return Math.abs(hash).toString(36); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v))); }
