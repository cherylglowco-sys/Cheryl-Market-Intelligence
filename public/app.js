const LANES = [
  { id: "btc", label: "Bitcoin" },
  { id: "eth", label: "Ethereum" },
  { id: "macro", label: "Macro" },
  { id: "stocks", label: "Stocks" }
];

const state = {
  holdings: [], feeds: [], items: [], markets: null, events: [], eventErrors: [], lane: "all", minImpact: 50, query: "", enabledSources: new Set(), refreshTimer: null,
  seenAlerts: new Set(JSON.parse(localStorage.getItem("seenAlerts") || "[]"))
};

const els = {
  statusDot: document.querySelector("#statusDot"), statusText: document.querySelector("#statusText"), marketPulse: document.querySelector("#marketPulse"), localMacroTape: document.querySelector("#localMacroTape"), dailyBrief: document.querySelector("#dailyBrief"), briefMode: document.querySelector("#briefMode"), eventList: document.querySelector("#eventList"), holdings: document.querySelector("#holdings"), sourceList: document.querySelector("#sourceList"), lanes: document.querySelector("#lanes"), alertList: document.querySelector("#alertList"), etfSignals: document.querySelector("#etfSignals"), itemCount: document.querySelector("#itemCount"), refreshBtn: document.querySelector("#refreshBtn"), notifyBtn: document.querySelector("#notifyBtn"), refreshSelect: document.querySelector("#refreshSelect"), impactSelect: document.querySelector("#impactSelect"), laneSelect: document.querySelector("#laneSelect"), searchInput: document.querySelector("#searchInput"), alertThreshold: document.querySelector("#alertThreshold"), thresholdValue: document.querySelector("#thresholdValue"), template: document.querySelector("#newsItemTemplate")
};

boot();

async function boot() {
  wireControls();
  renderSkeletons();
  await loadConfig();
  await refreshAll(true);
  scheduleRefresh();
}

function wireControls() {
  els.refreshBtn.addEventListener("click", () => refreshAll(true));
  els.notifyBtn.addEventListener("click", requestNotifications);
  els.refreshSelect.addEventListener("change", scheduleRefresh);
  els.impactSelect.addEventListener("change", () => { state.minImpact = Number(els.impactSelect.value); render(); });
  els.laneSelect.addEventListener("change", () => { state.lane = els.laneSelect.value; render(); });
  els.searchInput.addEventListener("input", () => { state.query = els.searchInput.value.trim().toLowerCase(); render(); });
  els.alertThreshold.addEventListener("input", () => { els.thresholdValue.textContent = els.alertThreshold.value + "%"; renderAlerts(); });
}

async function loadConfig() {
  const config = await fetchJson("/api/config");
  state.holdings = config.holdings;
  state.feeds = config.feeds;
  state.enabledSources = new Set(config.feeds.map((feed) => feed.id));
  renderSources();
  renderHoldings();
}

async function refreshAll(force = false) {
  setStatus("Syncing market intelligence...", "loading");
  const suffix = force ? "?force=1" : "";
  const [news, markets, events] = await Promise.allSettled([fetchJson("/api/news" + suffix), fetchJson("/api/markets" + suffix), fetchJson("/api/events" + suffix)]);
  const errors = [];
  if (news.status === "fulfilled") state.items = (news.value.items || []).map(normalizeItem); else errors.push("news");
  if (markets.status === "fulfilled") state.markets = normalizeMarkets(markets.value); else errors.push("markets");
  if (events.status === "fulfilled") { state.events = events.value.events || []; state.eventErrors = events.value.errors || []; } else errors.push("events");
  const sourceErrors = [news, markets, events].filter((result) => result.status === "fulfilled").flatMap((result) => result.value.errors || []);
  const stamp = formatTime(new Date());
  setStatus("Updated " + stamp + (errors.length || sourceErrors.length ? ". Some feeds are degraded." : ". Systems nominal."), errors.length ? "error" : "live");
  render();
  fireNotifications();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.status + " " + response.statusText);
  return response.json();
}

function scheduleRefresh() { clearInterval(state.refreshTimer); const interval = Number(els.refreshSelect.value); if (interval > 0) state.refreshTimer = setInterval(() => refreshAll(false), interval); }
function render() { const filtered = filteredItems(); els.itemCount.textContent = filtered.length + " signals"; renderMarketPulse(); renderLocalMacroTape(); renderBrief(); renderEvents(); renderHoldings(); renderLanes(filtered); renderAlerts(); renderEtfSignals(); }

function filteredItems() {
  return state.items.filter((item) => {
    const itemLanes = item.lanes || [];
    const laneOk = state.lane === "all" || (state.lane === "alerts" ? item.score >= Number(els.alertThreshold.value) : itemLanes.includes(state.lane));
    const impactOk = item.score >= state.minImpact;
    const sourceOk = state.enabledSources.has(item.feedId);
    const text = (item.title + " " + item.source + " " + item.description + " " + item.affected.join(" ") + " " + item.keywords.join(" ")).toLowerCase();
    return laneOk && impactOk && sourceOk && (!state.query || text.includes(state.query));
  });
}

function normalizeItem(item) {
  const categories = item.categories || [];
  const legacyAffected = item.affected || [];
  const lanes = item.lanes || legacyLanes(item);
  const impactScores = item.impactScores || {
    btc: legacyAffected.includes("BTC") || categories.includes("bitcoin") ? item.score : categories.includes("macro") ? Math.min(item.score, 55) : 15,
    eth: legacyAffected.includes("ETH") || categories.includes("ethereum") ? item.score : categories.includes("crypto") ? Math.min(item.score, 50) : 15,
    macro: categories.includes("macro") || categories.includes("regulation") ? item.score : 20,
    stocks: legacyAffected.some((symbol) => !["BTC", "ETH", "Watchlist", "Macro", "Stocks"].includes(symbol)) || categories.includes("stocks") ? item.score : 20
  };
  return { ...item, lanes, impactScores, affected: legacyAffected.length ? legacyAffected : lanes.map((lane) => lane.toUpperCase()), keywords: item.keywords || [], categories, sentiment: item.sentiment || "mixed", why: item.why || "Legacy server data loaded. Restart the upgraded dashboard for full scoring." };
}

function legacyLanes(item) {
  const categories = item.categories || [];
  const affected = item.affected || [];
  const lanes = [];
  if (affected.includes("BTC") || categories.includes("bitcoin")) lanes.push("btc");
  if (affected.includes("ETH") || categories.includes("ethereum")) lanes.push("eth");
  if (categories.includes("macro") || categories.includes("regulation")) lanes.push("macro");
  if (affected.some((symbol) => !["BTC", "ETH", "Watchlist", "Macro", "Stocks"].includes(symbol)) || categories.includes("stocks")) lanes.push("stocks");
  return lanes.length ? lanes : ["macro"];
}

function normalizeMarkets(markets) {
  return markets && typeof markets === "object" ? markets : { markets: [], fearGreed: null, dominance: null, etfSignals: [], errors: [] };
}

function renderLocalMacroTape() {
  if (!els.localMacroTape) return;
  const items = state.markets?.markets || [];
  const wanted = ["tenYear", "dxy", "nasdaq"];
  els.localMacroTape.replaceChildren();
  for (const id of wanted) {
    const item = items.find((entry) => entry.id === id);
    const chip = document.createElement("div");
    chip.className = "local-tape-chip";
    const label = item?.label === "Nasdaq Fut" ? "NQ" : item?.label || id;
    const change = changeClass(item?.changePercent);
    const asOf = state.markets?.fetchedAt ? "Updated " + formatTime(state.markets.fetchedAt) : "Local fallback";
    chip.title = label + " uses dashboard market feed; " + asOf;
    chip.innerHTML = "<span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(formatMarketValue(item || {})) + "</strong><em class=\"" + change + "\">" + escapeHtml(formatChange(item?.changePercent)) + "</em>";
    els.localMacroTape.append(chip);
  }
}

function renderMarketPulse() {
  els.marketPulse.replaceChildren();
  const data = state.markets;
  const marketCards = data?.markets || [];
  for (const item of marketCards) els.marketPulse.append(pulseCard(item.label, formatMarketValue(item), formatChange(item.changePercent), item.changePercent));
  if (data?.dominance) {
    els.marketPulse.append(pulseCard("BTC Dom", pct(data.dominance.btc), "market cap share", null));
    els.marketPulse.append(pulseCard("ETH Dom", pct(data.dominance.eth), "market cap share", null));
  }
  if (data?.fearGreed) els.marketPulse.append(pulseCard("Fear & Greed", data.fearGreed.value, data.fearGreed.label, data.fearGreed.value - 50));
  while (els.marketPulse.children.length < 8) els.marketPulse.append(pulseCard("Signal", "--", "waiting", null));
}

function pulseCard(label, value, change, direction) {
  const card = document.createElement("article");
  card.className = "pulse-card";
  const dirClass = direction > 0 ? "up" : direction < 0 ? "down" : "";
  card.innerHTML = "<span class=\"label\">" + escapeHtml(label) + "</span><strong class=\"value\">" + escapeHtml(value) + "</strong><span class=\"change " + dirClass + "\">" + escapeHtml(change || "") + "</span>";
  return card;
}

function renderBrief() {
  const topMacro = topByLane("macro");
  const topBtc = topByLane("btc");
  const topEth = topByLane("eth");
  const topStocks = topByLane("stocks");
  const fear = state.markets?.fearGreed;
  const dominance = state.markets?.dominance;
  const event = state.events?.[0];
  const lines = [
    briefLine("Dominant macro trend", topMacro ? topMacro.title : "No high-confidence macro headline yet."),
    briefLine("Bitcoin", topBtc ? topBtc.why : "Waiting for a strong Bitcoin signal."),
    briefLine("Ethereum", topEth ? topEth.why : "Waiting for a strong Ethereum signal."),
    briefLine("Stocks", topStocks ? topStocks.why : "No major equity watchlist signal above threshold."),
    briefLine("Risk gauges", "Fear & Greed " + (fear ? fear.value + " " + fear.label : "unavailable") + "; BTC dominance " + (dominance?.btc ? pct(dominance.btc) : "unavailable") + "."),
    briefLine("Next macro event", event ? event.title + " in " + event.countdown : "ForexFactory calendar feed has no upcoming high/medium USD event loaded.")
  ];
  els.dailyBrief.replaceChildren(...lines);
}

function briefLine(label, text) {
  const div = document.createElement("div");
  div.className = "brief-line";
  div.innerHTML = "<strong>" + escapeHtml(label) + ":</strong> " + escapeHtml(text);
  return div;
}

function topByLane(lane) { return state.items.filter((item) => item.lanes.includes(lane)).sort((a, b) => (b.impactScores?.[lane] || 0) - (a.impactScores?.[lane] || 0))[0]; }

function renderEvents() {
  els.eventList.replaceChildren();
  if (!state.events.length) {
    const message = state.eventErrors.length ? "ForexFactory calendar is unavailable or rate-limited. Retry after the next refresh." : "No upcoming high or medium USD events loaded from ForexFactory.";
    els.eventList.append(emptyState(message));
    return;
  }
  for (const event of state.events.slice(0, 9)) {
    const card = document.createElement("div");
    card.className = "event-card";
    card.innerHTML = "<strong>" + escapeHtml(event.countdown) + "</strong><div><strong>" + escapeHtml(event.title) + "</strong><span>" + escapeHtml(event.date + " " + event.time + (event.forecast ? " | Forecast " + event.forecast : "")) + "</span></div><span class=\"event-impact\">" + escapeHtml(event.impact) + "</span>";
    els.eventList.append(card);
  }
}

function renderLanes(items) {
  els.lanes.replaceChildren();
  const lanesToRender = state.lane !== "all" && state.lane !== "alerts" ? LANES.filter((lane) => lane.id === state.lane) : LANES;
  for (const lane of lanesToRender) {
    const laneItems = items.filter((item) => item.lanes.includes(lane.id)).sort((a, b) => (b.impactScores?.[lane.id] || 0) - (a.impactScores?.[lane.id] || 0)).slice(0, 18);
    const panel = document.createElement("section");
    panel.className = "lane";
    panel.innerHTML = "<div class=\"lane-header\"><h3>" + escapeHtml(lane.label) + "</h3><span class=\"lane-count\">" + laneItems.length + " active</span></div><div class=\"lane-feed\"></div>";
    const feed = panel.querySelector(".lane-feed");
    if (!laneItems.length) feed.append(emptyState("No matching " + lane.label + " signals."));
    else laneItems.forEach((item) => feed.append(renderNewsCard(item, lane.id)));
    els.lanes.append(panel);
  }
}

function renderNewsCard(item, laneId) {
  const node = els.template.content.cloneNode(true);
  const article = node.querySelector(".news-card");
  article.classList.add(item.severity.toLowerCase());
  node.querySelector(".score").textContent = (item.impactScores?.[laneId] || item.score) + "%";
  node.querySelector(".severity").textContent = item.severity;
  node.querySelector(".source").textContent = item.source || item.feedLabel;
  node.querySelector(".time").textContent = item.publishedAt ? relativeTime(item.publishedAt) : "time unknown";
  const title = node.querySelector(".title");
  title.href = item.url;
  title.textContent = item.title;
  node.querySelector(".why").textContent = item.why;
  const bars = node.querySelector(".score-bars");
  LANES.forEach((lane) => bars.append(impactBar(lane.label, item.impactScores?.[lane.id] || 0)));
  const tags = node.querySelector(".tag-row");
  item.affected.slice(0, 10).forEach((symbol) => tags.append(tag(symbol, "asset " + (symbol === "BTC" ? "bitcoin" : symbol === "ETH" ? "ethereum" : ""))));
  tags.append(tag(item.sentiment, "sentiment-" + item.sentiment));
  item.categories.slice(0, 5).forEach((category) => tags.append(tag(category)));
  return node;
}

function impactBar(label, value) {
  const div = document.createElement("div");
  div.className = "impact-chip";
  div.innerHTML = "<span>" + escapeHtml(label) + " " + value + "%</span><div class=\"bar\"><span style=\"width:" + Math.max(0, Math.min(100, value)) + "%\"></span></div>";
  return div;
}

function renderHoldings() {
  els.holdings.replaceChildren();
  for (const holding of state.holdings) {
    const key = holding.symbol === "BTC" ? "btc" : holding.symbol === "ETH" ? "eth" : "stocks";
    const scores = state.items.filter((item) => item.affected.includes(holding.symbol) || (holding.type === "stock" && item.lanes.includes("stocks"))).map((item) => item.impactScores?.[key] || item.score);
    const topScore = scores.length ? Math.max(...scores) : 0;
    const chip = document.createElement("button");
    chip.className = "holding-chip";
    chip.type = "button";
    chip.innerHTML = "<strong>" + escapeHtml(holding.symbol) + "</strong><span>" + escapeHtml(holding.name) + "</span><span class=\"mini-score\">" + (topScore ? topScore + "%" : "-") + "</span>";
    chip.addEventListener("click", () => { els.searchInput.value = holding.symbol; state.query = holding.symbol.toLowerCase(); render(); });
    els.holdings.append(chip);
  }
}

function renderAlerts() {
  const threshold = Number(els.alertThreshold.value);
  const alerts = state.items.filter((item) => item.score >= threshold).slice(0, 9);
  els.alertList.replaceChildren();
  if (!alerts.length) { els.alertList.append(emptyState("No signals above your alert threshold.")); return; }
  for (const item of alerts) {
    const top = topImpact(item);
    const card = document.createElement("div");
    card.className = "stack-card";
    card.innerHTML = "<strong>" + escapeHtml(top.label + " " + top.value + "% | " + item.title) + "</strong><span>" + escapeHtml(item.affected.join(", ") + " | " + relativeTime(item.publishedAt)) + "</span>";
    els.alertList.append(card);
  }
}

function renderEtfSignals() {
  els.etfSignals.replaceChildren();
  const signals = state.markets?.etfSignals || [];
  if (!signals.length) { els.etfSignals.append(emptyState("ETF flow headlines unavailable right now.")); return; }
  for (const signal of signals) {
    const card = document.createElement("a");
    card.className = "stack-card";
    card.href = signal.url;
    card.target = "_blank";
    card.rel = "noreferrer";
    card.innerHTML = "<strong>" + escapeHtml(signal.title) + "</strong><span>" + escapeHtml((signal.source || "ETF signal") + " | " + relativeTime(signal.publishedAt)) + "</span>";
    els.etfSignals.append(card);
  }
}

function renderSources() {
  els.sourceList.replaceChildren();
  for (const feed of state.feeds) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => { checkbox.checked ? state.enabledSources.add(feed.id) : state.enabledSources.delete(feed.id); render(); });
    label.append(checkbox, document.createTextNode(feed.label));
    els.sourceList.append(label);
  }
}

function fireNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const threshold = Number(els.alertThreshold.value);
  const fresh = state.items.filter((item) => item.score >= threshold && !state.seenAlerts.has(item.id)).slice(0, 4);
  for (const item of fresh) {
    const top = topImpact(item);
    state.seenAlerts.add(item.id);
    new Notification("Impact " + top.value + "%: " + top.label, { body: item.title, tag: item.id });
  }
  localStorage.setItem("seenAlerts", JSON.stringify([...state.seenAlerts].slice(-400)));
}

async function requestNotifications() { if (!("Notification" in window)) { els.notifyBtn.textContent = "Alerts unavailable"; return; } const permission = await Notification.requestPermission(); els.notifyBtn.textContent = permission === "granted" ? "Alerts enabled" : "Alerts blocked"; fireNotifications(); }
function topImpact(item) { const [lane, value] = Object.entries(item.impactScores || {}).sort((a, b) => b[1] - a[1])[0] || ["macro", item.score]; const found = LANES.find((entry) => entry.id === lane); return { lane, label: found?.label || lane, value }; }
function setStatus(text, mode) { els.statusText.textContent = text; els.statusDot.className = "status-dot " + (mode === "live" ? "live" : mode === "error" ? "error" : ""); }
function renderSkeletons() { els.marketPulse.innerHTML = ""; for (let i = 0; i < 8; i++) els.marketPulse.append(pulseCard("Loading", "--", "syncing", null)); }
function tag(label, className = "") { const span = document.createElement("span"); span.className = "tag " + className; span.textContent = label; return span; }
function emptyState(text) { const div = document.createElement("div"); div.className = "empty-state"; div.textContent = text; return div; }
function formatMarketValue(item) { if (item.value === null || item.value === undefined) return "--"; if (item.kind === "crypto") return usd(item.value, 0); if (item.kind === "yield") return item.value.toFixed(2) + "%"; if (item.id === "nasdaq") return number(item.value, 0); return number(item.value, 2); }
function changeClass(value) { return value > 0 ? "up" : value < 0 ? "down" : ""; }
function formatChange(value) { return value === null || value === undefined ? "change unavailable" : (value > 0 ? "+" : "") + value.toFixed(2) + "%"; }
function usd(value, digits = 0) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value); }
function pct(value) { return value === null || value === undefined ? "--" : Number(value).toFixed(1) + "%"; }
function number(value, digits = 2) { return value === null || value === undefined ? "--" : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value); }
function relativeTime(dateValue) { if (!dateValue) return "time unknown"; const seconds = Math.round((new Date(dateValue).getTime() - Date.now()) / 1000); const abs = Math.abs(seconds); const units = [["day", 86400], ["hour", 3600], ["minute", 60]]; for (const pair of units) if (abs >= pair[1]) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(seconds / pair[1]), pair[0]); return "just now"; }
function formatTime(dateValue) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dateValue)); }
function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
