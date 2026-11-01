'use strict';
// Microsoft for Education Daily: the second show's section on this page (#/education, #/education/<date>).
// Its data (daily/edu/data/index.json and daily/edu/data/episodes/<date>.json) is written by the show's own publisher
// (Microsoft-Daily\engine\build\publish.py); app.js scrolls to the section, this file fills it in.
(() => {
  const SITE = 'https://peterxing.com/';
  const PAGES = 'https://peterxing.github.io/singularity-daily/';
  const SHOW = 'Microsoft for Education Daily';
  const host = location.hostname;
  const sameAsPages = host.endsWith('github.io') || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
  const MEDIA = sameAsPages ? '' : PAGES; // video and images come straight from GitHub Pages, as on the rest of the page
  const SYNC_MS = 10 * 60 * 1000;
  const state = { index: null, episodes: new Map(), current: null, lastSync: 0, onlyEdu: false };

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
  const epUrl = date => `${SITE}#/education/${date}`;

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  // the status pill's colour, from its wording: shipped, rolling out, preview, coming, ending or a warning
  function statusKind(s) {
    const t = String(s || '').toLowerCase();
    if (/generally available|^available|out now|^ga\b/.test(t)) return 'ga';
    if (/rolling out/.test(t)) return 'rolling';
    if (/preview|insider|beta|early access/.test(t)) return 'preview';
    if (/retire|deadline|ends|security|advisory|fix|patch/.test(t)) return 'alert';
    if (/due|coming|from |out \d|^out\b/.test(t)) return 'coming';
    return 'info';
  }

  // ------------------------------------------------------------------ one episode
  async function show(date) {
    const list = state.index.episodes;
    const entry = list.find(e => e.date === date) || list[0];
    let ep = state.episodes.get(entry.date);
    if (!ep) {
      ep = await getJSON(`daily/edu/data/episodes/${entry.date}.json`);
      state.episodes.set(entry.date, ep);
    }
    state.current = { date: entry.date, entry, ep };
    renderHero(entry, ep);
    renderStories(ep);
    renderTranscript(ep);
    document.querySelectorAll('#eduEpisodes .epcard').forEach(a => a.setAttribute('aria-current', String(a.dataset.date === entry.date)));
  }

  function renderHero(entry, ep) {
    const latest = entry.date === state.index.latest;
    const aired = ep.name && ep.name !== SHOW ? ` · aired as ${ep.name}` : '';
    $('eduKicker').textContent = `EP.${pad3(entry.ep)} · ${longDay(entry.date)}${latest ? ' · Latest' : ''}${aired}`;
    $('eduHook').textContent = entry.hook || SHOW;
    $('eduTldr').textContent = ep.tldr || '';
    const nEdu = ep.stories.filter(s => s.edu).length;
    const stats = [`${ep.stories.length} updates`, `${nEdu} education-specific`];
    if (ep.scanned) stats.push(`${Number(ep.scanned).toLocaleString('en-AU')} posts and headlines scanned`);
    if (entry.video) stats.push(`${Math.round((entry.video.seconds || 180) / 60)} min`);
    $('eduStats').textContent = stats.join(' · ');
    const L = ep.links || {};
    const posts = [['x', 'X'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook']].filter(([k]) => L[k]);
    const pe = $('eduPosts');
    pe.hidden = !posts.length;
    pe.replaceChildren(...(posts.length ? [h('span', { text: 'Discuss it on ' }), ...posts.flatMap(([k, n], i) =>
      [i ? ' · ' : null, h('a', { href: L[k], target: '_blank', rel: 'noopener', text: `${n} \u2197` })])] : []));
    $('eduWindow').textContent = ep.window || '';
    setupVideo(entry);
  }

  function setupVideo(entry) {
    const v = $('eduVideo'), note = $('eduPlayerNote'), player = $('eduPlayer'), play = $('eduPlay');
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
      note.replaceChildren(h('p', { text: 'This episode\u2019s video isn\u2019t archived. Its stories and sources are below.' }));
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
    const v = $('eduVideo'), c = state.current;
    if (!v.getAttribute('src') || !c || !c.entry.video) return;
    const vid = c.entry.video, note = $('eduPlayerNote');
    note.hidden = false;
    note.replaceChildren(h('p', { text: vid.pages ? 'The video didn\u2019t play here. Open it in your browser\u2019s own player.' : 'This archived episode streams from GitHub, which some browsers (like Safari on iPhone) can\u2019t play inline.' }),
      h('a', { class: 'btn btn-primary', href: vid.pages ? MEDIA + vid.file : vid.release, target: '_blank', rel: 'noopener', text: vid.pages ? 'Open the video \u2197' : `Download the episode (${vid.mb} MB)` }));
  }

  function renderTranscript(ep) {
    const v = $('eduVideo');
    $('eduTranscriptList').replaceChildren(...(ep.transcript || []).map(c => h('li', null,
      h('button', { type: 'button', 'aria-label': `Play from ${mmss(c.s)}`, onclick: () => { v.currentTime = c.s; v.play().catch(() => {}); }, text: mmss(c.s) }),
      h('span', { text: c.t }))));
    $('eduTranscriptBtn').disabled = !(ep.transcript || []).length;
    if (!(ep.transcript || []).length) toggleTranscript(false);
  }
  function toggleTranscript(force) {
    const open = typeof force === 'boolean' ? force : $('eduTranscript').hidden;
    $('eduTranscript').hidden = !open;
    $('eduTranscriptBtn').setAttribute('aria-expanded', String(open));
  }

  // ------------------------------------------------------------------ the stories
  function renderStories(ep) {
    const stories = state.onlyEdu ? ep.stories.filter(s => s.edu) : ep.stories;
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
    if (!out.length) out.push(h('p', { class: 'section-sub', text: 'No education-specific updates in this episode: show every update to see the rest.' }));
    $('eduStories').replaceChildren(...out);
    const nEdu = ep.stories.filter(s => s.edu).length;
    $('eduFilterAll').setAttribute('aria-pressed', String(!state.onlyEdu));
    $('eduFilterEdu').setAttribute('aria-pressed', String(state.onlyEdu));
    $('eduFilterAll').textContent = `Every update · ${ep.stories.length}`;
    $('eduFilterEdu').textContent = `Education-specific · ${nEdu}`;
    $('eduMore').hidden = !(ep.ticker || []).length;
    $('eduTicker').replaceChildren(...(ep.ticker || []).map(t => h('li', { text: t })));
    $('eduNotes').replaceChildren(...(ep.notes || []).map(t => h('li', { text: t })));
  }

  function storyCard(s) {
    const top = h('div', { class: 'card-top' });
    if (s.edu) top.append(h('span', { class: 'edu-tag', text: 'Education' }));
    top.append(h('span', { class: `edu-status ${statusKind(s.status)}`, text: s.status }));
    if (s.badge) top.append(h('span', { class: `badge ${s.badge === 'REPORTED' ? 'reported' : 'week'}`, text: s.badge === 'REPORTED' ? 'Reported' : 'This week' }));
    if (s.date) top.append(h('span', { class: 'card-date', text: short(s.date) }));
    return h('article', { class: `card edu-card${s.edu ? ' is-edu' : ''}`, id: `edu-${s.id}` },
      top,
      h('h4', { text: s.title }),
      s.for ? h('p', { class: 'edu-for' }, h('span', { text: 'For ' }), h('b', { text: s.for })) : null,
      s.summary ? h('p', { text: s.summary }) : null,
      h('div', { class: 'sources' }, (s.sources || []).map(src => src.url
        ? h('a', { href: src.url, target: '_blank', rel: 'noopener', text: `${src.outlet} \u2197` })
        : h('span', { text: src.outlet }))));
  }

  // ------------------------------------------------------------------ every episode
  function renderEpisodes() {
    $('eduEpisodes').replaceChildren(...state.index.episodes.map(e => h('li', null,
      h('a', { class: 'epcard', href: `#/education/${e.date}`, 'data-date': e.date, 'aria-current': String(state.current ? state.current.date === e.date : e.date === state.index.latest) },
        h('div', { class: 'th' }, e.thumb ? h('img', { src: MEDIA + e.thumb, alt: '', loading: 'lazy', width: '480', height: '270' }) : null,
          h('span', { class: `tag${e.video ? ' play' : ''}`, text: e.video ? `\u25b6 ${Math.round((e.video.seconds || 180) / 60)} min` : 'Stories only' })),
        h('div', { class: 'bd' },
          h('span', { class: 'k', text: `EP.${pad3(e.ep)} \u00b7 ${shortDay(e.date)}` }),
          h('span', { class: 'hk', text: e.hook || SHOW }),
          h('span', { class: 's', text: `${e.stories} updates \u00b7 ${e.edu} education-specific${e.name && e.name !== SHOW ? ` \u00b7 aired as ${e.name}` : ''}` }))))));
    const e = state.index.episodes[0];
    const also = $('eduAlso');
    if (also && e) {
      also.hidden = false;
      $('eduAlsoT').textContent = `EP.${pad3(e.ep)} \u00b7 ${e.hook || shortDay(e.date)}`;
    }
  }

  // ------------------------------------------------------------------ routing, sharing, new episodes
  const routeDate = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== 'education') return undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : null;
  };
  async function route() {
    const d = routeDate();
    if (d === undefined || !state.index) return;
    const want = d || state.index.latest;
    if (!state.current || state.current.date !== want) {
      try { await show(want); } catch (e) { $('eduKicker').textContent = `Couldn\u2019t load that episode (${e.message}).`; }
    }
  }

  async function share() {
    const c = state.current;
    if (!c) return;
    const url = epUrl(c.date), btn = $('eduShare');
    if (navigator.share) {
      try { await navigator.share({ title: `${SHOW} \u00b7 EP.${pad3(c.entry.ep)}`, text: c.entry.hook, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch (e) { btn.textContent = url; }
    setTimeout(() => { btn.textContent = 'Share'; }, 2500);
  }

  async function sync() {
    state.lastSync = Date.now();
    try {
      const index = await getJSON('daily/edu/data/index.json');
      if (index.latest === state.index.latest && index.updated === state.index.updated) return;
      const fresh = index.latest !== state.index.latest;
      const onLatest = state.current && state.current.date === state.index.latest;
      state.index = index;
      state.episodes.clear();
      renderEpisodes();
      await show(fresh && onLatest && typeof routeDate() !== 'string' ? index.latest : (state.current ? state.current.date : index.latest));
    } catch (e) { /* the next check tries again */ }
  }

  function wire() {
    $('eduPlay').addEventListener('click', () => {
      const v = $('eduVideo');
      $('eduPlayer').scrollIntoView({ block: 'nearest' });
      v.play().catch(() => v.focus());
    });
    $('eduTranscriptBtn').addEventListener('click', () => toggleTranscript());
    $('eduShare').addEventListener('click', share);
    $('eduVideo').addEventListener('error', videoFailed);
    const filter = only => { state.onlyEdu = only; if (state.current) renderStories(state.current.ep); };
    $('eduFilterAll').addEventListener('click', () => filter(false));
    $('eduFilterEdu').addEventListener('click', () => filter(true));
  }

  async function init() {
    if (!$('education')) return;
    wire();
    try {
      state.index = await getJSON('daily/edu/data/index.json');
      if (!state.index.episodes || !state.index.episodes.length) throw new Error('no episodes yet');
    } catch (e) {
      $('education').hidden = true; // the section appears once the show's first episode is published
      document.querySelectorAll('a[href="#/education"]').forEach(a => { a.hidden = true; });
      return;
    }
    renderEpisodes();
    const d = routeDate();
    try { await show(d || state.index.latest); } catch (e) { $('eduKicker').textContent = `Couldn\u2019t load the episode (${e.message}).`; }
    if (d !== undefined) requestAnimationFrame(() => $('education').scrollIntoView({ block: 'start' }));
    addEventListener('hashchange', route);
    setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - state.lastSync > SYNC_MS) sync(); }, 60 * 1000);
    state.lastSync = Date.now();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
