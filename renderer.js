const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function fmt(s){try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(s))}catch{return s}}
function render(items){
  $("grid").innerHTML=items.map(x=>`
    <article class="card">
      <div class="club">
        <span class="club-mark">${esc(x.emoji)}</span>
        <div>
          <strong>${esc(x.name)}</strong>
          <small>Futebol masculino · profissional</small>
        </div>
      </div>
      ${x.error ? `<div class="error">${esc(x.error)}</div>` : `
      <div class="thumb">
        <img src="${esc(x.thumbnail)}" alt="" loading="lazy">
        <span class="thumb-badge">YOUTUBE</span>
      </div>
      <div class="title">${esc(x.title)}</div>
      <div class="date">${fmt(x.published)}</div>
      <div class="actions">
        <button class="copy" onclick='copyLink(${JSON.stringify(x.url)}, this)'>⧉ Copiar link</button>
      </div>`}
    </article>`).join("");
}

async function copyLink(url, button){
  try {
    await navigator.clipboard.writeText(url);
  } catch(e) {
    const ta=document.createElement("textarea");
    ta.value=url; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  const old=button.textContent;
  button.textContent="✓ Link copiado";
  button.classList.add("copied");
  setTimeout(()=>{button.textContent=old;button.classList.remove("copied")},1800);
}

async function load(){
  $("refresh").disabled=true; $("refresh").textContent="Atualizando…";
  $("grid").innerHTML=`<div class="loading">Analisando títulos e descrições dos vídeos recentes…</div>`;
  try { render(await window.treinosAPI.getLatestTrainings()); $("updated").textContent="Atualizado em "+new Date().toLocaleString("pt-BR"); }
  catch(e){ $("grid").innerHTML=`<div class="loading">Erro: ${esc(e.message||e)}</div>`; }
  $("refresh").disabled=false; $("refresh").textContent="↻ Atualizar";
}
load();
