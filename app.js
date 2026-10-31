/* StreamVerse — directory with manage mode + GitHub publishing */
(() => {
  const LS_STATE = "sv_state_v1";
  const LS_GH = "sv_github_v1";
  const HUES = { movies: "#e50914", anime: "#ff7ad9", manga: "#8b5cf6", livetv: "#22d3ee", paid: "#facc15" };
  const FALLBACK_HUES = ["#f97316", "#10b981", "#3b82f6", "#ec4899", "#a3e635"];
  // Sites known to refuse being shown inside another page.
  const NO_EMBED = ["netflix.com","disneyplus.com","hulu.com","hbomax.com","max.com","primevideo.com","amazon.com",
    "tv.apple.com","paramountplus.com","peacocktv.com","crunchyroll.com","youtube.com","viki.com","shudder.com",
    "mgmplus.com","amcplus.com","plex.tv","pluto.tv","tubitv.com","webtoons.com","viz.com","roku.com"];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let remote = null;   // what's published (links.json)
  let state = null;    // what's shown (remote or local edits)
  let editing = false;

  /* ---------- helpers ---------- */
  const safeLS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
  const favicon = (url) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(url))}&sz=64`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const blocksEmbed = (url) => { const h = host(url); return NO_EMBED.some((d) => h === d || h.endsWith("." + d)); };
  const hueFor = (catId) => HUES[catId] || FALLBACK_HUES[[...catId].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_HUES.length];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const isDirty = () => JSON.stringify(state) !== JSON.stringify(remote);

  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg; t.classList.toggle("err", err); t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function save() {
    if (isDirty()) safeLS.set(LS_STATE, state); else safeLS.del(LS_STATE);
    $("#pendingNote").hidden = !isDirty();
    render();
  }

  /* ---------- load ---------- */
  async function load() {
    try {
      const r = await fetch("links.json?ts=" + Date.now(), { cache: "no-store" });
      remote = await r.json();
    } catch {
      remote = { categories: [], sites: [] };
      toast("Couldn't load links.json", true);
    }
    const local = safeLS.get(LS_STATE);
    state = local && local.sites ? local : structuredClone(remote);
    $("#pendingNote").hidden = !isDirty();
    render();
  }

  /* ---------- render ---------- */
  function render() {
    const { categories, sites } = state;
    $("#navLinks").innerHTML = categories.map((c) => `<a href="#cat-${c.id}">${esc(c.name)}</a>`).join("");
    const trusted = sites.filter((s) => s.trusted).length;
    $("#stats").innerHTML = [
      [sites.length, "Sites"], [categories.length, "Categories"], [trusted, "Trusted"],
    ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
    $("#catSelect").innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

    $("#rows").innerHTML = categories.map((c) => {
      const list = sites.filter((s) => s.cat === c.id)
        .sort((a, b) => (b.trusted - a.trusted) || a.name.localeCompare(b.name));
      const hue = hueFor(c.id);
      const cards = list.map((s) => cardHTML(s, c, hue)).join("");
      const add = editing ? `<button class="card add-card" data-add="${c.id}" style="--hue:${hue}"><span><b>+</b>Add to ${esc(c.name)}</span></button>` : "";
      return `<section class="row" id="cat-${c.id}">
        <div class="row-head"><h2>${esc(c.name)}</h2><span class="row-jp">${esc(c.jp || "")}</span><span class="row-count">${list.length}</span></div>
        ${c.desc ? `<p class="row-desc">${esc(c.desc)}</p>` : ""}
        <div class="rail-wrap">
          <button class="rail-arrow left" aria-label="Scroll left">‹</button>
          <div class="rail">${cards || ""}${add}</div>
          <button class="rail-arrow right" aria-label="Scroll right">›</button>
        </div>
        ${!list.length && !editing ? `<p class="empty-row">Nothing here yet.</p>` : ""}
      </section>`;
    }).join("");
  }

  function cardHTML(s, c, hue) {
    return `<article class="card" tabindex="0" data-id="${s.id}" style="--hue:${hue}" aria-label="${esc(s.name)}">
      <div class="card-art"><span class="card-glyph">${esc((c.jp || "★").slice(0, 1))}</span></div>
      <img class="card-icon" src="${favicon(s.url)}" alt="" loading="lazy" onerror="this.remove()">
      ${s.trusted ? `<span class="badge">★ Trusted</span>` : ""}
      <div class="card-tools">
        <button class="tool star ${s.trusted ? "on" : ""}" data-star="${s.id}" title="${s.trusted ? "Unmark trusted" : "Mark trusted"}" aria-label="Toggle trusted">★</button>
        <button class="tool del" data-del="${s.id}" title="Delete" aria-label="Delete ${esc(s.name)}">🗑</button>
      </div>
      <div class="card-body"><p class="card-name">${esc(s.name)}</p><div class="card-host">${esc(host(s.url))}</div></div>
    </article>`;
  }

  /* ---------- overlays ---------- */
  function open(id) { $("#" + id).hidden = false; document.body.style.overflow = "hidden"; }
  function close(id) {
    $("#" + id).hidden = true;
    if (!$$(".overlay").some((o) => !o.hidden)) document.body.style.overflow = "";
    if (id === "playerOverlay") $("#playerFrame").src = "about:blank";
    if (id === "addOverlay") { $("#previewFrame").src = "about:blank"; $("#previewEmpty").hidden = false; }
  }

  /* ---------- player ---------- */
  function play(site) {
    $("#playerName").textContent = site.name;
    $("#playerHost").textContent = host(site.url);
    $("#playerIcon").src = favicon(site.url);
    $("#playerOpen").href = site.url;
    $("#playerHintOpen").href = site.url;
    const blocked = blocksEmbed(site.url);
    $(".player-frame").classList.toggle("blocked", blocked);
    $("#playerFrame").src = blocked ? "about:blank" : site.url;
    open("playerOverlay");
  }

  /* ---------- search ---------- */
  let results = [], active = 0;
  function score(q, text) {
    q = q.toLowerCase(); text = text.toLowerCase();
    if (!q) return 1;
    const i = text.indexOf(q);
    if (i >= 0) return 100 - i;
    let ti = 0, s = 0, run = 0;
    for (const ch of q) {
      const f = text.indexOf(ch, ti);
      if (f < 0) return 0;
      run = f === ti ? run + 1 : 0; s += 1 + run; ti = f + 1;
    }
    return s;
  }
  function highlight(q, name) {
    const i = name.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(name);
    return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + q.length)) + "</mark>" + esc(name.slice(i + q.length));
  }
  function runSearch() {
    const q = $("#searchInput").value.trim();
    const cats = Object.fromEntries(state.categories.map((c) => [c.id, c]));
    results = state.sites
      .map((s) => ({ s, sc: Math.max(score(q, s.name) * 2, score(q, host(s.url)), score(q, cats[s.cat]?.name || "") * 0.6) + (s.trusted ? 0.5 : 0) }))
      .filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 30).map((r) => r.s);
    active = 0;
    $("#results").innerHTML = results.length ? results.map((s, i) => `<li data-i="${i}" class="${i === 0 ? "active" : ""}">
      <img src="${favicon(s.url)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="r-main"><div class="r-name">${highlight(q, s.name)} ${s.trusted ? "<span style='color:var(--gold)'>★</span>" : ""}</div><div class="r-meta">${esc(host(s.url))}</div></div>
      <span class="r-cat">${esc(cats[s.cat]?.name || "")}</span></li>`).join("") : `<li class="none">No matches</li>`;
  }
  function openSearch() { open("searchOverlay"); $("#searchInput").value = ""; runSearch(); setTimeout(() => $("#searchInput").focus(), 20); }
  function setActive(i) {
    const items = $$("#results li[data-i]"); if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((li, j) => li.classList.toggle("active", j === active));
    items[active].scrollIntoView({ block: "nearest" });
  }
  function pick(i) { const s = results[i]; if (!s) return; close("searchOverlay"); play(s); }

  /* ---------- manage ---------- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    $("#toggleEdit").setAttribute("aria-pressed", on);
    $("#editBanner").hidden = !on;
    render();
  }
  function openAdd(catId) {
    const f = $("#addForm"); f.reset();
    if (catId) f.cat.value = catId;
    $("#previewEmpty").hidden = false; $("#previewEmpty").textContent = "Paste a link to preview it here.";
    open("addOverlay"); setTimeout(() => f.url.focus(), 20);
  }
  let previewT;
  function updatePreview() {
    const f = $("#addForm"); const url = f.url.value.trim();
    clearTimeout(previewT);
    previewT = setTimeout(() => {
      let ok = false; try { ok = /^https?:$/.test(new URL(url).protocol); } catch {}
      if (!ok) { $("#previewFrame").src = "about:blank"; $("#previewEmpty").hidden = false; $("#previewEmpty").textContent = "Paste a link to preview it here."; return; }
      if (!f.name.dataset.touched) {
        const h = host(url).split(".").slice(-2, -1)[0] || host(url);
        f.name.value = h.charAt(0).toUpperCase() + h.slice(1);
      }
      if (blocksEmbed(url)) {
        $("#previewFrame").src = "about:blank"; $("#previewEmpty").hidden = false;
        $("#previewEmpty").textContent = host(url) + " doesn't allow embedding — it will open in a new tab.";
      } else { $("#previewEmpty").hidden = true; $("#previewFrame").src = url; }
    }, 450);
  }
  function addSite(e) {
    e.preventDefault();
    const f = e.target; const url = f.url.value.trim();
    try { new URL(url); } catch { toast("That link doesn't look right", true); return; }
    if (state.sites.some((s) => s.url.replace(/\/$/, "") === url.replace(/\/$/, ""))) { toast("That site is already on the list", true); return; }
    const name = (f.name.value.trim() || host(url)).slice(0, 40);
    state.sites.push({ id: uid(), name, url, cat: f.cat.value, trusted: f.trusted.checked });
    close("addOverlay"); save(); toast(`Added ${name}`);
    $("#cat-" + f.cat.value)?.scrollIntoView({ behavior: "smooth" });
  }
  function toggleTrust(id) {
    const s = state.sites.find((x) => x.id === id); if (!s) return;
    s.trusted = !s.trusted; save(); toast(s.trusted ? `${s.name} marked trusted` : `${s.name} unmarked`);
  }
  function del(id) {
    const s = state.sites.find((x) => x.id === id); if (!s) return;
    if (!confirm(`Delete ${s.name}?`)) return;
    state.sites = state.sites.filter((x) => x.id !== id); save(); toast(`Deleted ${s.name}`);
  }

  /* ---------- GitHub publish ---------- */
  const gh = () => safeLS.get(LS_GH) || {};
  function openSettings() {
    const f = $("#settingsForm"), c = gh();
    f.repo.value = c.repo || guessRepo(); f.branch.value = c.branch || "main"; f.token.value = c.token || "";
    open("settingsOverlay");
  }
  function guessRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (!m) return "";
    const path = location.pathname.split("/").filter(Boolean)[0];
    return `${m[1]}/${path || m[1] + ".github.io"}`;
  }
  const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  async function publish() {
    const c = gh();
    if (!c.repo || !c.token) { toast("Set up GitHub sync first"); openSettings(); return; }
    if (!isDirty()) { toast("Nothing new to publish"); return; }
    const btn = $("#publishBtn"); btn.disabled = true; btn.textContent = "Publishing…";
    const api = `https://api.github.com/repos/${c.repo}/contents/links.json`;
    const headers = { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json" };
    try {
      const cur = await fetch(`${api}?ref=${encodeURIComponent(c.branch)}`, { headers });
      if (!cur.ok) throw new Error(cur.status === 404 ? "Repo or file not found" : `GitHub said ${cur.status}`);
      const { sha } = await cur.json();
      const res = await fetch(api, {
        method: "PUT", headers,
        body: JSON.stringify({ message: "Update links via StreamVerse manager", content: b64(JSON.stringify(state, null, 2) + "\n"), sha, branch: c.branch }),
      });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Token rejected — check its permissions" : `GitHub said ${res.status}`);
      remote = structuredClone(state); safeLS.del(LS_STATE); $("#pendingNote").hidden = true;
      toast("Published! The live site updates in about a minute.");
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = "Publish to site"; }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const star = t.closest("[data-star]"); if (star) { e.stopPropagation(); return toggleTrust(star.dataset.star); }
    const d = t.closest("[data-del]"); if (d) { e.stopPropagation(); return del(d.dataset.del); }
    const a = t.closest("[data-add]"); if (a) return openAdd(a.dataset.add);
    const c = t.closest("[data-close]"); if (c) return close(c.dataset.close);
    const card = t.closest(".card[data-id]"); if (card) return play(state.sites.find((s) => s.id === card.dataset.id));
    const arrow = t.closest(".rail-arrow");
    if (arrow) { const rail = arrow.parentElement.querySelector(".rail"); rail.scrollBy({ left: (arrow.classList.contains("left") ? -1 : 1) * rail.clientWidth * 0.85, behavior: "smooth" }); return; }
    const li = t.closest("#results li[data-i]"); if (li) return pick(+li.dataset.i);
    if (t.classList.contains("overlay")) close(t.id);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); return; }
    if (e.key === "Escape") { const o = $$(".overlay").reverse().find((x) => !x.hidden); if (o) close(o.id); return; }
    if (!$("#searchOverlay").hidden) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      if (e.key === "Enter") { e.preventDefault(); pick(active); }
    }
    if (e.key === "Enter" && document.activeElement.matches(".card[data-id]")) document.activeElement.click();
  });
  $("#searchInput").addEventListener("input", runSearch);
  $("#openSearch").onclick = openSearch;
  $("#heroSearch").onclick = openSearch;
  $("#toggleEdit").onclick = () => setEditing(!editing);
  $("#heroAdd").onclick = () => { if (!editing) setEditing(true); openAdd(); };
  $("#bannerAdd").onclick = () => openAdd();
  $("#playerClose").onclick = () => close("playerOverlay");
  $("#addForm").addEventListener("submit", addSite);
  $("#addForm").url.addEventListener("input", updatePreview);
  $("#addForm").name.addEventListener("input", (e) => (e.target.dataset.touched = e.target.value ? "1" : ""));
  $("#openSettings").onclick = openSettings;
  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target;
    safeLS.set(LS_GH, { repo: f.repo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, ""), branch: f.branch.value.trim() || "main", token: f.token.value.trim() });
    close("settingsOverlay"); toast("GitHub sync saved");
  });
  $("#forgetToken").onclick = () => { const c = gh(); delete c.token; safeLS.set(LS_GH, c); $("#settingsForm").token.value = ""; toast("Token removed from this browser"); };
  $("#publishBtn").onclick = publish;
  $("#resetBtn").onclick = () => {
    if (!isDirty()) return toast("No local changes");
    if (!confirm("Discard all unpublished changes in this browser?")) return;
    state = structuredClone(remote); save(); toast("Local changes discarded");
  };
  addEventListener("scroll", () => $("#nav").classList.toggle("scrolled", scrollY > 20), { passive: true });

  /* petals */
  const box = $(".petals");
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("span"); p.className = "petal";
    p.style.left = Math.random() * 100 + "vw";
    p.style.setProperty("--drift", (Math.random() * 200 - 100) + "px");
    p.style.animationDuration = 9 + Math.random() * 12 + "s";
    p.style.animationDelay = -Math.random() * 20 + "s";
    p.style.transform = `scale(${0.6 + Math.random()})`;
    box.appendChild(p);
  }

  load();
})();
