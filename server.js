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
