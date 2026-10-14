/* Фэнтези-штаб AREAL FFC: обзор, турниры, данные; выбор профиля участника. Без сборщика — чистый JS. */
(() => {
  "use strict";
  const TZ = "Europe/Moscow";
  const ORDER = ["russia", "england", "spain", "champions-league"];
  const TABS = [
    ["scenarios", "Сценарии"], ["squad", "Мой состав"], ["ideal", "Сильнейший"], ["fixtures", "Календарь"],
    ["top", "Топ-100"], ["injuries", "Травмы"], ["report", "Отчёт"],
  ];
  const cache = {};
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");
  const foot = document.getElementById("foot");
  const whoWrap = document.getElementById("who-wrap");
  const whoBtn = document.getElementById("who-btn");
  const whoList = document.getElementById("who-list");

  // ---------- профиль участника (выбор хранится в браузере) ----------
  const PKEY = "areal.profile";
  const store = {
    get() { try { return localStorage.getItem(PKEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(PKEY, v); } catch (e) { /* приватный режим — живём без памяти */ } },
  };
  let PROFILE = null; // объект профиля из overview.profiles
  const ava = (p, cls = "ava") => (p?.avatar ? `<img class="${cls}" src="${esc(p.avatar)}" alt="">` : `<span class="${cls} ava-empty">${esc((p?.name || "?")[0])}</span>`);
  function pickProfile(ov) {
    const saved = store.get();
    PROFILE = ov.profiles.find((p) => p.id === saved) || ov.profiles.find((p) => p.main) || ov.profiles[0] || null;
    if (ov.profiles.length < 2) return;
    whoWrap.hidden = false;
    whoBtn.innerHTML = `${ava(PROFILE)}<span>${esc(PROFILE.name)}</span>`;
    whoList.innerHTML = ov.profiles.map((p) => `<li role="option" tabindex="-1" data-id="${esc(p.id)}" aria-selected="${p === PROFILE}">${ava(p)}<span>${esc(p.name)}<small>${esc(Object.values(p.tournaments)[0]?.squad?.name || "")}</small></span></li>`).join("");
  }
  const openList = (on) => {
    whoList.hidden = !on; whoBtn.setAttribute("aria-expanded", String(on));
    if (on) (whoList.querySelector('[aria-selected="true"]') || whoList.firstElementChild)?.focus();
  };
  whoBtn.addEventListener("click", () => openList(whoList.hidden));
  whoList.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]"); if (!li) return;
    store.set(li.dataset.id); openList(false); whoBtn.focus(); render();
  });
  whoList.addEventListener("keydown", (e) => {
    const items = [...whoList.children]; const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement.click(); }
    else if (e.key === "Escape") { openList(false); whoBtn.focus(); }
  });
  document.addEventListener("click", (e) => { if (!whoWrap.contains(e.target)) openList(false); });
  const mine = () => (PROFILE ? PROFILE.tournaments : {});

  // ---------- утилиты ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (x, d = 1) => (x == null || isNaN(x) ? "—" : Number(x).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const int = (x) => (x == null ? "—" : Number(x).toLocaleString("ru-RU"));
  const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
  const fmt = (iso, o) => (iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, ...o }).format(new Date(iso)) : "—");
  const dateTime = (iso) => fmt(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const weekdayTime = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  function left(iso) {
    if (!iso) return "";
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return "прошёл";
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    if (h >= 48) return `${Math.floor(h / 24)} д ${h % 24} ч`;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  }
  function ago(iso) {
    if (!iso) return "нет данных";
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 60) return `${Math.max(m, 0)} мин назад`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} ч назад`;
    return `${Math.round(h / 24)} д назад`;
  }
  const cd = (iso) => {
    const soon = iso && new Date(iso) - Date.now() < 864e5 && new Date(iso) > Date.now();
    return `<span class="cd${soon ? " soon" : ""}" data-cd="${esc(iso)}">${left(iso)}</span>`;
  };
  async function get(name) {
    if (!cache[name]) cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`data/${name}.json: HTTP ${r.status}`);
      return r.json();
    });
    return cache[name];
  }
  let CUR = null; // данные открытого турнира: логотипы клубов и фото игроков
  const crest = (team, cls = "crest") => {
    const u = CUR?.logos?.[team];
    return u ? `<img class="${cls}" src="${esc(u)}" alt="${esc(team)}" title="${esc(team)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  };
  // позиция — цветной квадратик: ВР жёлтый, ЗЩ синий, ПЗ зелёный, НП красный
  const POS_CLS = { ВР: "gk", ЗЩ: "df", ПЗ: "mf", НП: "fw" };
  const posb = (pos) => `<span class="pos pos-${POS_CLS[pos] || "x"}">${esc(pos)}</span>`;
  const face = (id, cls = "face") => {
    const u = id != null && CUR?.photos?.[String(id)];
    return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  };
  const lastName = (n) => { const p = String(n || "").split(" "); return p.length > 1 ? p.slice(1).join(" ") : p[0]; };
  const placeDiff = (d) => (!d ? "" : d > 0 ? `<span class="up">▲ ${int(d)}</span>` : `<span class="down">▼ ${int(-d)}</span>`);

  // ---------- навигация ----------
  function renderNav(ov, route) {
    const items = [["#/", "AREAL", route.page === "areal"], ["#/me", "Мои команды", route.page === "home"]]
      .concat(ORDER.filter((s) => mine()[s]).map((s) => {
        const t = ov.tournaments.find((x) => x.slug === s);
        return [`#/t/${s}`, t ? t.short : s, route.slug === s];
      }))
      .concat([["#/data", "Данные", route.page === "data"], ["#/rules", "Правила", route.page === "rules"]]);
    nav.innerHTML = items.map(([h, l, on]) => `<a href="${h}"${on ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("");
  }
  function parse() {
    const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (p[0] === "t" && ORDER.includes(p[1])) return { page: "t", slug: p[1], tab: TABS.some(([k]) => k === p[2]) ? p[2] : "scenarios" };
    if (p[0] === "data") return { page: "data" };
    if (p[0] === "me") return { page: "home" };
    if (p[0] === "rules") return { page: "rules", tab: p[1] === "method" ? "method" : "rules" };
    return { page: "areal" };
  }

  // ---------- лента: 10 дней, дорожка на турнир ----------
  const KIND = { deadline: "Дедлайн", update: "Обновление данных", post: "Статистика тура", final: "Итоговые очки", top: "Составы топ-100" };
  function strip(ov, all = false) {
    const days = 10;
    const start = new Date(); start.setUTCHours(start.getUTCHours() - 18, 0, 0, 0);
    const startMsk = new Date(fmt(start.toISOString(), { year: "numeric", month: "2-digit", day: "2-digit" }).split(".").reverse().join("-") + "T00:00:00+03:00");
    const t0 = +startMsk, span = days * 864e5;
    const x = (iso) => ((new Date(iso) - t0) / span) * 100;
    const todayKey = fmt(new Date().toISOString(), { day: "numeric", month: "numeric" });
    const dayCells = Array.from({ length: days }, (_, i) => {
      const iso = new Date(t0 + i * 864e5 + 6e4).toISOString();
      const key = fmt(iso, { day: "numeric", month: "numeric" });
      return `<span class="${key === todayKey ? "today" : ""}">${fmt(iso, { weekday: "short", day: "numeric" })}</span>`;
    }).join("");
    const lanes = ORDER.filter((s) => all || mine()[s]).map((slug) => {
      const t = ov.tournaments.find((z) => z.slug === slug);
      const evs = ov.schedule.events.filter((e) => e.t === slug && x(e.at) >= 0 && x(e.at) <= 100);
      const marks = evs.map((e) => {
        const tip = `${e.tour}: ${e.label} — ${dateTime(e.at)}${e.kind !== "deadline" ? (e.done ? " · выполнено" : new Date(e.at) < Date.now() ? " · не запускалось" : " · запланировано") : ""}`;
        return `<button class="mark ${e.kind}${e.done ? " done" : ""}" style="left:${x(e.at).toFixed(2)}%" title="${esc(tip)}" aria-label="${esc(tip)}"></button>`;
      }).join("");
      return `<div class="lane"><a class="who" href="#/t/${slug}">${esc(t ? t.short : slug)}</a><div class="track">${marks}</div></div>`;
    }).join("");
    const now = x(new Date().toISOString());
    return `<div class="strip">
      <div class="strip-head"><h2>Ближайшие 10 дней</h2>
        <div class="legend"><span><i style="background:var(--yellow)"></i>дедлайн</span>
        <span><i style="border:2px solid var(--pitch);border-radius:50%"></i>обновление данных</span>
        <span><i style="border:2px solid var(--ink);transform:rotate(45deg) scale(.8)"></i>статистика и итоговые очки</span>
        <span><i style="width:2px;background:var(--muted)"></i>составы топ-100</span></div></div>
      <div class="lane-grid"><div class="lanes">
        <div class="days"><span></span><div class="track" style="grid-template-columns:repeat(${days},1fr)">${dayCells}</div></div>
        <div style="position:relative">${lanes}
          <div style="position:absolute;inset:0 0 0 92px;pointer-events:none"><div class="now-line" style="left:${now.toFixed(2)}%"></div></div>
        </div>
      </div></div></div>`;
  }

  // ---------- обзор ----------
  async function home(ov) {
    const my = mine();
    const tours = ov.tournaments.filter((t) => my[t.slug]).map((t) => ({ ...t, ...my[t.slug] }));
    const next = tours.filter((t) => t.nextTour.deadline && new Date(t.nextTour.deadline) > Date.now())
      .sort((a, b) => new Date(a.nextTour.deadline) - new Date(b.nextTour.deadline))[0];
    const hero = next
      ? `<div class="hero"><h1>${esc(next.name)}, ${esc(next.nextTour.name)}<span class="when">дедлайн через ${left(next.nextTour.deadline)}</span></h1>
         <p class="meta">${esc(weekdayTime(next.nextTour.deadline))} МСК<br>Модель советует капитаном <b>${esc(next.pick.captain || "—")}</b></p></div>`
      : `<div class="hero"><h1>Открытых туров нет<span class="when">ждём календарь</span></h1></div>`;
    const rows = tours.slice().sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug)).map((t) => {
      const p = t.pick || {};
      const tr = (p.transfers || []).map((x) => `<span class="tr-out">${esc(lastName(x.out))}</span> → <span class="tr-in">${esc(lastName(x.in))}</span>`).join("<br>");
      return `<tr class="tourn-row">
        <td><a href="#/t/${t.slug}">${esc(t.name)}</a><span class="sub">${esc(t.squad.name || "")}</span></td>
        <td class="num place"><b>${int(t.squad.place)}</b><span class="sub">из ${int(t.squad.total)} ${placeDiff(t.squad.placeDiff)}</span></td>
        <td class="num"><b>${int(t.squad.score)}</b><span class="sub">прошлый тур ${int(t.squad.lastTour)}</span></td>
        <td>${esc(t.nextTour.name || "—")}<span class="sub">${esc(dateTime(t.nextTour.deadline))} · ${cd(t.nextTour.deadline)}</span></td>
        <td>${p.captain ? `<b>${esc(p.captain)}</b><span class="sub">вице ${esc(p.vice || "—")} · ${num(p.xiPoints)} xPts</span>` : '<span class="sub">нет расчёта</span>'}</td>
        <td>${tr || '<span class="sub">без трансферов</span>'}</td>
        <td>${p.flags ? `<span class="pill warn">${p.flags} проверить</span>` : p.captain ? '<span class="pill ok">ок</span>' : ""}<span class="sub">${p.builtAt ? "расчёт " + ago(p.builtAt) : ""}</span></td>
      </tr>`;
    }).join("");
    const stale = ov.sources.filter((s) => !s.ok);
    app.innerHTML = `${hero}${strip(ov)}
      <section><h2 class="who-head">${ava(PROFILE, "ava lg")}<span>Команды · <span class="who-name">${esc(PROFILE?.name || "")}</span></span></h2>
        <p class="lede">Место и очки — с sports.ru; совет — нормальный сценарий модели: капитан, трансферы и число пунктов, которые стоит перепроверить.</p>
        <div class="table-wrap"><table class="stack"><thead><tr><th>Турнир</th><th class="num">Место</th><th class="num">Очки</th><th>Следующий тур</th><th>Капитан по модели</th><th>Трансферы</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty">У профиля нет команд в наших турнирах.</td></tr>'}</tbody></table></div></section>
      ${stale.length ? `<section><div class="callout">Ошибки при последней выгрузке: ${stale.map((s) => esc(s.name)).join("; ")}. Подробности — на странице <a href="#/data">Данные</a>.</div></section>` : ""}`;
  }

  // ---------- АРЕАЛ: сводка команды ----------
  function arealPage(ov) {
    const A = ov.areal || { rows: [], leaders: {} };
    const leagues = ORDER.filter((s) => A.rows.some((r) => r.leagues[s]));
    const short = Object.fromEntries(ov.tournaments.map((t) => [t.slug, t.short]));
    const pc = (x, d = 1) => (x == null ? "—" : num(x * 100, d));
    const best = Math.max(...A.rows.map((r) => r.rating || 0), 0.0001);
    const lead = A.rows[0];
    const head = leagues.map((s) => `<th class="num lg-col">${esc(short[s])}<span class="sub">лидер ${int(A.leaders[s]?.score)}</span></th>`).join("");
    const rows = A.rows.map((r) => {
      const cells = leagues.map((s) => {
        const l = r.leagues[s];
        if (!l) return `<td class="num lg-col"><span class="sub">—</span></td>`;
        return `<td class="num lg-col"><b>${int(l.score)}</b><span class="sub">${pc(l.norm, 0)}% · ${int(l.place)} м.</span></td>`;
      }).join("");
      const me = r.id === PROFILE?.id;
      return `<tr class="ar-row${me ? " mine" : ""}" data-pid="${esc(r.id)}" tabindex="0" title="Открыть команды: ${esc(r.name)}">
        <td class="num rk">${r.rank}</td>
        <td><div class="who-cell">${ava(r)}<span><b>${esc(r.name)}</b><span class="sub">${Object.keys(r.leagues).length} ${Object.keys(r.leagues).length === 1 ? "лига" : "лиги"}</span></span></div></td>
        <td class="rt"><div class="rt-bar"><i style="width:${((r.rating || 0) / best * 100).toFixed(1)}%"></i></div><b>${pc(r.rating)}</b></td>
        ${cells}
        <td class="num"><b>${int(r.total)}</b><span class="sub">+${int(r.lastTour)} за тур</span></td>
        <td class="num"><span title="Средняя доля обойдённых соперников по всем лигам">${pc(r.byPlace)}</span><span class="sub">${r.rankByPlace}-е место</span></td>
      </tr>`;
    }).join("");
    const leadersLine = leagues.map((s) => `${esc(short[s])} — ${int(A.leaders[s]?.score)} («${esc(A.leaders[s]?.name || "")}», из ${int(A.leaders[s]?.total)})`).join("; ");
    app.innerHTML = `<div class="hero areal-hero">
        <div class="crest-big"><img src="logo.png" alt="AREAL FFC"></div>
        <h1>Рейтинг ${esc(ov.team || "AREAL FFC")}${lead ? `<span class="when">лидирует ${esc(lead.name)} · ${pc(lead.rating)}</span>` : ""}</h1>
        <p class="meta">${A.rows.length} участников · ${leagues.length} лиги${A.snapshotAt ? ` · данные на ${esc(dateTime(A.snapshotAt))} МСК` : ""}<br>Нажмите на строку, чтобы открыть команды участника</p></div>
      <div class="table-wrap"><table class="areal">
        <thead><tr><th class="num">#</th><th>Участник</th><th>Рейтинг</th>${head}<th class="num">Всего ФО</th><th class="num">По месту</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="lede" style="margin-top:12px">Рейтинг — очки команды в каждой лиге, делённые на очки лидера общего зачёта sports.ru, в среднем по лигам, где участник играет. Под очками — этот процент и место. «По месту» — какую долю соперников лиги участник опережает, тоже в среднем по лигам. Лидеры: ${leadersLine}.</p>
      ${strip(ov, true)}`;
    app.querySelectorAll(".ar-row").forEach((tr) => {
      const go = () => { store.set(tr.dataset.pid); location.hash = "#/me"; };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }

  // ---------- турнир ----------
  const man = (p, sc = {}) => `<div class="p-man${p.name === sc.captain ? " c" : ""}${p.pStart != null && p.pStart < 0.6 ? " low" : ""}${p.new ? " new" : ""}" title="${esc(`${p.name} · ${p.pos || ""} · ${p.team} · ${p.price} млн · старт ${pct(p.pStart)}${p.new ? " · новичок" : ""}`)}">
      <div class="shirt">${face(p.id, "ph") || crest(p.team, "ph crest-only") || num(p.xPts?.[0], 0)}${p.name === sc.captain ? '<i class="badge">К</i>' : p.name === sc.vice ? '<i class="badge v">В</i>' : ""}${face(p.id, "ph") ? crest(p.team, "mini") : ""}</div>${p.new ? '<i class="new-tag">новый</i>' : ""}<b>${esc(lastName(p.name))}</b>${num(p.xPts?.[0])}</div>`;
  function pitch(sc, bench = sc.bench) {
    const lines = { ВР: [], ЗЩ: [], ПЗ: [], НП: [] };
    (sc.xi || []).forEach((p) => (lines[p.pos] || (lines[p.pos] = [])).push(p));
    const field = `<div class="pitch${sc.full ? " full" : ""}" aria-label="Схема ${esc(sc.formation || "")}">${["ВР", "ЗЩ", "ПЗ", "НП"].map((k) => `<div class="p-line">${lines[k].map((p) => man(p, sc)).join("")}</div>`).join("")}</div>`;
    return bench?.length ? `<div>${field}<div class="bench-row" aria-label="Скамейка по порядку автозамен">${bench.map((p, i) => `<div class="b-slot"><i class="b-no">${i + 1}</i>${man(p, sc)}</div>`).join("")}</div></div>` : field;
  }
  const bdelta = (t) => { const d = (t.out?.price ?? 0) - (t.in?.price ?? 0); return `${d >= 0 ? "+" : "−"}${num(Math.abs(d))}`; };
  function scenarioDetail(sc) {
    const trs = (sc.transfers || []).map((t) => `<div class="callout" style="border-left-color:var(--pitch)">
        <p class="tr-line">${face(t.out?.id, "face sm out")}<span class="tr-out">${esc(t.out?.name)}</span> → ${face(t.in?.id, "face sm")}${crest(t.in?.team)}<b>${esc(t.in?.name)}</b> <span class="sub">${esc(t.type || "")} · +${num(t.gainTour)} на тур, +${num(t.gainHorizon)} за 3 тура · бюджет ${bdelta(t)} → в банке ${num(t.bankAfter)}</span></p>
        ${(t.whyIn || []).length ? `<ul style="margin:8px 0 0;padding-left:18px">${t.whyIn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${t.whyOut ? `<p class="sub" style="margin-top:6px">Почему продаём: ${esc(t.whyOut)}</p>` : ""}</div>`).join("");
    const plan = (sc.futurePlan || []).map((f) => `<p><b>N+${f.tour}:</b> ${(f.transfers || []).map((t) => `<span class="tr-out">${esc(lastName(t.out?.name))}</span> → ${esc(lastName(t.in?.name))}`).join(", ") || "без трансферов"}</p>`).join("");
    return `<div class="pitch-wrap">${pitch(sc)}<div>
        <h3 style="margin-bottom:8px">${esc(sc.title)} · ${esc(sc.formation)}</h3><p class="lede" style="margin:0 0 14px">${esc(sc.about || "")}</p>
        ${trs || '<p class="sub" style="margin-bottom:14px">Трансферов в этом сценарии нет.</p>'}
        ${plan ? `<h3 style="margin:16px 0 8px">План на следующие туры</h3>${plan}` : ""}
        <h3 style="margin:18px 0 8px">Игроки: основа и скамейка</h3>
        <div class="pl-cards">${(sc.xi || []).concat(sc.bench || []).map((p) => plCard({ ...p, name: p.name + (p.captain ? " (К)" : p.vice ? " (В)" : "") + (p.new ? " · новичок" : "") })).join("")}</div>
        <p class="sub" style="margin-top:10px">Бюджет после трансферов: ${num(sc.budget?.costAfter)} из ${num(sc.budget?.limit, 0)}, в банке ${num(sc.bankAfter)}.</p>
      </div></div>`;
  }
  function tabScenarios(t, state) {
    const r = t.rec;
    if (!r || !r.scenarios) return `<p class="empty">Рекомендаций пока нет — они считаются за сутки и за 3 часа до дедлайна.</p>`;
    const keys = ["safe", "normal", "risky"].filter((k) => r.scenarios[k]);
    const sel = state.sc && r.scenarios[state.sc] ? state.sc : "normal";
    const cols = keys.map((k) => {
      const s = r.scenarios[k];
      const tr = (s.transfers || []).map((x) => `<li><span class="tr-out">${esc(x.out?.name)}</span><span class="tr-in"> → ${esc(x.in?.name)}</span> <span class="sub" style="display:inline">${bdelta(x)}</span></li>`).join("");
      return `<div><h3>${esc(s.title)}</h3>
        <p class="pts">${num(s.xiPoints)} <small>xPts основы с капитаном</small></p>
        <p class="cap">Капитан <b>${esc(s.captain)}</b>, вице ${esc(s.vice)} · ${esc(s.formation)}</p>
        <ul>${tr || '<li class="sub">Без трансферов</li>'}</ul>
        <p class="sub">Итог: состав ${num(s.budget?.costAfter)} из ${num(s.budget?.limit, 0)}, в банке <b>${num(s.bankAfter)}</b></p>
        ${(s.flags || []).length ? `<div class="flags">${s.flags.map((f) => `<p>${esc(f)}</p>`).join("")}</div>` : ""}
        <button class="pick" data-sc="${k}" aria-pressed="${k === sel}">${k === sel ? "Показан на поле" : "Показать на поле"}</button></div>`;
    }).join("");
    return `<p class="lede">Расчёт ${esc(dateTime(r.builtAt))} МСК (${ago(r.builtAt)}). Трансферов в туре: ${r.transfersLeft ?? 3}, банк ${num(r.bank)}.</p>
      <div class="scen">${cols}</div>${scenarioDetail(r.scenarios[sel])}`;
  }
  const noteHtml = (n) => (n ? `<p>${esc(n.text)}</p>${n.pros?.length ? `<p class="up">+ ${n.pros.map(esc).join("; ")}</p>` : ""}${n.cons?.length ? `<p class="down">− ${n.cons.map(esc).join("; ")}</p>` : ""}` : "");
  function tabSquad(t) {
    const list = t.rec?.mySquadNow;
    if (!list) return `<p class="empty">Нет расчёта по текущему составу.</p>`;
    const rank = { ВР: 0, ЗЩ: 1, ПЗ: 2, НП: 3 };
    const all = list.slice().sort((a, b) => rank[a.pos] - rank[b.pos] || (b.xPts?.[0] ?? 0) - (a.xPts?.[0] ?? 0));
    const cards = all.map(plCard).join("");
    return `<p class="lede">Все 15 игроков: на поле — ожидаемые очки на этот тур; ниже — коротко про каждого: какое он место среди всех игроков своей позиции в лиге, кто на позиции сильнейший, что за и что против. Справа в карточке — очки на этот и два следующих тура.</p>
      <div class="pitch-wrap">${pitch({ xi: all, formation: "2-5-5-3", full: true }, [])}<div class="pl-cards">${cards}</div></div>`;
  }
  const plCard = (p) => `<div class="pl-card"><div class="who-cell">${face(p.id) || crest(p.team, "face crest-only")}<span><b>${esc(p.name)}</b><span class="sub">${posb(p.pos)} ${crest(p.team, "crest xs")}${num(p.price)} млн · старт ${pct(p.pStart)}</span></span>
        <span class="pl-x"><b>${num(p.xPts?.[0])}</b><span class="sub">${num(p.xPts?.[1])} · ${num(p.xPts?.[2])}</span></span></div>${noteHtml(p.note)}</div>`;
  function tabIdeal(t) {
    const r = t.rec, idl = r?.ideal;
    if (!idl) return `<p class="empty">Сильнейший состав считается вместе с рекомендациями — пока его нет.</p>`;
    const n = r.scenarios?.normal || {};
    return `<div class="stat-line"><div><span>Сила вашего состава</span><b>${r.strength ? Math.round(r.strength * 100) + "%" : "—"}</b></div>
        <div><span>Ваш план на тур</span><b>${num(n.xiPoints)}</b></div><div><span>Сильнейший возможный</span><b>${num(idl.xiPoints)}</b></div>
        <div><span>Стоимость</span><b>${num(idl.cost)}</b></div></div>
      <p class="lede">Лучший состав на этот тур из всех игроков лиги — только с базовыми правилами: 15 игроков 2/5/5/3, бюджет ${num(idl.budget, 0)}, не больше 3 из клуба. Сила — ожидаемые очки нормального сценария (основа с капитаном) против этого состава.</p>
      <div class="pitch-wrap">${pitch(idl)}<div><h3 style="margin-bottom:8px">${esc(idl.formation)} · капитан ${esc(idl.captain)}, вице ${esc(idl.vice)}</h3>
        <p class="sub">Игроки отбираются только из тех, у кого в туре есть матч и кто регулярно играет (фильтр минут).</p></div></div>
      ${playersSection(t)}`;
  }
  const COMP = [["minutes", "Мин", "минуты на поле"], ["goals", "Голы", "голы"], ["assists", "Асс", "голевые передачи"],
    ["fantasyAssists", "Ф-асс", "фэнтези-ассисты"], ["cleanSheet", "Сух", "сухой матч"], ["conceded", "Пропущ", "пропущенные (−1 за 2)"],
    ["saves", "Сэйвы", "сэйвы"], ["recoveries", "Возвр", "возвраты владения"], ["cards", "Карт", "карточки и пенальти"]];
  function playersSection(t) {
    const P = t.players;
    if (!P?.list?.length) return "";
    return `<section><h2>Все игроки по ожидаемым очкам${P.tour ? " · " + esc(P.tour) : ""}</h2>
      <p class="lede">Все игроки лиги, от большего к меньшему. «#» — место среди всех, «# поз.» — среди игроков своей позиции. Очки — сумма составляющих справа; в спарке — за оба матча. Старт и выход — вероятности на первый матч тура.</p>
      <div class="seg pos-filter" role="group" aria-label="Позиции"><button data-pos="" aria-pressed="false">Все</button>${["ВР", "ЗЩ", "ПЗ", "НП"].map((k) => `<button data-pos="${k}" aria-pressed="false">${posb(k)}</button>`).join("")}</div>
      <div class="table-wrap"><table class="plt"><thead><tr><th class="num">#</th><th class="num"># поз.</th><th>Игрок</th><th class="num">Цена</th><th class="num">xPts</th><th>Соперник</th><th class="num">Старт</th><th class="num">Выход</th><th class="num">~мин</th>
        ${COMP.map(([, l, tip]) => `<th class="num" title="${esc(tip)}">${l}</th>`).join("")}<th class="num">N+1</th><th class="num">N+2</th><th class="num">Влад.</th></tr></thead>
        <tbody id="plt-body"></tbody></table></div></section>`;
  }
  function fillPlayers(t, st) {
    const body = document.getElementById("plt-body");
    if (!body) return;
    const sel = st.pos || new Set();
    document.querySelectorAll(".pos-filter [data-pos]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pos ? sel.has(b.dataset.pos) : !sel.size)));
    const list = t.players.list.filter((p) => !sel.size || sel.has(p.pos));
    body.innerHTML = list.map((p) => {
      const opp = (p.m || []).map((m) => `${crest(m.opp, "crest xs") || esc(m.opp) + " "}${m.h ? "д" : "г"}`).join(" ") + ((p.m || []).length > 1 ? ' <span class="pill">×2</span>' : "") || '<span class="sub">нет матча</span>';
      const flag = p.status === "INJURY" ? ' <span class="pill warn" title="травма">травма</span>' : p.status ? ' <span class="pill warn">не играет</span>' : "";
      return `<tr class="${p.mine ? "mine" : ""}${p.ok ? "" : " dim"}"><td class="num">${p.rank}</td><td class="num">${posb(p.pos)} ${p.posRank}</td>
        <td><div class="who-cell">${face(p.id, "face sm") || crest(p.team, "face sm crest-only")}${crest(p.team, "crest xs")}<span><b>${esc(p.name)}</b>${p.mine ? ' <span class="pill ok">мой</span>' : ""}${flag}</span></div></td>
        <td class="num">${num(p.price)}</td><td class="num"><b>${num(p.x?.[0])}</b>${p.sd != null ? `<span class="sub">± ${num(p.sd)}</span>` : ""}</td>
        <td class="opp">${opp}</td><td class="num">${pct(p.st)}</td><td class="num">${pct(p.app)}</td><td class="num">${int(p.min)}</td>
        ${COMP.map(([k]) => `<td class="num c-cell">${p.c?.[k] ? num(p.c[k]) : '<span class="sub">·</span>'}</td>`).join("")}
        <td class="num">${num(p.x?.[1])}</td><td class="num">${num(p.x?.[2])}</td><td class="num">${num(p.own)}%</td></tr>`;
    }).join("") || '<tr><td colspan="21" class="empty">Нет игроков.</td></tr>';
  }
  function tabFixtures(t, state) {
    const fx = t.fixtures;
    if (!fx || !fx.teams?.length) return `<p class="empty">Календарь сложности ещё не посчитан.</p>`;
    const mode = state.fx || "attack";
    const key = mode === "attack" ? "da" : "dd";
    const sum = (r) => r.tours.reduce((s, tr) => s + tr.m.reduce((a, m) => a + (m[key] || 3), 0) + (tr.m.length ? 0 : 6), 0);
    const teams = fx.teams.slice().sort((a, b) => sum(a) - sum(b));
    const head = (fx.tours || []).map((x) => `<th>${esc(x.name)}<span class="sub">${esc(fmt(x.deadline, { day: "numeric", month: "short" }))}</span></th>`).join("");
    const rows = teams.map((r) => `<tr><td><b class="team-name">${crest(r.team)}${esc(r.team)}</b><span class="sub">${mode === "attack" ? `xG ${num(r.horizon?.xgFor)}` : `сухих ≈ ${num(r.horizon?.csExpected)}`}</span></td>
      ${r.tours.map((tr) => `<td class="cell">${tr.m.length ? tr.m.map((m) => `<span class="c lvl${m[key] || 0}" title="${esc(`${m.opp} (${m.home ? "дома" : "в гостях"}) · голы ${num(m.xf, 2)}:${num(m.xa, 2)} · сухой ${pct(m.cs)} · ${m.src === "odds" ? "по коэффициентам" : "по модели"}`)}">${crest(m.opp, "crest xs")}${esc(m.opp)} ${m.home ? "(д)" : "(г)"}<small>${mode === "attack" ? `xG ${num(m.xf)}` : `сухой ${pct(m.cs)}`}</small></span>`).join("") : `<span class="c lvl0">нет матча</span>`}</td>`).join("")}</tr>`).join("");
    return `<div class="seg" role="group" aria-label="Режим"><button data-fx="attack" aria-pressed="${mode === "attack"}">Для атаки</button><button data-fx="defence" aria-pressed="${mode !== "attack"}">Для обороны</button></div>
      <p class="lede">Сложность соперника от 1 (зелёный, легко) до 5 (красный, тяжело) на 5 туров вперёд; сверху — команды с самым удобным отрезком. Ближайший тур — по коэффициентам букмекеров, дальше — по модели рейтингов.</p>
      <div class="table-wrap"><table class="fdr"><thead><tr><th>Команда</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // «Имя (Клуб, ПЗ, 11.5)» → фото, иконка клуба, имя, позиция, цена; клуб без игрока — иконка и название
  const who = (x) => {
    const m = String(x.player || "").match(/^(.*) \(([^,]+), ([^,]+), ([^)]+)\)$/);
    if (!m) return `${crest(x.player, "face sm crest-only")}<span>${esc(x.player)}</span>`;
    return `${face(x.id, "face sm") || crest(m[2], "face sm crest-only")}${crest(m[2], "crest xs")}<span>${esc(m[1])} ${posb(m[3])} <span class="sub" style="display:inline">${esc(m[4])}</span></span>`;
  };
  const bars = (list, f, cls = "") => `<div class="bars">${list.map((x) => `<div class="bar"><span class="who-cell">${who(x)}</span><span class="fill"><i class="${cls}" style="width:${Math.min(100, x[f] || 0)}%"></i></span><span class="num">${num(x[f], 0)}%</span></div>`).join("")}</div>`;
  function tabTop(t) {
    const tp = t.top;
    if (!tp || !tp.last) return `<p class="empty">Данных топ-100 пока нет.</p>`;
    const l = tp.last;
    const showMine = t.mainProfile; // сравнение «мои очки» в сводке топа считается только для основного профиля
    const forms = Object.entries(l.formations || {}).slice(0, 5).map(([k, v]) => ({ player: k, pct: v }));
    const tripled = Object.entries(l.clubs?.tripledClubs || {}).slice(0, 6).map(([k, v]) => ({ player: k, pct: (v / (l.squadsWithData || tp.topN || 100)) * 100 }));
    const hist = (tp.tours || []).map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${num(x.tourScore?.mean)}</td><td class="num">${num(x.tourScore?.max, 0)}</td><td class="num">${!showMine || x.mySquad == null ? "—" : `<b class="${x.mySquad >= (x.tourScore?.mean || 0) ? "up" : "down"}">${int(x.mySquad)}</b>`}</td></tr>`).join("");
    const missing = showMine ? l.mySquad?.topTemplateMissing || [] : [];
    return `<p class="lede">${esc(l.name)}: ${int(l.squadsWithData)} команд из топ-${int(tp.topN)} общего зачёта. Обновлено ${esc(dateTime(tp.generatedAt))} МСК.</p>
      <div class="stat-line"><div><span>Среднее в топе</span><b>${num(l.tourScore?.mean)}</b></div><div><span>Медиана</span><b>${num(l.tourScore?.median)}</b></div>
        <div><span>Лучший</span><b>${int(l.tourScore?.max)}</b></div>${showMine ? `<div><span>Мои очки</span><b class="${(l.mySquad?.score ?? 0) >= (l.tourScore?.mean ?? 0) ? "up" : "down"}">${int(l.mySquad?.score)}</b></div>` : ""}
        <div><span>Трансферов в среднем</span><b>${num(l.transfers?.perSquadMean)}</b></div></div>
      ${missing.length ? `<div class="callout">Популярные в топе, но нет у меня: ${missing.map(esc).join(", ")}.</div>` : ""}
      <div class="split"><section style="margin-top:0"><h2>Владение</h2>${bars((l.ownership || []).slice(0, 15), "pct")}</section>
        <section style="margin-top:0"><h2>Капитаны</h2>${bars((l.captains || []).slice(0, 8), "pct", "c")}
          <h2 style="margin-top:28px">Покупали чаще всего</h2>${bars((l.transfers?.mostBought || []).slice(0, 8), "pct")}</section></div>
      <div class="split"><section><h2>Схемы</h2>${bars(forms, "pct")}</section><section><h2>Три игрока одного клуба</h2>${bars(tripled, "pct")}</section></div>
      <section><h2>По турам</h2><div class="table-wrap"><table><thead><tr><th>Тур</th><th class="num">Среднее топ-100</th><th class="num">Максимум</th><th class="num">${showMine ? "Мои очки" : ""}</th></tr></thead><tbody>${hist}</tbody></table></div></section>`;
  }
  function tabInjuries(t) {
    const inj = t.injuries;
    if (!inj || !inj.teams?.length) return `<p class="empty">Выбывших нет или данные ещё не собраны.</p>`;
    const RU = { injury: "травма", suspension: "дисквалификация", red_card: "дисквалификация" };
    return `<p class="lede">Травмы и дисквалификации по данным FotMob, обновлено ${esc(dateTime(inj.fetchedAt))} МСК (${ago(inj.fetchedAt)}). Жёлтым — дисквалификации.</p>
      <div class="inj">${inj.teams.map((tm) => `<div><h3>${crest(tm.team)}${esc(tm.team)}</h3><ul>${tm.players.map((p) => `<li><span class="dot${p.type !== "injury" ? " s" : ""}"></span><span>${esc(p.name)}<span class="sub">${esc(p.reason || RU[p.type] || p.type || "")}${p.expectedReturn ? " · вернётся: " + esc(p.expectedReturn) : ""}</span></span></li>`).join("")}</ul></div>`).join("")}</div>`;
  }
  function tabReport(t) {
    if (!t.report) return `<p class="empty">Отчёта пока нет.</p>`;
    const html = window.marked ? window.marked.parse(t.report) : `<pre style="white-space:pre-wrap">${esc(t.report)}</pre>`;
    return `<article class="report">${html}</article>`;
  }
  const state = {};
  async function tournamentPage(route) {
    const sh = await get(`t/${route.slug}`);
    let pers = null;
    if (PROFILE?.tournaments[route.slug]) {
      try { pers = await get(`p/${PROFILE.id}/${route.slug}`); } catch (e) { pers = null; }
    }
    const t = { ...sh, ...(pers || {}), photos: { ...(sh.photos || {}), ...(pers?.photos || {}) }, mainProfile: !!PROFILE?.main, hasSquad: !!pers };
    CUR = t;
    const st = (state[route.slug] = state[route.slug] || {});
    const s = t.squad || {};
    const personalTab = ["scenarios", "squad", "ideal", "report"].includes(route.tab);
    const body = personalTab && !t.hasSquad ? `<p class="empty">У профиля «${esc(PROFILE?.name || "")}» нет команды в этом турнире.</p>` : { scenarios: tabScenarios, squad: tabSquad, ideal: tabIdeal, fixtures: tabFixtures, top: tabTop, injuries: tabInjuries, report: tabReport }[route.tab](t, st);
    app.innerHTML = `<div class="t-head"><h1>${esc(t.name)}</h1><div class="t-facts">
        <div><span>Место</span><b>${int(s.place)} ${placeDiff(s.placeDiff)}</b></div><div><span>Очки</span><b>${int(s.score)}</b></div>
        <div><span>${esc(t.nextTour?.name || "Тур")}</span><b>${t.nextTour?.deadline ? cd(t.nextTour.deadline) : "—"}</b></div></div></div>
      <nav class="tabs" aria-label="Разделы турнира">${TABS.map(([k, l]) => `<a href="#/t/${route.slug}/${k}"${k === route.tab ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <div id="tab">${body}</div>`;
    app.querySelectorAll("[data-sc]").forEach((b) => b.addEventListener("click", () => { st.sc = b.dataset.sc; tournamentPage(route); }));
    app.querySelectorAll("[data-fx]").forEach((b) => b.addEventListener("click", () => { st.fx = b.dataset.fx; tournamentPage(route); }));
    if (route.tab === "ideal" && t.players?.list?.length) {
      st.pos = st.pos || new Set();
      fillPlayers(t, st);
      app.querySelectorAll(".pos-filter [data-pos]").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.pos;
        if (!k) st.pos.clear(); else if (st.pos.has(k)) st.pos.delete(k); else st.pos.add(k);
        fillPlayers(t, st);
      }));
    }
  }

  // ---------- данные ----------
  function dataPage(ov) {
    const groups = [...new Set(ov.sources.map((s) => s.group))];
    const src = groups.map((g) => `<tr><th colspan="3" style="position:static;color:var(--ink);font-weight:600">${esc(g)}</th></tr>` + ov.sources.filter((s) => s.group === g).map((s) => {
      const stale = !s.at || Date.now() - new Date(s.at) > 48 * 36e5;
      const cls = !s.ok ? "" : stale ? "stale" : "ok";
      return `<tr><td><span class="dot ${cls}"></span> ${esc(s.name)}${s.note ? `<span class="sub">${esc(s.note)}</span>` : ""}</td><td class="num">${esc(ago(s.at))}</td><td class="num">${esc(s.at ? dateTime(s.at) : "—")}</td></tr>`;
    }).join("")).join("");
    const short = Object.fromEntries(ov.tournaments.map((t) => [t.slug, t.short]));
    const evs = ov.schedule.events.map((e) => {
      const past = new Date(e.at) < Date.now();
      const status = e.kind === "deadline" ? (past ? "закрыт" : cd(e.at)) : e.done ? '<span class="pill ok">выполнено</span>' : past ? '<span class="pill">не запускалось</span>' : '<span class="pill warn">запланировано</span>';
      return `<div class="ev${past ? " past" : ""}"><span>${esc(dateTime(e.at))}</span><span class="k">${esc(short[e.t] || e.t)}</span><span class="t">${esc(e.label)} · ${esc(e.tour)}</span><span>${status}</span></div>`;
    }).join("");
    app.innerHTML = `<div class="t-head"><h1>Данные</h1><div class="t-facts"><div><span>Последние данные</span><b>${esc(ago(ov.builtAt))}</b></div><div><span>Календарь sports.ru</span><b>${esc(ago(ov.schedule.calendarAt))}</b></div></div></div>
      <p class="lede">Зелёный — свежие данные, жёлтый — старше двух суток (для статистики это нормально между турами), красный — ошибка последней выгрузки.</p>
      <div class="table-wrap"><table><thead><tr><th>Источник</th><th class="num">Обновлено</th><th class="num">Когда, МСК</th></tr></thead><tbody>${src}</tbody></table></div>
      <section><h2>Расписание обновлений</h2>
        <p class="lede">Планировщик проверяет календарь каждый час: за сутки и за 3 часа до дедлайна — коэффициенты, составы, травмы и пересчёт рекомендаций; через час после дедлайна — составы топ-100; утром после тура — статистика матчей; после заморозки очков — итоговые очки топ-100.</p>
        <div class="ev-list">${evs || '<p class="empty">Событий в ближайшие дни нет.</p>'}</div></section>`;
  }

  // ---------- правила и методика ----------
  async function rulesPage(route) {
    const g = await get("guide");
    const md = g[route.tab] || "";
    const html = window.marked ? window.marked.parse(md) : `<pre style="white-space:pre-wrap">${esc(md)}</pre>`;
    app.innerHTML = `<div class="t-head"><h1>Правила</h1></div>
      <nav class="tabs" aria-label="Разделы"><a href="#/rules"${route.tab === "rules" ? ' aria-current="page"' : ""}>Правила игры</a><a href="#/rules/method"${route.tab === "method" ? ' aria-current="page"' : ""}>Как считает модель</a></nav>
      <article class="report guide">${html}</article>`;
  }

  // ---------- роутер ----------
  async function render() {
    const route = parse();
    try {
      const ov = await get("overview");
      pickProfile(ov);
      renderNav(ov, route);
      foot.innerHTML = `Последнее обновление данных ${esc(dateTime(ov.builtAt))} МСК · время везде московское`;
      if (route.page === "t") await tournamentPage(route);
      else if (route.page === "data") dataPage(ov);
      else if (route.page === "rules") await rulesPage(route);
      else if (route.page === "areal") arealPage(ov);
      else await home(ov);
      document.title = `${route.page === "t" ? (ov.tournaments.find((x) => x.slug === route.slug)?.name + " — ") : route.page === "data" ? "Данные — " : route.page === "rules" ? "Правила — " : route.page === "home" ? "Мои команды — " : ""}${ov.team || "AREAL FFC"}`;
    } catch (e) {
      app.innerHTML = `<div class="callout">Не удалось загрузить данные: ${esc(e.message)}. Обновите страницу через минуту — сайт мог как раз пересобираться.</div>`;
    }
  }
  let lastPage = "";
  window.addEventListener("hashchange", () => {
    const p = parse(); const key = p.page + (p.slug || "");
    render().then(() => { if (key !== lastPage) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); } lastPage = key; });
  });
  setInterval(() => document.querySelectorAll("[data-cd]").forEach((el) => {
    el.textContent = left(el.dataset.cd);
    const ms = new Date(el.dataset.cd) - Date.now();
    el.classList.toggle("soon", ms > 0 && ms < 864e5);
  }), 30000);
  render();
})();
