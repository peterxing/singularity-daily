'use strict';
// The Transhuman Daily: the third show's section on this page (#/transhuman, #/transhuman/<date>, #/transhuman/<date>/<story>).
// Its data (daily/th/data/index.json, daily/th/data/episodes/<date>.json) is written by the show's own publisher
// (Transhuman-Daily\engine\build\pxpublish.py). Every story carries its links to the Guide's forecasts; app.js also folds those
// links (daily/th/data/links.json) into Predictions vs reality and scrolls to the section, and this file fills the section in.
(() => {
  const SITE = 'https://peterxing.com/';
  const PAGES = 'https://peterxing.github.io/singularity-daily/';
  const SHOW = 'The Transhuman Daily';
  const host = location.hostname;
  const sameAsPages = host.endsWith('github.io') || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
  const MEDIA = sameAsPages ? '' : PAGES; // video and images come straight from GitHub Pages, as on the rest of the page
  const SYNC_MS = 10 * 60 * 1000;
  const PILLARS = {
    longevity: 'Super longevity',
    wellbeing: 'Super wellbeing',
    intelligence: 'Super intelligence',
    frontier: 'Frontier tech',
  };
  const REL = {
    supports: { label: 'Evidence for', icon: '\u25b2' },
    early: { label: 'Early sign', icon: '\u25c6' },
    challenges: { label: 'Evidence against', icon: '\u25bc' },
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const state = { index: null, preds: null, byId: new Map(), byKey: new Map(), episodes: new Map(), current: null, lastSync: 0, filter: 'all' };

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
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '')}\u2026` : s);
  const epUrl = date => `${SITE}#/transhuman/${date}`;
  const title = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  // ------------------------------------------------------------------ the Guide's forecasts, to name what each story touches
  function setPreds(preds) {
    state.preds = preds;
    state.byId = new Map((preds.items || []).map(p => [p.id, p]));
    state.byKey = new Map((preds.items || []).map(p => [p.key, p]));
  }
  const resolve = l => state.byKey.get(l.key) || state.byId.get(l.id);
  const when = p => (p.kind === 'horizon' ? 'Undated' : p.m ? `${MONTHS[p.m - 1]} ${p.year}` : String(p.year));
  const odds = p => (p.kind === 'horizon' ? `${p.cond}% conditional` : `${p.prob}%`);
  const domainName = d => (state.preds && state.preds.domains && state.preds.domains[d]) || d;
  const relPill = (rel, extra) => h('span', { class: `rel ${rel}` }, h('span', { 'aria-hidden': 'true', text: REL[rel].icon }), extra != null ? extra : REL[rel].label);
  const forecastHref = p => `#/forecasts/${p.id}`; // app.js opens a forecast that has fallen due in What it got right or wrong

  function touched(ep) {
    const seen = new Map(), rank = { supports: 0, early: 1, challenges: 2 };
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

  // ------------------------------------------------------------------ one episode
  async function show(date) {
    const list = state.index.episodes;
    const entry = list.find(e => e.date === date) || list[0];
    let ep = state.episodes.get(entry.date);
    if (!ep) {
      ep = await getJSON(`daily/th/data/episodes/${entry.date}.json`);
      state.episodes.set(entry.date, ep);
    }
    state.current = { date: entry.date, entry, ep };
    renderHero(entry, ep);
    renderStories(ep);
    renderTranscript(ep);
    document.querySelectorAll('#thEpisodes .epcard').forEach(a => a.setAttribute('aria-current', String(a.dataset.date === entry.date)));
  }

  function renderHero(entry, ep) {
    const latest = entry.date === state.index.latest;
    $('thKicker').textContent = `EP.${pad3(entry.ep)} \u00b7 ${longDay(entry.date)}${latest ? ' \u00b7 Latest' : ''}`;
    $('thHook').textContent = entry.hook || SHOW;
    $('thTldr').textContent = ep.tldr || '';
    const t = touched(ep);
    const stats = [`${ep.stories.length} stories`, `${t.length} forecast${t.length === 1 ? '' : 's'} touched`];
    if (ep.scanned) stats.push(`${Number(ep.scanned).toLocaleString('en-AU')} headlines and papers scanned`);
    if (entry.video) stats.push(`${Math.round((entry.video.seconds || 180) / 60)} min`);
    $('thStats').textContent = stats.join(' \u00b7 ');
    const touch = $('thTouch');
    touch.hidden = !t.length;
    touch.replaceChildren(...(t.length ? [h('span', { class: 'label', text: 'Moves' }),
      ...t.slice(0, 3).map(({ p, rel }) => h('a', { class: 'chip', href: forecastHref(p), title: `${REL[rel].label}: ${p.t}` },
        relPill(rel, ''), h('span', { class: 't', text: `${when(p)}: ${p.t}` }))),
      t.length > 3 ? h('span', { class: 'chip' }, h('span', { class: 't', text: `+${t.length - 3} more in the stories` })) : null] : []));
    const L = ep.links || {};
    const posts = [['x', 'X'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn']].filter(([k]) => L[k]);
    const pe = $('thPosts');
    pe.hidden = !posts.length;
    pe.replaceChildren(...(posts.length ? [h('span', { text: 'Discuss it on ' }), ...posts.flatMap(([k, n], i) =>
      [i ? ' \u00b7 ' : '', h('a', { href: L[k], target: '_blank', rel: 'noopener', text: `${n} \u2197` })])] : []));
    $('thWindow').textContent = ep.window || '';
    setupVideo(entry);
  }

  function setupVideo(entry) {
    const v = $('thVideo'), note = $('thPlayerNote'), player = $('thPlayer'), play = $('thPlay');
    v.pause();
    v.removeAttribute('src');
    note.hidden = true;
    player.querySelectorAll('.poster-img').forEach(n => n.remove());
    const vid = entry.video;
    const cover = entry.cover ? MEDIA + entry.cover : '';
    if (!vid) {
      player.classList.add('no-video');
      if (cover) player.prepend(h('img', { class: 'poster-img', src: cover, alt: '' }));
      note.hidden = false;
      note.replaceChildren(h('p', { text: 'This episode\u2019s video isn\u2019t archived. Its stories, sources and forecast links are below.' }));
      play.disabled = true;
      v.removeAttribute('poster');
      v.load();
      return;
    }
    player.classList.remove('no-video');
    play.disabled = false;
    if (cover) v.poster = cover; else v.removeAttribute('poster');
    v.src = vid.pages ? MEDIA + vid.file : vid.release; // a plain src plays most dependably on iOS Safari
    v.load();
  }

  function videoFailed() {
    const v = $('thVideo'), c = state.current;
    if (!v.getAttribute('src') || !c || !c.entry.video) return;
    const vid = c.entry.video, note = $('thPlayerNote');
    note.hidden = false;
    note.replaceChildren(h('p', { text: vid.pages ? 'The video didn\u2019t play here. Open it in your browser\u2019s own player.' : 'This archived episode streams from GitHub, which some browsers (like Safari on iPhone) can\u2019t play inline.' }),
      h('a', { class: 'btn btn-primary', href: vid.pages ? MEDIA + vid.file : vid.release, target: '_blank', rel: 'noopener', text: vid.pages ? 'Open the video \u2197' : `Download the episode (${vid.mb} MB)` }));
  }

  function renderTranscript(ep) {
    const v = $('thVideo');
    $('thTranscriptList').replaceChildren(...(ep.transcript || []).map(c => h('li', null,
      h('button', { type: 'button', 'aria-label': `Play from ${mmss(c.s)}`, onclick: () => { v.currentTime = c.s; v.play().catch(() => {}); }, text: mmss(c.s) }),
      h('span', { text: c.t }))));
    $('thTranscriptBtn').disabled = !(ep.transcript || []).length;
    if (!(ep.transcript || []).length) toggleTranscript(false);
  }
  function toggleTranscript(force) {
    const open = typeof force === 'boolean' ? force : $('thTranscript').hidden;
    $('thTranscript').hidden = !open;
    $('thTranscriptBtn').setAttribute('aria-expanded', String(open));
  }

  // ------------------------------------------------------------------ the stories
  const keep = s => state.filter === 'all' || (state.filter === 'mapped' ? (s.predictions || []).some(l => resolve(l)) : s.pillar === state.filter);

  function renderStories(ep) {
    const stories = ep.stories.filter(keep);
    const groups = new Map();
    for (const c of ep.chapters || []) groups.set(c, []);
    for (const s of stories) {
      const key = s.chapter && groups.has(s.chapter) ? s.chapter : '__more';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const out = [];
    let n = 0;
    for (const [chapter, list] of groups) {
      if (!list.length) continue;
      n += 1;
      out.push(h('div', { class: 'chapter' }, h('span', { class: 'n', text: String(n).padStart(2, '0') }), h('h3', { text: chapter === '__more' ? 'Also' : chapter })));
      out.push(h('div', { class: 'cards' }, list.map(storyCard)));
    }
    if (!out.length) out.push(h('p', { class: 'section-sub', text: 'Nothing in this episode matches: show every story to see the rest.' }));
    $('thStories').replaceChildren(...out);
    const count = f => ep.stories.filter(s => (f === 'mapped' ? (s.predictions || []).some(l => resolve(l)) : s.pillar === f)).length;
    document.querySelectorAll('#thFilter .btn').forEach(b => {
      const f = b.dataset.f;
      b.setAttribute('aria-pressed', String(state.filter === f));
      b.textContent = `${f === 'all' ? 'Every story' : f === 'mapped' ? 'On a forecast' : PILLARS[f]} \u00b7 ${f === 'all' ? ep.stories.length : count(f)}`;
    });
    $('thMore').hidden = !(ep.ticker || []).length;
    $('thTicker').replaceChildren(...(ep.ticker || []).map(t => h('li', { text: t })));
    $('thNotes').replaceChildren(...(ep.notes || []).map(t => h('li', { text: t })));
  }

  function storyCard(s) {
    const top = h('div', { class: 'card-top' });
    if (s.pillar) top.append(h('span', { class: `th-pillar ${s.pillar}`, text: PILLARS[s.pillar] || s.pillar }));
    if (s.badge) top.append(h('span', { class: `badge${s.badge === 'REPORTED' ? ' reported' : ''}`, text: title(s.badge) }));
    if (s.date) top.append(h('span', { class: 'card-date', text: short(s.date) }));
    const links = (s.predictions || []).map(l => ({ l, p: resolve(l) })).filter(x => x.p);
    return h('article', { class: 'card th-card', id: `th-${s.id}` },
      top,
      h('h4', { text: s.title }),
      s.evidence ? h('p', { class: 'th-evidence' }, h('span', { text: 'Evidence ' }), h('b', { text: s.evidence })) : null,
      s.summary ? h('p', { text: s.summary }) : null,
      h('div', { class: 'sources' }, (s.sources || []).map(src => src.url
        ? h('a', { href: src.url, target: '_blank', rel: 'noopener', text: `${src.outlet} \u2197` })
        : h('span', { text: src.outlet }))),
      links.length ? h('div', { class: 'links' }, links.map(({ l, p }) => h('a', { class: 'link', href: forecastHref(p) },
        relPill(l.relation),
        h('span', { class: 'f' }, clip(p.t, 140), h('small', { text: `${when(p)} \u00b7 ${odds(p)} \u00b7 ${domainName(p.d)}` })),
        h('span', { class: 'why', text: l.note })))) : null);
  }

  // ------------------------------------------------------------------ every episode
  function renderEpisodes() {
    $('thEpisodes').replaceChildren(...state.index.episodes.map(e => h('li', null,
      h('a', { class: 'epcard', href: `#/transhuman/${e.date}`, 'data-date': e.date, 'aria-current': String(state.current ? state.current.date === e.date : e.date === state.index.latest) },
        h('div', { class: 'th' }, e.thumb ? h('img', { src: MEDIA + e.thumb, alt: '', loading: 'lazy', width: '480', height: '270' }) : null,
          h('span', { class: `tag${e.video ? ' play' : ''}`, text: e.video ? `\u25b6 ${Math.round((e.video.seconds || 180) / 60)} min` : 'Stories only' })),
        h('div', { class: 'bd' },
          h('span', { class: 'k', text: `EP.${pad3(e.ep)} \u00b7 ${shortDay(e.date)}` }),
          h('span', { class: 'hk', text: e.hook || SHOW }),
          h('span', { class: 's', text: `${e.stories} stories \u00b7 ${e.forecasts || 0} forecast${e.forecasts === 1 ? '' : 's'} touched` }))))));
    const e = state.index.episodes[0];
    const also = $('thAlso');
    if (also && e) {
      also.hidden = false;
      $('thAlsoT').textContent = `EP.${pad3(e.ep)} \u00b7 ${e.hook || shortDay(e.date)}`;
    }
  }

  // ------------------------------------------------------------------ routing, sharing, new episodes
  const routeParts = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== 'transhuman') return undefined;
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : null, story: parts[2] || null };
  };
  // a story's own link lands on its card (app.js holds the section while the page above fills in, and lets go for the card)
  function landOnStory(id) {
    if (!id) return;
    if (state.filter !== 'all') { state.filter = 'all'; renderStories(state.current.ep); }
    const card = $(`th-${id}`);
    if (!card) return;
    if (typeof window.sdLand === 'function') window.sdLand(card); else card.scrollIntoView({ block: 'start' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 2400);
  }
  async function route() {
    const r = routeParts();
    if (r === undefined || !state.index) return;
    const want = r.date || state.index.latest;
    if (!state.current || state.current.date !== want) {
      try { await show(want); } catch (e) { $('thKicker').textContent = `Couldn\u2019t load that episode (${e.message}).`; return; }
    }
    landOnStory(r.story);
  }

  async function share() {
    const c = state.current;
    if (!c) return;
    const url = epUrl(c.date), btn = $('thShare');
    if (navigator.share) {
      try { await navigator.share({ title: `${SHOW} \u00b7 EP.${pad3(c.entry.ep)}`, text: c.entry.hook, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch (e) { btn.textContent = url; }
    setTimeout(() => { btn.textContent = 'Share'; }, 2500);
  }

  async function sync() {
    state.lastSync = Date.now();
    try {
      const index = await getJSON('daily/th/data/index.json');
      if (index.latest === state.index.latest && index.updated === state.index.updated) return;
      const fresh = index.latest !== state.index.latest;
      const onLatest = state.current && state.current.date === state.index.latest;
      state.index = index;
      state.episodes.clear();
      renderEpisodes();
      const r = routeParts();
      await show(fresh && onLatest && !(r && r.date) ? index.latest : (state.current ? state.current.date : index.latest));
    } catch (e) { /* the next check tries again */ }
  }

  function wire() {
    $('thPlay').addEventListener('click', () => {
      const v = $('thVideo');
      $('thPlayer').scrollIntoView({ block: 'nearest' });
      v.play().catch(() => v.focus());
    });
    $('thTranscriptBtn').addEventListener('click', () => toggleTranscript());
    $('thShare').addEventListener('click', share);
    $('thVideo').addEventListener('error', videoFailed);
    document.querySelectorAll('#thFilter .btn').forEach(b => b.addEventListener('click', () => {
      state.filter = b.dataset.f;
      if (state.current) renderStories(state.current.ep);
    }));
  }

  async function init() {
    if (!$('transhuman')) return;
    wire();
    try {
      const [index, preds] = await Promise.all([getJSON('daily/th/data/index.json'), getJSON('daily/data/predictions.json').catch(() => ({ items: [] }))]);
      if (!index.episodes || !index.episodes.length) throw new Error('no episodes yet');
      state.index = index;
      setPreds(preds);
    } catch (e) {
      $('transhuman').hidden = true; // the section appears once the show's first episode is on this site
      document.querySelectorAll('a[href="#/transhuman"]').forEach(a => { a.hidden = true; });
      return;
    }
    renderEpisodes();
    const r = routeParts();
    try { await show((r && r.date) || state.index.latest); } catch (e) { $('thKicker').textContent = `Couldn\u2019t load the episode (${e.message}).`; }
    if (r && r.story) landOnStory(r.story);
    addEventListener('hashchange', route);
    setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - state.lastSync > SYNC_MS) sync(); }, 60 * 1000);
    state.lastSync = Date.now();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
