'use strict';
(() => {
  const SITE = 'https://peterxing.com/';
  const GUIDE = 'https://peterxing.com';
  const PAGES = 'https://peterxing.github.io/singularity-daily/';
  const host = location.hostname;
  const onPeterxing = /(^|\.)peterxing\.com$/.test(host) || /post-agi-planning/.test(host);
  const sameAsPages = host.endsWith('github.io') || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
  const MEDIA = sameAsPages ? '' : PAGES; // video and images come straight from GitHub Pages
  const GUIDE_ROOT = onPeterxing ? '' : GUIDE;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const REL = {
    supports: { label: 'Supports', icon: '▲' },
    early: { label: 'Early sign', icon: '◆' },
    challenges: { label: 'Challenges', icon: '▼' },
  };
  const SYNC_MS = 10 * 60 * 1000;

  const state = {
    index: null, preds: null, tracker: null, byId: new Map(), byKey: new Map(), episodes: new Map(),
    current: null, lastSync: 0, filters: { q: '', domain: 'all', rel: 'all', sort: 'latest', quiet: false },
  };

  const $ = id => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  const pad3 = n => String(n).padStart(3, '0');
  const utc = iso => new Date(`${iso}T00:00:00Z`);
  const fmt = (iso, opts) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...opts }).format(utc(iso));
  const short = iso => fmt(iso, { day: 'numeric', month: 'short' });
  const longDay = iso => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDay = iso => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '')}…` : s);
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  // ------------------------------------------------------------------ forecasts
  function setPreds(preds) {
    state.preds = preds;
    state.byId = new Map(preds.items.map(p => [p.id, p]));
    state.byKey = new Map(preds.items.map(p => [p.key, p]));
  }
  const resolve = link => state.byKey.get(link.key) || state.byId.get(link.id);
  const when = p => (p.kind === 'horizon' ? 'Undated' : p.m ? `${MONTHS[p.m - 1]} ${p.year}` : String(p.year));
  const odds = p => (p.kind === 'horizon' ? `${p.cond}% conditional` : `${p.prob}%`);
  const domainName = d => (state.preds.domains && state.preds.domains[d]) || d;
  const guideHref = p => `${GUIDE_ROOT}/guide${p.guide}`;
  const relPill = (rel, extra) => h('span', { class: `rel ${rel}` }, h('span', { 'aria-hidden': 'true' }, REL[rel].icon), extra != null ? extra : REL[rel].label);

  // ------------------------------------------------------------------ episode
  async function showEpisode(date) {
    const list = state.index.episodes;
    const entry = list.find(e => e.date === date) || list[0];
    let ep = state.episodes.get(entry.date);
    if (!ep) {
      ep = await getJSON(`daily/data/episodes/${entry.date}.json`);
      state.episodes.set(entry.date, ep);
    }
    state.current = { date: entry.date, entry, ep };
    renderHero(entry, ep);
    renderStories(ep);
    renderTranscript(ep);
    document.querySelectorAll('.epcard').forEach(a => a.setAttribute('aria-current', String(a.dataset.date === entry.date)));
    document.title = `${entry.hook ? `${entry.hook} · ` : ''}EP.${pad3(entry.ep)} · The Singularity Daily`;
  }

  function tldrFrom(ep) {
    const bullets = (ep.post.text || '').split('\n').map(s => s.trim()).filter(s => /^[-•]\s+/.test(s)).map(s => s.replace(/^[-•]\s+/, ''));
    return bullets.length ? bullets : ep.stories.slice(0, 4).map(s => s.title);
  }

  function touched(ep) {
    const seen = new Map();
    const rank = { supports: 0, early: 1, challenges: 2 };
    for (const s of ep.stories) {
      for (const l of s.predictions || []) {
        const p = resolve(l);
        if (!p) continue;
        const prev = seen.get(p.id);
        if (!prev || rank[l.relation] < rank[prev.rel]) seen.set(p.id, { p, rel: l.relation });
      }
    }
    return [...seen.values()].sort((a, b) => rank[a.rel] - rank[b.rel]);
  }

  function renderHero(entry, ep) {
    const latest = entry.date === state.index.latest;
    $('epKicker').textContent = `EP.${pad3(entry.ep)} · ${longDay(entry.date)}${latest ? ' · Latest' : ''}`;
    $('epHook').textContent = entry.hook || 'The Singularity Daily';
    $('epTldr').replaceChildren(...tldrFrom(ep).map(t => h('li', { text: t })));
    const t = touched(ep);
    const stats = [`${ep.stories.length} stories`, `${t.length} forecast${t.length === 1 ? '' : 's'} touched`];
    if (ep.scanned) stats.push(`${Number(ep.scanned).toLocaleString('en-AU')} headlines scanned`);
    if (entry.video) stats.push(`${Math.round((entry.video.seconds || 180) / 60)} min`);
    $('epStats').textContent = stats.join(' · ');
    const touch = $('epTouch');
    if (t.length) {
      touch.hidden = false;
      touch.replaceChildren(h('span', { class: 'label', text: 'Moves' }),
        ...t.slice(0, 3).map(({ p, rel }) => h('a', { class: 'chip', href: `#/forecasts/${p.id}`, title: `${REL[rel].label}: ${p.t}` },
          relPill(rel, ''), h('span', { class: 't', text: `${when(p)}: ${p.t}` }))),
        t.length > 3 ? h('a', { class: 'chip', href: '#/stories' }, h('span', { class: 't', text: `+${t.length - 3} more in the stories` })) : null);
    } else touch.hidden = true;
    $('epWindow').textContent = ep.window || '';
    setupVideo(entry, ep);
  }

  function setupVideo(entry, ep) {
    const v = $('video'), note = $('playerNote'), player = $('player'), dl = $('btnDownload'), play = $('btnPlay');
    v.pause();
    v.removeAttribute('src');
    v.replaceChildren();
    player.querySelectorAll('.poster-img').forEach(n => n.remove());
    note.hidden = true;
    const vid = entry.video;
    const cover = entry.cover ? MEDIA + entry.cover : '';
    if (!vid) {
      player.classList.add('no-video');
      if (cover) player.prepend(h('img', { class: 'poster-img', src: cover, alt: '' }));
      note.hidden = false;
      note.replaceChildren(h('p', { text: 'This early episode\u2019s video isn\u2019t archived. Its stories, sources and forecast links are below.' }),
        h('a', { class: 'btn', href: '#/stories', text: 'Read the stories' }));
      dl.hidden = true;
      play.disabled = true;
      v.removeAttribute('poster');
      v.load();
      return;
    }
    player.classList.remove('no-video');
    play.disabled = false;
    if (cover) v.poster = cover; else v.removeAttribute('poster');
    const src = h('source', { src: vid.pages ? MEDIA + vid.file : vid.release, type: 'video/mp4' });
    src.addEventListener('error', () => {
      note.hidden = false;
      note.replaceChildren(h('p', { text: vid.pages ? 'The video couldn\u2019t load. Try again, or download it.' : 'This archived episode streams from GitHub, which some browsers (like Safari on iPhone) can\u2019t play inline.' }),
        h('a', { class: 'btn btn-primary', href: vid.release, text: `Download the episode (${vid.mb} MB)` }));
    });
    v.append(src);
    if (ep.captions) v.append(h('track', { kind: 'captions', srclang: 'en', label: 'English', src: `daily/media/${entry.date}/captions.vtt` }));
    v.load();
    dl.hidden = false;
    dl.href = vid.release;
    dl.textContent = `Download · ${vid.mb} MB`;
  }

  function renderTranscript(ep) {
    const list = $('transcriptList');
    const v = $('video');
    list.replaceChildren(...(ep.transcript || []).map(c => h('li', null,
      h('button', { type: 'button', 'aria-label': `Play from ${mmss(c.s)}`, onclick: () => { v.currentTime = c.s; v.play().catch(() => {}); }, text: mmss(c.s) }),
      h('span', { text: c.t }))));
    $('btnTranscript').disabled = !(ep.transcript || []).length;
    if (!(ep.transcript || []).length) toggleTranscript(false);
  }
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function toggleTranscript(force) {
    const open = typeof force === 'boolean' ? force : $('transcript').hidden;
    $('transcript').hidden = !open;
    $('btnTranscript').setAttribute('aria-expanded', String(open));
  }

  // ------------------------------------------------------------------ stories
  function renderStories(ep) {
    const host = $('storyList');
    const groups = new Map();
    for (const c of ep.chapters || []) groups.set(c, []);
    for (const s of ep.stories) {
      const key = s.chapter && groups.has(s.chapter) ? s.chapter : '__more';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const out = [];
    let n = 0;
    for (const [chapter, stories] of groups) {
      if (!stories.length) continue;
      n += 1;
      out.push(h('div', { class: 'chapter' }, h('span', { class: 'n', text: String(n).padStart(2, '0') }), h('h3', { text: chapter === '__more' ? 'Also' : chapter })));
      out.push(h('div', { class: 'cards' }, stories.map(storyCard)));
    }
    host.replaceChildren(...out);
    $('storiesSub').textContent = `${ep.stories.length} stories from EP.${pad3(ep.ep)}, each with its source and the forecasts it touches.`;
    const more = $('more');
    more.hidden = !(ep.ticker || []).length;
    $('ticker').replaceChildren(...(ep.ticker || []).map(t => h('li', { text: t })));
    $('epNotes').replaceChildren(...(ep.notes || []).map(t => h('li', { text: t })));
  }

  function storyCard(s) {
    const top = h('div', { class: 'card-top' });
    if (s.badge) top.append(h('span', { class: `badge ${s.badge === 'REPORTED' ? 'reported' : 'week'}`, text: s.badge === 'REPORTED' ? 'Reported' : 'This week' }));
    if (s.date) top.append(h('span', { class: 'card-date', text: short(s.date) }));
    const sources = h('div', { class: 'sources' }, (s.sources || []).map(src => src.url
      ? h('a', { href: src.url, target: '_blank', rel: 'noopener', text: `${src.outlet} ↗` })
      : h('span', { text: src.outlet })));
    const links = (s.predictions || []).map(l => ({ l, p: resolve(l) })).filter(x => x.p);
    return h('article', { class: 'card', id: `s-${s.id}` },
      top,
      h('h4', { text: s.title }),
      s.summary ? h('p', { text: s.summary }) : null,
      sources,
      links.length ? h('div', { class: 'links' }, links.map(({ l, p }) => h('a', { class: 'link', href: `#/forecasts/${p.id}` },
        relPill(l.relation),
        h('span', { class: 'f' }, clip(p.t, 140), h('small', { text: `${when(p)} · ${odds(p)} · ${domainName(p.d)}` })),
        h('span', { class: 'why', text: l.note })))) : null);
  }

  // ------------------------------------------------------------------ predictions vs reality
  function trackerFor(id) { return state.tracker.forecasts[id]; }
  function totals() {
    const t = { supports: 0, early: 0, challenges: 0, withNews: 0 };
    for (const p of state.preds.items) {
      const r = trackerFor(p.id);
      if (!r) continue;
      t.withNews += 1;
      for (const k of Object.keys(REL)) t[k] += r[k] || 0;
    }
    return t;
  }

  function renderScoreboard() {
    const t = totals();
    const n = state.preds.items.length;
    const story = k => (k === 1 ? 'story' : 'stories');
    const tiles = [
      h('div', { class: 'tile hot' }, h('b', { text: `${t.withNews}/${n}` }), h('span', { text: 'forecasts with news in the show' })),
      h('div', { class: 'tile' }, h('b', { text: String(t.supports) }), h('span', { text: `${story(t.supports)} supporting a forecast` })),
      h('div', { class: 'tile' }, h('b', { text: String(t.early) }), h('span', { text: t.early === 1 ? 'early sign' : 'early signs' })),
      h('div', { class: 'tile' }, h('b', { text: String(t.challenges) }), h('span', { text: `${story(t.challenges)} cutting against one` })),
    ];
    const doms = Object.keys(state.preds.domains || {}).map(d => {
      const all = state.preds.items.filter(p => p.d === d);
      const hit = all.filter(p => trackerFor(p.id)).length;
      const fill = h('i');
      fill.style.width = `${all.length ? Math.round((hit / all.length) * 100) : 0}%`; // CSSOM, allowed by the page's CSP
      return h('button', { type: 'button', class: 'dom', 'aria-pressed': String(state.filters.domain === d), onclick: () => setDomain(state.filters.domain === d ? 'all' : d) },
        h('span', { class: 'name', text: domainName(d) }),
        h('span', { class: 'bar' }, fill),
        h('span', { class: 'num', text: `${hit} of ${all.length} with news` }));
    });
    $('scoreboard').replaceChildren(...tiles, h('div', { class: 'domains' }, doms));
    const eps = state.index.episodes.length;
    $('forecastIntro').textContent = `The Guide makes ${state.preds.items.filter(p => p.kind === 'dated').length} dated forecasts from 2026 to 2040, plus ${state.preds.items.filter(p => p.kind === 'horizon').length} undated ones beyond superintelligence. Every day, each story in the show is checked against them: does the news support a forecast, show an early sign of it, or cut against it? This is the running tally across ${eps} episode${eps === 1 ? '' : 's'}.`;
  }

  function renderMoving() {
    const latest = state.index.latest;
    const scored = [];
    for (const p of state.preds.items) {
      const r = trackerFor(p.id);
      if (!r) continue;
      const recent = r.items.filter(i => daysBetween(i.on, latest) < 14);
      if (!recent.length) continue;
      scored.push({ p, r, recent, score: recent.length });
    }
    scored.sort((a, b) => b.score - a.score || (b.r.last > a.r.last ? 1 : -1));
    const top = scored.slice(0, 4);
    if (!top.length) { $('moving').replaceChildren(); return; }
    $('moving').replaceChildren(h('h3', { text: 'Moving now · last 14 days' }), ...top.map(({ p, r, recent }) => h('a', { class: 'mover', href: `#/forecasts/${p.id}` },
      h('span', { class: 'when', text: `${when(p)} · ${odds(p)} · ${domainName(p.d)}` }),
      h('span', { class: 't', text: p.t }),
      h('span', { class: 'latest', text: `Latest: ${recent[0].title} (EP.${pad3(recent[0].ep)})` }),
      h('span', { class: 'tally' }, tallyPills(r)))));
  }

  function tallyPills(r) {
    return Object.keys(REL).filter(k => r[k]).map(k => h('span', { class: `rel ${k}`, title: `${r[k]} ${REL[k].label.toLowerCase()}` }, h('span', { 'aria-hidden': 'true' }, REL[k].icon), String(r[k])));
  }

  function strip(r) {
    const eps = [...state.index.episodes].reverse().slice(-21);
    return h('span', { class: 'strip', 'aria-hidden': 'true' }, eps.map(e => {
      const rels = new Set((r ? r.items : []).filter(i => i.on === e.date).map(i => i.relation));
      const cls = rels.size > 1 ? 'mixed' : rels.size ? [...rels][0] : '';
      return h('i', { class: cls, title: `EP.${pad3(e.ep)} ${short(e.date)}` });
    }));
  }

  function buildFilters() {
    const sel = $('fd');
    for (const [d, name] of Object.entries(state.preds.domains || {})) sel.append(h('option', { value: d, text: name }));
    const f = state.filters;
    $('fq').addEventListener('input', e => { f.q = e.target.value.trim().toLowerCase(); renderForecasts(); });
    sel.addEventListener('change', e => setDomain(e.target.value));
    $('fr').addEventListener('change', e => { f.rel = e.target.value; renderForecasts(); });
    $('fs').addEventListener('change', e => { f.sort = e.target.value; renderForecasts(); });
    $('fquiet').addEventListener('change', e => { f.quiet = e.target.checked; renderForecasts(); });
  }
  function setDomain(d) {
    state.filters.domain = d;
    $('fd').value = d;
    renderScoreboard();
    renderForecasts();
  }

  function forecastRows() {
    const f = state.filters;
    const rows = state.preds.items.map(p => ({ p, r: trackerFor(p.id) }));
    const words = f.q ? f.q.split(/\s+/) : [];
    const keep = rows.filter(({ p, r }) => {
      if (f.domain !== 'all' && p.d !== f.domain) return false;
      if (f.rel !== 'all' && !(r && r[f.rel])) return false;
      if (!r && !f.quiet && !words.length) return false;
      if (words.length) {
        const hay = `${p.t} ${domainName(p.d)} ${when(p)} ${r ? r.items.map(i => i.title).join(' ') : ''}`.toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
    const total = r => (r ? r.supports + r.early + r.challenges : 0);
    const ord = p => (p.kind === 'horizon' ? 9999 * 12 : p.year * 12 + (p.m || 6));
    keep.sort((a, b) => {
      if (f.sort === 'when') return ord(a.p) - ord(b.p);
      if (f.sort === 'most') return total(b.r) - total(a.r) || ord(a.p) - ord(b.p);
      return ((b.r && b.r.last) || '').localeCompare((a.r && a.r.last) || '') || total(b.r) - total(a.r) || ord(a.p) - ord(b.p);
    });
    return keep;
  }

  function renderForecasts() {
    const rows = forecastRows();
    const withNews = rows.filter(x => x.r).length;
    $('forecastCount').textContent = `Showing ${rows.length} of ${state.preds.items.length} forecasts · ${withNews} with news${state.filters.quiet ? '' : ' (tick the box to see the quiet ones)'}`;
    $('forecastList').replaceChildren(...rows.map(({ p, r }) => forecastRow(p, r)));
    if (!rows.length) $('forecastList').append(h('li', { class: 'empty', text: 'No forecasts match. Try another search or filter.' }));
  }

  function forecastRow(p, r) {
    const det = h('details', { class: `fc${r ? '' : ' quiet'}`, id: `f-${p.id}` });
    const sum = h('summary', null,
      h('span', { class: 'meta' }, h('span', { class: 'yr', text: when(p).toUpperCase() }), h('span', { class: 'pr', text: odds(p) })),
      h('span', { class: 'tx' }, p.t, h('small', { text: domainName(p.d) })),
      h('span', { class: 'sig' }, r ? h('span', { class: 'tally' }, tallyPills(r)) : h('span', { class: 'pr mono', text: 'No news yet' }), strip(r)));
    det.append(sum);
    det.addEventListener('toggle', () => {
      if (det.open && !det.dataset.filled) {
        det.dataset.filled = '1';
        det.append(r ? trail(r) : h('p', { class: 'empty', text: 'No story in the show has been linked to this forecast yet.' }),
          h('div', { class: 'fc-foot' },
            h('a', { href: guideHref(p), target: onPeterxing ? null : '_blank', rel: 'noopener', text: 'Read it in the Guide ↗' }),
            h('a', { href: `#/forecasts/${p.id}`, text: 'Link to this forecast' })));
      }
    });
    return h('li', null, det);
  }

  function trail(r) {
    return h('ol', { class: 'trail' }, r.items.map(i => h('li', null,
      h('div', { class: 'd' }, `${short(i.on)} · EP.${pad3(i.ep)}`, h('br'), relPill(i.relation)),
      h('div', null,
        h('div', { class: 'h' }, h('a', { href: `#/ep/${i.on}/${i.story}`, text: i.title })),
        h('div', { class: 'w', text: i.note + (i.revised ? ' (The forecast\u2019s wording has been revised since.)' : '') }),
        h('div', { class: 'o' }, i.url ? h('a', { href: i.url, target: '_blank', rel: 'noopener', text: `${i.outlet || 'Source'} ↗` }) : (i.outlet || ''), i.date ? ` · ${short(i.date)}` : '')))));
  }

  function openForecast(id) {
    let el = $(`f-${id}`);
    if (!el) {
      Object.assign(state.filters, { q: '', domain: 'all', rel: 'all', quiet: true });
      $('fq').value = ''; $('fd').value = 'all'; $('fr').value = 'all'; $('fquiet').checked = true;
      renderScoreboard();
      renderForecasts();
      el = $(`f-${id}`);
    }
    if (!el) return null;
    el.open = true;
    flash(el);
    return el;
  }
  function flash(el) {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2400);
  }

  // ------------------------------------------------------------------ episodes + promo
  function renderEpisodes() {
    $('episodeGrid').replaceChildren(...state.index.episodes.map(e => h('li', null,
      h('a', { class: 'epcard', href: `#/ep/${e.date}`, 'data-date': e.date, 'aria-current': String(state.current ? state.current.date === e.date : e.date === state.index.latest) },
        h('div', { class: 'th' }, e.thumb ? h('img', { src: MEDIA + e.thumb, alt: '', loading: 'lazy', width: '480', height: '270' }) : null,
          h('span', { class: `tag${e.video ? ' play' : ''}`, text: e.video ? `▶ ${Math.round((e.video.seconds || 180) / 60)} min` : 'Stories only' })),
        h('div', { class: 'bd' },
          h('span', { class: 'k', text: `EP.${pad3(e.ep)} · ${shortDay(e.date)}` }),
          h('span', { class: 'hk', text: e.hook || 'The Singularity Daily' }),
          h('span', { class: 's', text: `${e.stories} stories · ${e.forecasts} forecasts touched` }))))));
  }

  function renderPromo() {
    const p = state.index.promo, box = $('promo');
    if (!p || !p.start || new Date(p.start) < new Date()) { box.hidden = true; return; }
    const d = new Date(p.start);
    const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    const time = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(d).replace(':00', '').replace(' ', '');
    box.replaceChildren(h('a', { href: p.url, target: '_blank', rel: 'noopener' },
      h('span', { class: 'mono', text: `Live in ${p.city || 'Sydney'}` }),
      h('strong', { text: p.name }), ` · ${day}, ${time} · ${[p.venue, p.suburb].filter(Boolean).join(', ')} · ${p.talk || ''}${p.price ? ` · ${p.price} tickets` : ''} ↗`));
    box.hidden = false;
  }

  // ------------------------------------------------------------------ routing
  let firstRoute = true;
  async function route() {
    const hash = location.hash;
    if (hash && hash !== '#' && !hash.startsWith('#/')) return;
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    let date = state.current ? state.current.date : state.index.latest;
    let target = null, nav = parts[0] || '';
    if (parts[0] === 'ep' && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '')) {
      date = parts[1];
      target = parts[2] ? (parts[2] === 'stories' ? 'stories' : `s-${parts[2]}`) : 'today';
      nav = '';
    } else if (['stories', 'forecasts', 'episodes', 'about'].includes(parts[0])) {
      target = parts[0];
    } else {
      date = state.index.latest;
      target = firstRoute ? null : 'top';
    }
    if (!state.current || state.current.date !== date) {
      try { await showEpisode(date); } catch (e) { toast(`Couldn\u2019t load that episode (${e.message}).`); }
    }
    let el = null;
    if (parts[0] === 'forecasts' && parts[1]) el = openForecast(parts[1]);
    else if (target === 'top') { window.scrollTo({ top: 0 }); }
    else if (target && target.startsWith('s-')) { el = $(target); if (el) flash(el); }
    else if (target === 'today' && !firstRoute) el = $('today');
    else if (target && target !== 'today') el = $(target);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    document.querySelectorAll('.nav a[href^="#/"]').forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === `#/${nav}`)));
    firstRoute = false;
  }

  // ------------------------------------------------------------------ sync: new episodes land every morning
  async function sync(manual) {
    state.lastSync = Date.now();
    try {
      const index = await getJSON('daily/data/index.json');
      if (index.latest === state.index.latest && index.updated === state.index.updated) return;
      const [preds, tracker] = await Promise.all([getJSON('daily/data/predictions.json'), getJSON('daily/data/tracker.json')]);
      const fresh = index.latest !== state.index.latest;
      state.index = index; setPreds(preds); state.tracker = tracker;
      state.episodes.clear();
      renderPromo(); renderEpisodes(); renderScoreboard(); renderMoving(); renderForecasts(); footer();
      if (fresh) {
        const e = index.episodes[0];
        toast(`New episode: EP.${pad3(e.ep)} · ${e.hook}`, { label: 'Watch', href: `#/ep/${e.date}` });
      } else if (state.current) {
        await showEpisode(state.current.date);
      }
    } catch (e) {
      if (manual) toast('Couldn\u2019t check for a new episode.');
    }
  }
  function startSync() {
    setInterval(() => { if (document.visibilityState === 'visible') sync(); }, SYNC_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - state.lastSync > SYNC_MS) sync();
    });
  }

  // ------------------------------------------------------------------ chrome
  let toastTimer = 0;
  function toast(text, action) {
    const t = $('toast');
    t.replaceChildren(h('span', { text }),
      action ? h('a', { class: 'btn', href: action.href, onclick: () => { t.hidden = true; }, text: action.label }) : null,
      h('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss', onclick: () => { t.hidden = true; }, text: '×' }));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 20000 : 4000);
  }

  async function share() {
    const c = state.current;
    if (!c) return;
    const url = `${SITE}#/ep/${c.date}`;
    const title = `The Singularity Daily · EP.${pad3(c.entry.ep)}`;
    if (navigator.share) {
      try { await navigator.share({ title, text: c.entry.hook, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { toast(url); }
  }

  function footer() {
    const u = state.index && state.index.updated;
    $('footUpdated').textContent = u ? `Last published ${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(u))} Sydney time · forecasts from the Guide, updated ${state.preds.updated ? fmt(state.preds.updated.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : 'n/a'}` : '';
  }

  function wireStatic() {
    document.querySelectorAll('[data-guide]').forEach(a => { a.href = `${GUIDE_ROOT}/guide`; });
    document.querySelectorAll('[data-guide-path]').forEach(a => { a.href = `${GUIDE_ROOT}${a.dataset.guidePath}`; });
    $('btnPlay').addEventListener('click', () => {
      const v = $('video');
      $('player').scrollIntoView({ block: 'nearest' });
      v.play().catch(() => v.focus());
    });
    $('btnTranscript').addEventListener('click', () => toggleTranscript());
    $('btnShare').addEventListener('click', share);
  }

  function showLoadError(e) {
    $('epKicker').textContent = 'Couldn\u2019t load the show';
    $('epHook').textContent = 'Back in a moment.';
    $('epTldr').replaceChildren(h('li', { text: `The episode data didn\u2019t load (${e.message}).` }));
    $('epStats').replaceChildren(h('button', { type: 'button', class: 'btn', onclick: () => location.reload(), text: 'Try again' }));
  }

  async function init() {
    wireStatic();
    try {
      const [index, preds, tracker] = await Promise.all([getJSON('daily/data/index.json'), getJSON('daily/data/predictions.json'), getJSON('daily/data/tracker.json')]);
      if (!index.episodes || !index.episodes.length) throw new Error('no episodes yet');
      state.index = index; setPreds(preds); state.tracker = tracker;
    } catch (e) {
      showLoadError(e);
      return;
    }
    state.lastSync = Date.now();
    buildFilters();
    renderPromo();
    renderEpisodes();
    renderScoreboard();
    renderMoving();
    renderForecasts();
    footer();
    await route();
    addEventListener('hashchange', route);
    startSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
