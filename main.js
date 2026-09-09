const { app, BrowserWindow, shell, session, ipcMain } = require("electron");
const path = require("path");

const CHANNELS = [
  { name:"Corinthians", handle:"@corinthians", emoji:"⚫⚪" },
  { name:"Palmeiras", handle:"@Palmeiras", emoji:"🟢⚪" },
  { name:"São Paulo", handle:"@saopaulofc", emoji:"🔴⚪⚫" },
  { name:"Santos", handle:"@SantosFC", emoji:"⚪⚫" }
];

const POSITIVE = [
  ["treino",10],["treinamento",10],["training",10],["reapresentacao",9],
  ["ultimos ajustes",9],["ajustes finais",9],["ajustes",5],["preparacao",8],
  ["preparativos",7],["atividade",6],["atividades",6],["trabalho no ct",8],
  ["trabalhos no ct",8],["trabalho",4],["direto do ct",8],["sessao",6],
  ["aquecimento",5],["com bola",4],["sem bola",4],["tatico",5],
  ["atividade no campo",8],["atividade no ct",8],["de olho no",3],
  ["foco no",3],["focado no",3],["elenco",2],["campo",2],["ct",2]
];

const NEGATIVE = [
  ["feminino",-40],["feminina",-40],["brabas",-40],["sereias",-40],
  ["futsal",-40],["basquete",-40],["volei",-40],["sub-11",-40],
  ["sub-12",-40],["sub-13",-40],["sub-14",-40],["sub-15",-40],
  ["sub-17",-40],["sub-20",-40],["base",-30],["juvenil",-30],
  ["infantil",-30],["podcast",-25],["melhores momentos",-30],
  ["jogo completo",-30],["pos-jogo",-25],["pos jogo",-25],["ao vivo",-25],
  ["gol",-20],["gols",-25]
];

let mainWindow;

function createWindow(){
  mainWindow=new BrowserWindow({
    width:1120,height:760,minWidth:850,minHeight:620,
    autoHideMenuBar:true,backgroundColor:"#f3f4f6",
    webPreferences:{
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      preload:path.join(__dirname,"preload.js")
    }
  });
  mainWindow.loadFile("index.html");
  mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:"deny"};});
}

function normalize(s){
  return String(s||"").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
}

function score(title,description=""){
  const text=normalize(`${title} ${description}`);
  let s=0;
  for(const [w,p] of POSITIVE) if(text.includes(w)) s+=p;
  for(const [w,p] of NEGATIVE) if(text.includes(w)) s+=p;
  if((text.includes("ajustes")||text.includes("preparacao")) &&
     (text.includes("confronto")||text.includes("partida")||text.includes("jogo"))) s+=6;
  return s;
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function scrapeVideos(handle){
  const bw=new BrowserWindow({
    show:false,width:1280,height:900,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  try{
    bw.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36");
    await bw.loadURL(`https://www.youtube.com/${handle}/videos?hl=pt-BR&gl=BR`);
    await sleep(3500);
    return await bw.webContents.executeJavaScript(`
      (() => {
        const out=[]; const seen=new Set();
        const nodes=[...document.querySelectorAll('ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-video-renderer')];
        for(const el of nodes){
          const a=el.querySelector('a#video-title-link,a#video-title,a[href*="/watch?v="]');
          if(!a) continue;
          const href=a.href||a.getAttribute('href')||'';
          const m=href.match(/[?&]v=([^&]+)/);
          if(!m||seen.has(m[1])) continue;
          const title=(a.textContent||a.getAttribute('title')||a.getAttribute('aria-label')||'').trim();
          if(!title) continue;
          seen.add(m[1]);
          const img=el.querySelector('img');
          out.push({title,videoId:m[1],url:'https://www.youtube.com/watch?v='+m[1],
            thumbnail:img?(img.src||img.getAttribute('src')):''});
        }
        if(!out.length){
          for(const a of document.querySelectorAll('a[href*="/watch?v="]')){
            const m=(a.href||'').match(/[?&]v=([^&]+)/);
            if(!m||seen.has(m[1])) continue;
            const title=(a.textContent||a.getAttribute('title')||a.getAttribute('aria-label')||'').trim();
            if(!title) continue;
            seen.add(m[1]);
            out.push({title,videoId:m[1],url:'https://www.youtube.com/watch?v='+m[1],thumbnail:''});
          }
        }
        return out.slice(0,40);
      })()
    `);
  }finally{bw.destroy();}
}

async function getDescription(url){
  const bw=new BrowserWindow({
    show:false,width:1000,height:700,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  try{
    await bw.loadURL(url+"&hl=pt-BR");
    await sleep(1000);
    return await bw.webContents.executeJavaScript(`
      (()=>{const m=document.querySelector('meta[property="og:description"],meta[name="description"]');return m?m.content||"":""})()
    `);
  }catch(_){return ""}finally{bw.destroy();}
}

async function findLatest(channel){
  const videos=await scrapeVideos(channel.handle);
  if(!videos.length) throw new Error("Não consegui ler os vídeos do canal do YouTube.");

  const preliminary=videos.map(v=>({...v,score:score(v.title)}));
  preliminary.sort((a,b)=>b.score-a.score);
  const top=preliminary.slice(0,12);
  const enriched=[];
  for(const v of top){
    const desc=v.score<8?await getDescription(v.url):"";
    enriched.push({...v,description:desc,score:score(v.title,desc)});
  }
  const usable=enriched.filter(v=>v.score>=5);
  if(!usable.length) throw new Error("Nenhum vídeo de treino/preparação identificado nos vídeos recentes.");
  usable.sort((a,b)=>b.score-a.score);
  return {...channel,...usable[0],ok:true};
}

ipcMain.handle("get-latest-trainings",async()=>{
  const out=[];
  for(const c of CHANNELS){
    try{out.push(await findLatest(c));}
    catch(e){out.push({...c,ok:false,error:e.message||String(e)});}
  }
  return out;
});

app.whenReady().then(()=>{
  session.defaultSession.webRequest.onBeforeSendHeaders((details,cb)=>{
    details.requestHeaders["User-Agent"]="Mozilla/5.0";
    cb({requestHeaders:details.requestHeaders});
  });
  createWindow();
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
