const { app, BrowserWindow, shell, session, ipcMain } = require("electron");

const CHANNELS = [
  { name:"Corinthians", handle:"@corinthians", emoji:"⚫⚪" },
  { name:"Palmeiras", handle:"@Palmeiras", emoji:"🟢⚪" },
  { name:"São Paulo", handle:"@saopaulofc", emoji:"🔴⚪⚫" },
  { name:"Santos", handle:"@SantosFC", emoji:"⚪⚫" }
];

// Palavras que aparecem em títulos de treinos e conteúdos de preparação,
// mesmo quando o clube não usa a palavra "treino".
const POSITIVE = [
  ["treino", 10], ["treinamento", 10], ["training", 10],
  ["reapresentação", 8], ["reapresentacao", 8],
  ["últimos ajustes", 9], ["ultimos ajustes", 9], ["ajustes finais", 9],
  ["ajustes", 5], ["preparação", 8], ["preparacao", 8],
  ["preparativos", 7], ["atividade", 6], ["atividades", 6],
  ["trabalho no ct", 8], ["trabalhos no ct", 8], ["trabalho", 4],
  ["direto do ct", 8], ["ct", 2], ["campo", 2], ["elenco", 2],
  ["sessão", 6], ["sessao", 6], ["aquecimento", 6],
  ["com bola", 4], ["sem bola", 4], ["tático", 5], ["tatico", 5],
  ["atividade no campo", 8], ["atividade no ct", 8],
  ["de olho no", 3], ["foco no", 3], ["focado no", 3]
];

// Conteúdos que normalmente não são o que queremos.
const NEGATIVE = [
  ["feminino", -30], ["feminina", -30], ["brabas", -30], ["sereias", -30],
  ["futsal", -30], ["basquete", -30], ["vôlei", -30], ["volei", -30],
  ["sub-11", -30], ["sub-12", -30], ["sub-13", -30], ["sub-14", -30],
  ["sub-15", -30], ["sub-17", -30], ["sub-20", -30], ["base", -25],
  ["juvenil", -25], ["infantil", -25], ["entrevista", -10],
  ["coletiva", -8], ["coletiva de imprensa", -10], ["podcast", -20],
  ["melhores momentos", -25], ["gols", -20], ["gol", -15],
  ["pós-jogo", -18], ["pos-jogo", -18], ["pós jogo", -18], ["pos jogo", -18],
  ["bastidores do jogo", -10], ["jogo completo", -25], ["ao vivo", -20]
];

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 850, minHeight: 620,
    autoHideMenuBar: true, backgroundColor: "#f3f4f6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: require("path").join(__dirname, "preload.js")
    }
  });
  win.loadFile("index.html");
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: "deny" };
  });
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, " ")
    .trim();
}

function normalize(s) {
  return decodeHtml(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractChannelId(html) {
  const patterns = [
    /"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /"externalId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /channel\/(UC[a-zA-Z0-9_-]{20,})/
  ];
  for (const re of patterns) {
    const m = html.match(re); if (m) return m[1];
  }
  return null;
}

function extractTag(html, name, attr = "content") {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+${attr}=["']([^"']*)["'][^>]*>`, "i");
  const m = html.match(re);
  if (m) return decodeHtml(m[1]);
  const re2 = new RegExp(`<meta[^>]+${attr}=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeHtml(m2[1]) : "";
}

function scoreCandidate(title, description = "") {
  const text = normalize(`${title} ${description}`);
  let score = 0;
  for (const [word, points] of POSITIVE) if (text.includes(normalize(word))) score += points;
  for (const [word, points] of NEGATIVE) if (text.includes(normalize(word))) score += points;

  // "confronto/jogo" sozinho não é suficiente para classificar como treino,
  // mas "últimos ajustes para confronto" é fortemente indicativo de preparação.
  if (text.includes("confronto") || text.includes("partida") || text.includes("jogo")) score += 1;
  if (text.includes("preparacao") && (text.includes("confronto") || text.includes("partida") || text.includes("jogo"))) score += 4;
  if (text.includes("ajustes") && (text.includes("confronto") || text.includes("partida") || text.includes("jogo"))) score += 5;
  return score;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Treinos-SP" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function parseFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  return entries.map(e => {
    const get = tag => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`));
      return m ? decodeHtml(m[1]) : "";
    };
    return {
      title: get("title"),
      published: get("published"),
      videoId: get("yt:videoId")
    };
  }).filter(x => x.videoId && x.title);
}

async function enrichCandidate(c) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}`);
    const description = extractTag(html, "og:description") || extractTag(html, "description") || "";
    const keywords = extractTag(html, "keywords") || "";
    const combined = `${description} ${keywords}`;
    return { ...c, description, score: scoreCandidate(c.title, combined) };
  } catch (_) {
    return { ...c, description: "", score: scoreCandidate(c.title) };
  }
}

async function findLatest(channel) {
  const channelHtml = await fetchText(`https://www.youtube.com/${channel.handle}`);
  const channelId = extractChannelId(channelHtml);
  if (!channelId) throw new Error("Canal não identificado");

  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const entries = parseFeed(xml).slice(0, 10);
  const enriched = await Promise.all(entries.map(enrichCandidate));

  const usable = enriched.filter(x => x.score >= 5 && x.score < 0x7fffffff);
  if (!usable.length) throw new Error("Nenhum vídeo de treino/preparação identificado entre os vídeos recentes.");

  // A prioridade é relevância, mas vídeos muito antigos perdem pontos.
  // Assim, um treino de ontem vence um vídeo antigo só porque tinha a palavra "treino".
  const now = Date.now();
  const ranked = usable.map(x => {
    const ageHours = Math.max(0, (now - new Date(x.published).getTime()) / 3600000);
    const recencyPenalty = Math.min(8, ageHours / 48);
    return { ...x, finalScore: x.score - recencyPenalty };
  }).sort((a,b) => b.finalScore - a.finalScore || new Date(b.published) - new Date(a.published));

  const v = ranked[0];
  return {
    ...channel, ...v,
    ok: true,
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
  };
}

ipcMain.handle("get-latest-trainings", async () => {
  const out = [];
  for (const channel of CHANNELS) {
    try { out.push(await findLatest(channel)); }
    catch (e) { out.push({ ...channel, ok:false, error:e.message || String(e) }); }
  }
  return out;
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] = "Mozilla/5.0";
    callback({ requestHeaders: details.requestHeaders });
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
