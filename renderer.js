const CHANNELS = [
  { name:"Corinthians", handle:"@corinthians", emoji:"⚫⚪" },
  { name:"Palmeiras", handle:"@Palmeiras", emoji:"🟢⚪" },
  { name:"São Paulo", handle:"@saopaulofc", emoji:"🔴⚪⚫" },
  { name:"Santos", handle:"@santosfc", emoji:"⚪⚫" }
];

const POSITIVE = [
  "treino","treinamento","training","reapresentação","reapresentacao",
  "trabalho no ct","trabalhos no ct","atividade no ct","atividades no ct",
  "preparação","preparacao","treino do","direto do ct"
];

const NEGATIVE = [
  "feminino","brabas","sereias","futsal","sub-11","sub-12","sub-13",
  "sub-14","sub-15","sub-17","sub-20","base","juvenil","infantil",
  "basquete","vôlei","volei","feminina"
];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

function channelIdFromHtml(html){
  for(const re of [/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/,/channel\/(UC[a-zA-Z0-9_-]{20,})/]){
    const m=html.match(re); if(m) return m[1];
  }
  return null;
}

async function findLatest(c){
  const r = await fetch("https://www.youtube.com/"+c.handle, {headers:{"User-Agent":"Mozilla/5.0"}});
  const html = await r.text();
  const cid = channelIdFromHtml(html);
  if(!cid) throw new Error("Canal não identificado");

  const rss = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id="+encodeURIComponent(cid));
  const xml = await rss.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml,"application/xml");
  const entries = [...doc.querySelectorAll("entry")];

  const candidates = entries.map(e=>{
    const title=e.querySelector("title")?.textContent||"";
    const published=e.querySelector("published")?.textContent||"";
    const vid=e.querySelector("videoId")?.textContent||"";
    return {title,published,vid};
  }).filter(v=>{
    const t=v.title.toLowerCase();
    return v.vid && POSITIVE.some(x=>t.includes(x)) && !NEGATIVE.some(x=>t.includes(x));
  }).sort((a,b)=>new Date(b.published)-new Date(a.published));

  if(!candidates.length) throw new Error("Nenhum treino identificado");
  const v=candidates[0];
  return {...c, ...v, url:"https://www.youtube.com/watch?v="+v.vid, thumbnail:"https://i.ytimg.com/vi/"+v.vid+"/hqdefault.jpg"};
}

function fmt(s){
  try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(s))}
  catch{return s}
}

function render(items){
  $("grid").innerHTML=items.map(x=>`
    <article class="card">
      <div class="club">${esc(x.emoji)} ${esc(x.name)}</div>
      ${x.error ? `<div class="error">${esc(x.error)}</div>` : `
      <a class="thumb" href="${esc(x.url)}"><img src="${esc(x.thumbnail)}"></a>
      <div class="title">${esc(x.title)}</div>
      <div class="date">${fmt(x.published)}</div>
      <div class="actions">
        <a class="watch" href="${esc(x.url)}">▶ Assistir no YouTube</a>
      </div>`}
    </article>`).join("");
}

async function load(){
  $("refresh").disabled=true;
  $("refresh").textContent="Atualizando…";
  $("grid").innerHTML=`<div class="loading">Consultando os quatro canais oficiais…</div>`;
  const out=[];
  for(const c of CHANNELS){
    try{out.push(await findLatest(c))}
    catch(e){out.push({...c,error:e.message||"Erro"})}
  }
  render(out);
  $("updated").textContent="Atualizado em "+new Date().toLocaleString("pt-BR");
  $("refresh").disabled=false;
  $("refresh").textContent="↻ Atualizar";
}
load();
