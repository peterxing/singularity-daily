'use strict';
(() => {
  const SITE = 'https://peterxing.com/';
  const GUIDE = 'https://peterxing.com';
  const PAGES = 'https://peterxing.github.io/singularity-daily/';
  const KINDLE = 'https://www.amazon.com.au/dp/B0HRRCXLRY';
  const host = location.hostname;
  const onPeterxing = /(^|\.)peterxing\.com$/.test(host) || /post-agi-planning/.test(host);
  const sameAsPages = host.endsWith('github.io') || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
  const MEDIA = sameAsPages ? '' : PAGES; // video and images come straight from GitHub Pages
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const REL = {
    supports: { label: 'Evidence for', icon: '▲' },
    early: { label: 'Early sign', icon: '◆' },
    challenges: { label: 'Evidence against', icon: '▼' },
  };
  const VERDICT = {
    right: { label: 'Right', icon: '✓', many: 'right' },
    partly: { label: 'Partly right', icon: '◐', many: 'partly right' },
    wrong: { label: 'Wrong', icon: '✗', many: 'wrong' },
    open: { label: 'Not settled yet', icon: '…', many: 'not settled yet' },
    pending: { label: 'Awaiting a verdict', icon: '?', many: 'awaiting a verdict' },
  };
  const SYNC_MS = 10 * 60 * 1000;

  const state = {
    index: null, preds: null, tracker: null, byId: new Map(), byKey: new Map(), order: new Map(), episodes: new Map(),
    score: { tests: {}, due: [], soon: [] }, dueIds: new Set(), revs: { items: [] }, weekly: { items: [] },
    current: null, lastSync: 0, filters: { q: '', domain: 'all', rel: 'all', view: 'year', who: 'all' },
    sdTracker: null, th: null, fc: null, fcById: new Map(), people: new Map(), paths: null, bench: null,
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
  // The scorecard, the revision log and the weekly digest are extras: the show works without them.
  const getOptional = path => getJSON(path).catch(() => null);

  // ------------------------------------------------------------------ forecasts
  function setPreds(preds) {
    state.preds = preds;
    state.byId = new Map(preds.items.map(p => [p.id, p]));
    state.byKey = new Map(preds.items.map(p => [p.key, p]));
    state.order = new Map(preds.items.map((p, i) => [p.id, i]));
  }
  function setExtras(score, revs, weekly) {
    state.score = score && Array.isArray(score.due) ? score : { tests: {}, due: [], soon: [] };
    state.score.tests = state.score.tests || {};
    state.score.soon = state.score.soon || [];
    state.score.due = state.score.due.filter(d => state.byId.has(d.id));
    state.dueIds = new Set(state.score.due.map(d => d.id));
    state.revs = revs && Array.isArray(revs.items) ? revs : { items: [] };
    state.weekly = weekly && Array.isArray(weekly.items) ? weekly : { items: [] };
  }
  const isDue = p => state.dueIds.has(p.id);
  const liveItems = () => state.preds.items.filter(p => !isDue(p));
  const verdictOf = p => (state.score.due.find(d => d.id === p.id) || {}).verdict || 'pending';
  const resolve = link => state.byKey.get(link.key) || state.byId.get(link.id);
  const ymLabel = (s, withYear = true) => { const [y, m] = s.split('-').map(Number); return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1]; };
  const when = p => (p.kind === 'horizon' ? (p.year ? `~${p.year}` : 'Undated') : p.m ? `${MONTHS[p.m - 1]} ${p.year}` : String(p.year));
  const spread = p => (p.kind === 'dated' && p.band ? `±${p.band} mo` : p.kind === 'horizon' && p.band ? `±${Math.round(p.band / 12)} yrs` : '');
  const windowText = p => {
    if (!p.win) return String(p.year || '');
    const [a, b] = p.win;
    if (p.kind === 'horizon') return `${a.slice(0, 4)}–${b.slice(0, 4)}`;
    return `${ymLabel(a, a.slice(0, 4) !== b.slice(0, 4))}–${ymLabel(b)}`;
  };
  const odds = p => (p.kind === 'horizon' ? `${p.cond}% conditional` : `${p.prob}%`);
  const domainName = d => (state.preds.domains && state.preds.domains[d]) || d;
  const relPill = (rel, extra) => h('span', { class: `rel ${rel}` }, h('span', { 'aria-hidden': 'true' }, REL[rel].icon), extra != null ? extra : REL[rel].label);
  const verdictPill = v => h('span', { class: `verdict ${v}` }, h('span', { 'aria-hidden': 'true', text: VERDICT[v].icon }), VERDICT[v].label);
  const forecastHref = p => (isDue(p) ? `#/scorecard/${p.id}` : `#/forecasts/${p.id}`);
  const dayMonthYear = iso => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });

  // ------------------------------------------------------------------ the Transhuman Daily's forecast links
  // That show (#/transhuman, daily/th.js) maps its stories to the same forecasts. Its publisher writes every link to
  // daily/th/data/links.json; they join the Singularity Daily's in the tracker here, each resolved by the forecast's key (then
  // its id, as the tracker does), so Predictions vs reality, the verdicts and "moving now" count both shows.
  function setTracker(tracker, th) {
    state.sdTracker = tracker;
    state.th = th && Array.isArray(th.links) ? th : null;
    if (!state.th) { state.tracker = tracker; return; }
    const forecasts = {};
    for (const [id, r] of Object.entries(tracker.forecasts || {})) forecasts[id] = { ...r, items: [...r.items] };
    for (const l of state.th.links) {
      const p = state.byKey.get(l.key) || state.byId.get(l.fid);
      if (!p || !REL[l.relation]) continue;
      const r = forecasts[p.id] || (forecasts[p.id] = { supports: 0, early: 0, challenges: 0, last: '', items: [] });
      r[l.relation] = (r[l.relation] || 0) + 1;
      r.items.push({ show: 'th', ep: l.ep, on: l.on, date: l.date, story: l.story, title: l.title, relation: l.relation, note: l.note,
        outlet: l.outlet, url: l.url, revised: Boolean(l.key && p.key !== l.key) });
    }
    for (const r of Object.values(forecasts)) {
      r.items.sort((a, b) => (b.on || '').localeCompare(a.on || '') || (b.date || '').localeCompare(a.date || ''));
      r.last = r.items.length ? r.items[0].on : r.last;
    }
    state.tracker = { ...tracker, forecasts };
  }
  const thOn = () => Boolean(state.th && state.th.links.length);
  const theShows = () => (thOn() ? 'the shows' : 'the show');
  const itemHref = i => (i.show === 'th' ? `#/transhuman/${i.on}/${i.story}` : `#/ep/${i.on}/${i.story}`);
  const itemEp = i => (i.show === 'th' ? `Transhuman Daily EP.${pad3(i.ep)}` : `EP.${pad3(i.ep)}`);

  // ------------------------------------------------------------------ leading forecasters, on the same timeline
  // engine\build\forecasters.py checks PROJECT\forecasters.json and paths.json, and publish.py writes daily/data/
  // forecasters.json (their dated predictions, in their own words, each in the year they gave and judged like the Guide's
  // once due) and daily/data/paths.json ("Which path are we on?"). The Guide's own timeline reads the same files.
  function setForecasters(m, paths) {
    state.fc = m && Array.isArray(m.items) ? m : null;
    state.fcById = new Map(state.fc ? state.fc.items.map(x => [x.id, x]) : []);
    state.people = new Map(((state.fc && state.fc.people) || []).map(p => [p.id, p]));
    state.paths = paths && Array.isArray(paths.paths) && paths.paths.length ? paths : null;
  }
  const fcItems = () => (state.fc ? state.fc.items : []);
  const setBench = b => { state.bench = b && Array.isArray(b.models) && b.models.length && Array.isArray(b.benchmarks) ? b : null; };
  const fcJudged = x => Boolean(x.verdict); // its date has passed (judged or awaiting a verdict), or it came true early
  const fcLive = () => fcItems().filter(x => !fcJudged(x));
  const fcDue = () => fcItems().filter(fcJudged);
  const fcFor = id => fcItems().filter(x => x.forecast === id);
  const topicName = t => (state.fc && state.fc.topics && state.fc.topics[t]) || t;
  const longYm = s => `${LONG_MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  const fcYear = x => (Number(x.by.slice(0, 4)) > 2040 ? 'beyond' : x.by.slice(0, 4));
  const fcOrder = x => (Number(x.by.slice(0, 4)) * 12 + Number(x.by.slice(5, 7))) * 100 + 99; // after the Guide's in the same month
  const fcSpan = x => `By the end of ${longYm(x.by)}${x.until ? `, and no later than the end of ${longYm(x.until)}` : ''}`;
  const fcHref = x => `#/predictions/${x.id}`;
  const personName = id => (id === 'guide' ? 'The Guide' : (state.people.get(id) || {}).name || id);
  const whoPill = id => h('span', { class: 'who-pill', text: personName(id) });
  const outLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener', text });
  // the "Whose" filter: all | guide | others (every forecaster) | group:<id> | person:<id>
  function whoMatches(x) {
    const w = state.filters.who;
    if (w === 'all' || w === 'others') return true;
    if (w.startsWith('person:')) return x.who === w.slice(7);
    if (w.startsWith('group:')) return (state.people.get(x.who) || {}).group === w.slice(6);
    return false;
  }
  const onlyForecasters = () => !['all', 'guide'].includes(state.filters.who);
  function whoLabel() {
    const w = state.filters.who;
    if (w === 'members') return 'Transhumanism Australia members';
    if (w.startsWith('person:')) return personName(w.slice(7));
    if (w.startsWith('group:')) return ((state.fc && state.fc.groups) || {})[w.slice(6)] || 'the group';
    return 'the leading forecasters';
  }

  // ------------------------------------------------------------------ Transhumanism Australia members' own predictions
  // members.js loads the members API's public feed (approved predictions only) and fires 'sdm:data'; they sit on the
  // same timeline in green, under the member's chosen name. They are the members' own, never the Guide's, and not judged.
  const memItems = () => (window.SDM && SDM.live && Array.isArray(SDM.data.predictions) ? SDM.data.predictions : []);
  const memYear = x => (Number(x.by.slice(0, 4)) > 2040 ? 'beyond' : x.by.slice(0, 4));
  const memOrder = x => (Number(x.by.slice(0, 4)) * 12 + Number(x.by.slice(5, 7))) * 100 + 99.5; // after the forecasters' in the same month
  const memWho = x => (x.tier === 'sponsor' ? 'Timeline sponsor' : 'Transhumanism Australia member');
  function memRows() {
    const f = state.filters;
    if (!['all', 'members'].includes(f.who) || f.domain !== 'all' || f.rel !== 'all' || f.view !== 'year') return [];
    const words = f.q ? f.q.split(/\s+/) : [];
    return memItems().filter(x => !words.length || words.every(w =>
      `${x.claim} ${x.why || ''} ${x.name} ${ymLabel(x.by)} ${x.topic ? domainName(x.topic) : ''} member`.toLowerCase().includes(w)));
  }
  function memRow(x) {
    const det = h('details', { class: 'fc ext mem', id: `mp-${x.id}` });
    det.append(h('summary', null,
      h('span', { class: 'meta' }, h('span', { class: 'fy', text: ymLabel(x.by).toUpperCase() }),
        h('span', { class: 'pr', text: `${x.prob ? `${x.prob}% · ` : ''}posted ${ymLabel(x.posted.slice(0, 7))}` })),
      h('span', { class: 'tx' }, x.claim, h('small', null, `${x.name} · ${memWho(x)}${x.topic ? ` · ${domainName(x.topic)}` : ''}`)),
      h('span', { class: 'sig' }, h('span', { class: 'who-pill mem', text: 'Member' }))));
    det.addEventListener('toggle', () => {
      if (det.open && !det.dataset.filled) {
        det.dataset.filled = '1';
        det.append(memBody(x));
      }
    });
    return h('li', null, det);
  }
  function memBody(x) {
    const fact = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const link = x.link && safeHttps(x.link);
    return h('div', { class: 'fc-body' },
      fact('Their prediction', h('p', { text: x.claim }),
        h('p', { class: 'note' }, `${x.name}, ${x.tier === 'sponsor' ? 'a timeline sponsor and Transhumanism Australia member' : 'a Transhumanism Australia member'}. Posted ${dayMonthYear(x.posted)}${x.edited ? `, edited by the site\u2019s admins ${dayMonthYear(x.edited)}` : ''}. `,
          link ? h('a', { href: link, target: '_blank', rel: 'nofollow ugc noopener', text: 'Their link \u2197' }) : null)),
      fact('When', h('p', { text: `By the end of ${longYm(x.by)}.${x.prob ? ` They put ${x.prob}% on it.` : ''}` })),
      x.why ? fact('Why', h('p', { text: x.why })) : null,
      fact('Note', h('p', { class: 'note', text: x.edited
        ? 'A member\u2019s own prediction, checked for being on topic and civil and since edited by the site\u2019s admins. It isn\u2019t the Guide\u2019s, and it isn\u2019t judged here.'
        : 'A member\u2019s own prediction, shown as they posted it once it was checked for being on topic and civil. It isn\u2019t the Guide\u2019s, and it isn\u2019t judged here.' })),
      h('div', { class: 'fc-foot' }, h('a', { href: `#/members/p/${x.id}`, text: 'Link to this prediction' }), h('a', { href: '#/members', text: 'Add your own' })));
  }
  async function openMember(id) {
    if (window.SDM) await SDM.ready;
    const x = memItems().find(m => m.id === id);
    if (!x) { toast('That prediction isn\u2019t on the timeline (any more).'); return $('forecasts'); }
    const f = state.filters;
    if (!['all', 'members'].includes(f.who) || f.domain !== 'all' || f.rel !== 'all' || f.view !== 'year' || f.q) clearFilters();
    const yr = $(`y-${memYear(x)}`);
    if (yr) yr.open = true;
    const el = $(`mp-${id}`);
    if (!el) return $('forecasts');
    el.open = true;
    flash(el);
    return el;
  }

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
      touch.replaceChildren(...[h('span', { class: 'label', text: 'Moves' }),
        ...t.slice(0, 3).map(({ p, rel }) => h('a', { class: 'chip', href: forecastHref(p), title: `${REL[rel].label}: ${p.t}` },
          relPill(rel, ''), h('span', { class: 't', text: `${when(p)}: ${p.t}` }))),
        t.length > 3 ? h('a', { class: 'chip', href: '#/stories' }, h('span', { class: 't', text: `+${t.length - 3} more in the stories` })) : null].filter(Boolean));
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
    // A plain src (no <source> children injected by script, no cross-origin <track>) is the most dependable way to
    // play on iOS Safari. The episode's captions are burned into the picture, and the transcript is below.
    const url = vid.pages ? MEDIA + vid.file : vid.release;
    v.src = url;
    v.load();
    dl.hidden = false;
    dl.href = url;
    dl.target = '_blank';
    dl.rel = 'noopener';
    dl.textContent = vid.pages ? 'Open video \u2197' : `Download \u00b7 ${vid.mb} MB`;
  }

  function videoFailed() {
    const v = $('video'), c = state.current;
    if (!v.getAttribute('src') || !c || !c.entry.video) return; // cleared on purpose, or an episode without video
    const vid = c.entry.video, note = $('playerNote');
    note.hidden = false;
    note.replaceChildren(h('p', { text: vid.pages ? 'The video didn\u2019t play here. Open it directly in your browser\u2019s player.' : 'This archived episode streams from GitHub, which some browsers (like Safari on iPhone) can\u2019t play inline.' }),
      h('a', { class: 'btn btn-primary', href: vid.pages ? MEDIA + vid.file : vid.release, target: '_blank', rel: 'noopener', text: vid.pages ? 'Open the video \u2197' : `Download the episode (${vid.mb} MB)` }));
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
      links.length ? h('div', { class: 'links' }, links.map(({ l, p }) => h('a', { class: 'link', href: forecastHref(p) },
        relPill(l.relation),
        h('span', { class: 'f' }, clip(p.t, 140), h('small', { text: `${when(p)} · ${odds(p)} · ${domainName(p.d)}${isDue(p) ? ` · judged: ${VERDICT[verdictOf(p)].label.toLowerCase()}` : ''}` })),
        h('span', { class: 'why', text: l.note })))) : null);
  }

  // ------------------------------------------------------------------ start here
  function renderStart() {
    const e = state.index.episodes[0];
    $('startWatchT').textContent = `EP.${pad3(e.ep)} · ${e.hook || shortDay(e.date)}`;
    const due = state.score.due, n = k => due.filter(d => d.verdict === k).length;
    $('startScoreK').textContent = due.length ? `Is it holding up? · ${due.length} due so far` : 'Is it holding up?';
    $('startScoreT').textContent = due.length ? `${n('right')} right · ${n('partly')} partly · ${n('wrong')} wrong` : 'Nothing has fallen due yet';
  }

  // ------------------------------------------------------------------ countdown to the singularity
  // The clock runs to midnight, Sydney time, at the start of the best-guess month of the Guide's forecast that
  // superintelligence emerges. It reads that forecast from predictions.json, so it moves whenever Peter revises it.
  const SINGULARITY = /\bsuperintelligence (emerges|arrives)\b/i;
  const pad2 = n => String(n).padStart(2, '0');
  let singTimer = 0;
  function sydneyMonthStart(y, m) {
    const f = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const offset = t => {
      const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, Number(x.value)]));
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
    };
    const base = Date.UTC(y, m - 1, 1);
    return base - offset(base - offset(base)); // twice, in case daylight saving changes between the two instants
  }
  function singularityForecast() {
    return state.preds.items.filter(p => p.kind === 'dated' && p.m && SINGULARITY.test(p.t))
      .sort((a, b) => a.year - b.year || a.m - b.m)[0] || null;
  }
  function renderSingularity() {
    clearTimeout(singTimer);
    const p = singularityForecast();
    $('singularity').hidden = !p;
    if (!p) return;
    const start = sydneyMonthStart(p.year, p.m), end = sydneyMonthStart(p.m === 12 ? p.year + 1 : p.year, p.m === 12 ? 1 : p.m + 1);
    const now = Date.now(), month = `${LONG_MONTHS[p.m - 1]} ${p.year}`, what = 'AI that beats the best people at essentially all cognitive work and starts improving its own successors.';
    const phase = now < start ? 'before' : now < end ? 'month' : 'due';
    $('singKText').textContent = { before: 'Countdown to the singularity', month: 'The singularity: its best-guess month is here', due: 'The singularity: the forecast has fallen due' }[phase];
    $('singClock').hidden = phase !== 'before';
    $('singNote').replaceChildren(...{
      before: ['Until ', h('strong', { text: month }), `, the Guide's best guess for superintelligence: ${what}`],
      month: [h('strong', { text: month }), ` is the Guide's best guess for superintelligence: ${what} It is judged against its test once the month is over.`],
      due: [h('strong', { text: month }), ` was the Guide's best guess for superintelligence: ${what} `, verdictPill(verdictOf(p))],
    }[phase]);
    $('singMeta').replaceChildren(`A best guess, not a prophecy · window ${windowText(p)} · odds ${odds(p)} · `,
      h('a', { href: forecastHref(p), text: isDue(p) ? 'See the verdict →' : 'The forecast and its test →' }));
    if (phase === 'before') tickSingularity(start);
  }
  function tickSingularity(at) {
    const left = at - Date.now();
    if (left <= 0) { renderSingularity(); return; }
    const s = Math.floor(left / 1000);
    $('singD').textContent = Math.floor(s / 86400).toLocaleString('en-AU');
    $('singH').textContent = pad2(Math.floor(s / 3600) % 24);
    $('singM').textContent = pad2(Math.floor(s / 60) % 60);
    $('singS').textContent = pad2(s % 60);
    singTimer = setTimeout(() => tickSingularity(at), (left % 1000) + 25);
  }

  // ------------------------------------------------------------------ the week in the forecasts
  function renderWeekly() {
    const weeks = state.weekly.items, sec = $('weekly');
    if (!weeks.length) { sec.hidden = true; return; }
    sec.hidden = false;
    const w = weeks[0];
    $('weeklyKicker').textContent = `The week in the forecasts · ${fmt(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    $('weeklyList').replaceChildren(...w.developments.map((x, i) => weekItem(x, i)));
    $('weeklyImp').replaceChildren(h('span', { class: 'lab mono', text: 'One practical implication' }), h('h3', { text: w.implication.title }), h('p', { text: w.implication.text }));
    const past = weeks.slice(1);
    $('weeklyPast').hidden = !past.length;
    $('weeklyPastList').replaceChildren(...past.map(pw => h('li', { id: `w-${pw.date}` },
      h('b', { text: fmt(pw.date, { day: 'numeric', month: 'long', year: 'numeric' }) }),
      h('ol', null, pw.developments.map(x => h('li', null, h('a', { href: `#/ep/${x.on}/${x.story}`, text: x.title })))),
      h('p', null, h('span', { class: 'lab mono', text: 'Implication ' }), pw.implication.title))));
  }
  function weekItem(x, i) {
    const p = state.byId.get(x.forecast);
    return h('li', { class: 'wk-i' },
      h('span', { class: 'n mono', text: String(i + 1).padStart(2, '0') }),
      h('div', null,
        h('h3', { text: x.title }),
        h('p', { text: x.text }),
        h('div', { class: 'wk-m' },
          h('a', { href: `#/ep/${x.on}/${x.story}`, text: `EP.${pad3(x.ep)} · ${short(x.on)}` }),
          x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener', text: `${x.outlet || 'Source'} ↗` }) : null,
          p ? h('a', { class: 'wk-f', href: forecastHref(p), text: `${when(p)} · ${odds(p)}: ${clip(p.t, 90)}` }) : null)));
  }
  function openWeek(date) {
    if (!state.weekly.items.length) return $('weekly');
    if (state.weekly.items[0].date === date) return $('weekly');
    const el = $(`w-${date}`);
    if (!el) return $('weekly');
    $('weeklyPast').open = true;
    flash(el);
    return el;
  }

  // ------------------------------------------------------------------ what it got right or wrong
  function trackerFor(id) { return state.tracker.forecasts[id]; }

  function renderScorecard() {
    const due = state.score.due, n = k => due.filter(d => d.verdict === k).length;
    const kinds = ['right', 'partly', 'wrong', 'open', 'pending'].filter(k => k !== 'pending' || n(k));
    const soonIds = state.score.soon.filter(id => state.byId.has(id));
    const next = soonIds.length ? state.byId.get(soonIds[0]) : null;
    $('verdictTally').replaceChildren(...(due.length ? kinds.map(k => h('div', { class: `vt ${k}` }, h('b', { text: String(n(k)) }), h('span', { text: VERDICT[k].many }))) : []),
      h('p', { class: 'vt-note mono', text: `${due.length} of ${state.preds.items.filter(p => p.kind === 'dated').length} dated forecasts have fallen due so far${next ? ` · next: ${soonIds.length} with a best guess of ${when(next)}${soonIds.length > 1 && when(state.byId.get(soonIds[soonIds.length - 1])) !== when(next) ? ` to ${when(state.byId.get(soonIds[soonIds.length - 1]))}` : ''}` : ''}` }));
    $('verdictList').replaceChildren(...due.map(verdictCard));
    if (!due.length) $('verdictList').append(h('li', { class: 'empty', text: 'No forecast has fallen due yet.' }));
    renderSoon(soonIds);
    renderFcDue();
    renderRevisions();
  }

  // Leading forecasters' predictions whose date has passed: judged against their tests, like the Guide's
  function renderFcDue() {
    const box = $('fcDue');
    if (!box) return;
    box.hidden = !fcItems().length;
    if (box.hidden) return;
    const due = fcDue().sort((a, b) => b.by.localeCompare(a.by) || a.id.localeCompare(b.id)), live = fcLive();
    const n = k => due.filter(x => x.verdict === k).length;
    const kinds = ['right', 'partly', 'wrong', 'open', 'pending'].filter(k => k !== 'pending' || n(k));
    box.replaceChildren(
      h('h3', { class: 'sub-h', text: 'Leading forecasters\u2019 predictions, judged the same way' }),
      h('p', { class: 'section-sub' }, `The dated predictions of ${state.people.size} leading thinkers on the same subjects, in their own words, sit on the timeline next to the Guide's forecasts. Each gets a test when it is added here, and once the date they gave has passed it is judged against it: right, partly right, wrong, or not settled while the outer limit they gave is still open. ${live.length} more ${live.length === 1 ? 'is' : 'are'} still to come: `,
        h('a', { href: '#/forecasters', text: 'see them on the timeline \u2192' })),
      due.length ? h('div', { class: 'vtally' }, kinds.map(k => h('div', { class: `vt ${k}` }, h('b', { text: String(n(k)) }), h('span', { text: VERDICT[k].many })))) : null,
      h('ol', { class: 'verdicts' }, due.length ? due.map(fcCard) : h('li', { class: 'empty', text: 'None of their dated predictions has fallen due yet.' })));
  }

  function fcCard(x) {
    const row = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const p = x.forecast ? state.byId.get(x.forecast) : null;
    return h('li', { class: `vc ext ${x.verdict}`, id: `mv-${x.id}` },
      h('div', { class: 'vc-top' }, verdictPill(x.verdict), whoPill(x.who),
        h('span', { class: 'vc-when mono', text: `${fcSpan(x)} · said ${dayMonthYear(x.said)} · ${topicName(x.topic)}${x.prob ? ` · they gave it ${x.prob}%` : ''}` }),
        x.on ? h('span', { class: 'vc-on mono', text: `Judged ${dayMonthYear(x.on)}` }) : null),
      h('p', { class: 'vc-t', text: x.claim }),
      row('In their words', h('p', { class: 'mq', text: `\u201c${x.quote}\u201d` }),
        h('p', { class: 'note' }, `${personName(x.who)}, ${x.where}. `, outLink(x.source.url, `${x.source.outlet} \u2197`))),
      row('The test', h('p', { text: x.test })),
      row('What happened', h('p', { text: x.finding || 'The date they gave has passed. The verdict will be written against its test, from the evidence, within a few days.' })),
      (x.evidence || []).length ? row('Sources', h('ul', { class: 'vc-src' }, x.evidence.map(evidenceItem))) : null,
      (x.was || []).length ? h('details', { class: 'vc-was' }, h('summary', { text: 'Earlier verdicts' }),
        h('ul', null, x.was.map(w => h('li', null, `${VERDICT[w.verdict] ? VERDICT[w.verdict].label : w.verdict}${w.on ? ` (${dayMonthYear(w.on)})` : ''}${w.finding ? `: ${w.finding}` : ''}`)))) : null,
      p ? row('The Guide', h('p', null, h('a', { href: forecastHref(p), text: p.t }), h('small', { class: 'mono', text: ` · ${when(p)} · ${odds(p)}` }))) : null);
  }

  // ------------------------------------------------------------------ which path are we on?
  // paths.json: four questions that decide the future, where each forecaster (and the Guide) stands on them, today's evidence
  // reading of each, and the named paths those make, weighed by the forecasters' odds and then by the evidence.
  const CONF = { low: 'low confidence', medium: 'medium confidence', high: 'high confidence' };
  function renderPaths() {
    const sec = $('paths'), P = state.paths;
    if (!sec) return;
    sec.hidden = !P;
    if (!P) return;
    const top = P.paths[0], second = P.paths[1], hist = P.history || [];
    const last = hist.length ? hist[hist.length - 1].on : null;
    const prev = last ? hist.slice().reverse().find(x => daysBetween(x.on, last) >= 7) : null;
    const was = prev && prev.p ? prev.p[top.id] : null;
    const voices = (P.voices || []).length;
    $('pathsIntro').textContent = `The Guide and ${voices - 1} leading forecasters take sides on four questions that decide what happens next. Today's evidence is read on each question, and the paths their answers make are weighed by their odds and then by the evidence, updated as both change.`;
    $('pathsLead').replaceChildren(
      h('span', { class: 'k mono', text: 'The path we appear to be on' }),
      h('h3', { text: top.name }),
      h('p', null, `${top.share_posterior}% of the named paths once today's evidence is in, against ${top.share_prior}% on the forecasters' odds alone`,
        second ? `; next comes ${second.name} at ${second.share_posterior}%` : '', '.', was != null ? ` A week ago: ${was}%.` : ''),
      h('p', { class: 'note', text: top.summary }));
    const dims = new Map(P.dimensions.map(d => [d.id, d]));
    $('pathsDims').replaceChildren(...P.dimensions.map(dimCard));
    $('pathsList').replaceChildren(...P.paths.map((p, i) => pathCard(p, i, dims)));
    $('pathsMethod').textContent = P.method;
  }
  function dimCard(d) {
    const r = d.reading;
    const bar = (cls, v) => { const i = h('i'); i.style.width = `${Math.max(0, Math.min(100, v))}%`; return h('span', { class: `bar ${cls}` }, i); };
    return h('div', { class: 'dim', id: `dim-${d.id}` },
      h('h3', { text: d.name }), h('p', { class: 'q', text: d.question }),
      h('div', { class: 'states' }, d.states.map(s => h('div', { class: `st${r.state === s.id ? ' read' : ''}` },
        r.state === s.id ? h('span', { class: 'here mono', text: `The evidence now · ${CONF[r.confidence] || ''}` }) : null,
        h('span', { class: 'nm', text: s.name }),
        h('span', { class: 'pc mono', text: `Forecasters ${Math.round(s.prior)}% \u2192 with the evidence ${Math.round(s.posterior)}%` }),
        bar('prior', s.prior), bar('post', s.posterior),
        h('span', { class: 'desc', text: s.desc }),
        s.voices.length ? h('span', { class: 'vs' }, s.voices.map(v => h('span', { text: personName(v) }))) : h('span', { class: 'vs none', text: 'No one tracked says this' })))),
      h('p', { class: 'why' }, h('b', { text: r.state ? 'Why: ' : 'Not yet readable: ' }), r.why),
      (r.evidence || []).length ? h('p', { class: 'src mono' }, r.evidence.map(e => (e.story
        ? h('a', { href: `#/ep/${e.on}/${e.story}`, text: `${e.title} (EP.${pad3(e.ep)})` })
        : outLink(e.url, `${e.outlet}, ${dayMonthYear(e.date)} \u2197`)))) : null);
  }
  function pathCard(p, i, dims) {
    const pc = v => (v >= 1 ? `${Math.round(v)}%` : '<1%');
    return h('li', { class: `path${i === 0 ? ' top' : ''}`, id: `path-${p.id}` },
      h('div', { class: 'sh' }, pc(p.share_posterior), h('small', { class: 'mono', text: `forecasters alone ${pc(p.share_prior)}` })),
      h('div', null,
        h('h3', { text: p.name }), h('p', { class: 'sum', text: p.summary }),
        h('div', { class: 'pills' }, Object.entries(p.states).map(([k, v]) => {
          const d = dims.get(k), s = d.states.find(x => x.id === v), ok = d.reading.state === v;
          return h('span', { class: ok ? 'ok' : '', text: `${d.name}: ${s.name}${ok ? ' \u2713' : ''}` });
        })),
        h('p', { class: 'meta2 mono', text: [`Matches ${p.fit[0]} of ${p.fit[1]} evidence readings`, p.examples.join(' · '),
          p.holders.length ? `Consistent with what ${p.holders.map(personName).join(', ')} ${p.holders.length === 1 ? 'has' : 'have'} said` : ''].filter(Boolean).join(' · ') }),
        p.signposts.length ? h('details', { class: 'signs' }, h('summary', { text: 'Signposts to watch' }),
          h('ul', null, p.signposts.map(s => h('li', null,
            h('a', { href: s.kind === 'item' ? `#/predictions/${s.id}` : `#/forecasts/${s.id}`, text: s.kind === 'item' ? `${personName(s.who)}: ${s.label}` : `The Guide: ${s.label}` }),
            h('small', { class: 'mono', text: ` · ${s.kind === 'item' ? ymLabel(s.by) : s.when}${s.verdict && VERDICT[s.verdict] ? ` · ${VERDICT[s.verdict].label.toLowerCase()}` : ''}` }))))) : null));
  }

  // ------------------------------------------------------------------ benchmarks
  // daily/data/benchmarks.json (engine\build\benchmarks.py, refreshed every day by the site sync): the frontier models on the
  // benchmarks that matter most, from Artificial Analysis and Epoch AI, each score the model's best across its reasoning-effort
  // settings; each model's parameters (the lab's own figure, else LifeArchitect.ai's, "est." when estimated), context window,
  // price and system card; and each benchmark's state of the art over time, across every model the sources score.
  const bench = { col: 'aa-index', dir: -1 };
  const SRC_NAME = { aa: 'Artificial Analysis', epoch: 'Epoch AI' };
  const EFFORT = { max: 'max', xhigh: 'extra-high', high: 'high', medium: 'medium', low: 'low', minimal: 'minimal' };
  function bfmt(b, v) {
    if (v == null) return '\u2014';
    if (b.fmt === 'pct') return `${(v * 100).toFixed(1)}%`;
    if (b.fmt === 'elo') return String(Math.round(v));
    return v.toFixed(1);
  }
  const bsize = x => (x >= 1000 ? `${(x / 1000).toFixed(x % 1000 ? 1 : 0)}T` : `${Math.round(x)}B`);
  const bctx = x => (x >= 1e6 ? `${(x / 1e6).toFixed(x % 1e6 ? 1 : 0)}M` : `${Math.round(x / 1000)}K`);
  const bmonth = iso => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
  const bprice = p => (p && p[0] != null ? `$${+p[0]}/$${+p[1]}` : '\u2014');
  // the state of the art as a step line, from 2024 (or its first score) to today
  function spark(b) {
    const pts = (b.history || []).filter(p => p[0]);
    if (pts.length < 2) return null;
    const t = s => Date.parse(`${s}T00:00:00Z`);
    const x0 = t(pts[0][0]), x1 = Math.max(Date.now(), t(pts[pts.length - 1][0]) + 1);
    const vals = pts.map(p => p[1]);
    const lo = b.fmt === 'pct' ? 0 : Math.min(...vals), hi = b.fmt === 'pct' ? 1 : Math.max(...vals);
    const X = s => ((t(s) - x0) / (x1 - x0)) * 100, Y = v => 30 - ((v - lo) / ((hi - lo) || 1)) * 28;
    const xy = [];
    pts.forEach((p, i) => {
      if (i) xy.push(`${X(p[0]).toFixed(2)},${Y(pts[i - 1][1]).toFixed(2)}`);
      xy.push(`${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`);
    });
    xy.push(`100,${Y(pts[pts.length - 1][1]).toFixed(2)}`);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', '0 0 100 31'); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `State of the art since ${bmonth(pts[0][0])}: from ${bfmt(b, pts[0][1])} to ${bfmt(b, pts[pts.length - 1][1])}`);
    const area = document.createElementNS(NS, 'polygon');
    area.setAttribute('class', 'ar'); area.setAttribute('points', `0,31 ${xy.join(' ')} 100,31`);
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('class', 'ln'); line.setAttribute('points', xy.join(' '));
    svg.append(area, line);
    return svg;
  }
  function sotaCard(b, onBoard) {
    const s = b.sota, ceil = b.fmt === 'pct' && s.value >= 0.9;
    const leader = onBoard.get(s.model);
    return h('div', { class: 'sota-card', id: `bb-${b.id}` },
      h('span', { class: 'k', text: b.group }),
      h('h4', { text: b.name }),
      h('div', { class: 'v' }, bfmt(b, s.value), ceil ? h('span', { class: 'ceil', text: s.value >= 0.995 ? 'At its ceiling' : 'Near its ceiling' }) : null),
      h('p', { class: 'who' }, leader ? h('a', { href: `#/benchmarks/${leader.id}`, text: s.model }) : s.model, s.date ? ` \u00b7 ${bmonth(s.date)}` : ''),
      spark(b),
      b.year_ago != null ? h('p', { class: 'ago', text: `A year ago the best was ${bfmt(b, b.year_ago)}` }) : h('p', { class: 'ago', text: `Scored on ${b.scored} models by ${SRC_NAME[b.src]} so far` }),
      h('p', { class: 'desc', text: b.desc }),
      h('p', { class: 'src' }, `${SRC_NAME[b.src]} \u00b7 `, outLink(b.url, 'About it \u2197')));
  }
  function benchCol(b) {
    // a header may break between the words run together in a benchmark's name ("Frontier|Math 1-3", "Simple|QA")
    return { id: b.id, label: b.short.replace(/^(Frontier|Simple)(?=[A-Z])/, '$1\u200b'), title: b.name, val: m => (m.scores[b.id] || {}).v, b };
  }
  function renderBenchmarks() {
    const sec = $('benchmarks'), B = state.bench;
    if (!sec) return;
    sec.hidden = !B;
    if (!B) return;
    const onBoard = new Map(B.models.map(m => [m.name, m]));
    $('benchSota').replaceChildren(...B.benchmarks.map(b => sotaCard(b, onBoard)));
    const groups = [];
    B.benchmarks.forEach(b => { const g = groups[groups.length - 1]; if (g && g.name === b.group) g.n += 1; else groups.push({ name: b.group, n: 1 }); });
    const cols = [
      { id: 'params', label: 'Parameters', title: 'Total parameters (and active per token)', val: m => (m.params ? m.params.total : null), plain: true },
      { id: 'ctx', label: 'Context', title: 'Context window, tokens', val: m => m.context, plain: true },
      { id: 'price', label: 'Price', title: 'US dollars per million input / output tokens', val: m => (m.price && m.price[1] != null ? m.price[1] : null), low: true },
      ...B.benchmarks.map(benchCol)];
    const col = cols.find(c => c.id === bench.col) || cols[3];
    const models = B.models.slice().sort((a, b) => {
      const va = col.val(a), vb = col.val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * bench.dir;
    });
    const best = new Map(cols.map(c => {
      const vs = B.models.map(c.val).filter(v => v != null);
      return [c.id, vs.length ? (c.low ? Math.min(...vs) : Math.max(...vs)) : null];
    }));
    const sortBtn = c => h('button', {
      type: 'button', class: bench.col === c.id && bench.dir === 1 ? 'asc' : '', 'aria-pressed': String(bench.col === c.id), title: `${c.title}: sort`,
      onclick: () => { if (bench.col === c.id) bench.dir = -bench.dir; else { bench.col = c.id; bench.dir = c.low ? 1 : -1; } renderBenchmarks(); },
    }, c.label);
    const grpStart = new Set();
    let at = 0;
    groups.forEach(g => { grpStart.add(B.benchmarks[at].id); at += g.n; });
    const head = h('thead', null,
      h('tr', { class: 'grp' }, h('th', { class: 'm', rowspan: '2', scope: 'col' }, h('span', { text: 'Model' })),
        h('th', { colspan: '3', scope: 'colgroup', text: 'Size and cost' }),
        groups.map(g => h('th', { colspan: String(g.n), scope: 'colgroup', text: g.name }))),
      h('tr', null, cols.map(c => h('th', { scope: 'col', class: grpStart.has(c.id) || c.id === 'params' ? 'grp-start' : '' }, sortBtn(c)))));
    const cell = (c, m) => {
      const v = c.val(m), top = !c.plain && v != null && v === best.get(c.id) && B.models.filter(x => c.val(x) != null).length > 1;
      const cls = [v == null ? 'na' : '', top ? 'best' : '', grpStart.has(c.id) || c.id === 'params' ? 'grp-start' : ''].filter(Boolean).join(' ');
      if (c.id === 'params') {
        const p = m.params;
        if (!p) return h('td', { class: cls, title: 'Not disclosed by the lab, and no published estimate' }, h('span', { class: 'num', text: '\u2014' }), h('span', { class: 'sub', text: 'undisclosed' }));
        return h('td', { class: cls, title: p.by === 'lab' ? `Stated by the lab${p.title ? `: ${p.title}` : ''}` : `LifeArchitect.ai Models Table${p.est ? ': an estimate' : ''}` },
          h('span', { class: 'num', text: bsize(p.total) }),
          h('span', { class: 'by' }, outLink(p.url, p.by === 'lab' ? 'lab' : p.est ? 'est.' : 'LA')),
          p.active ? h('span', { class: 'sub', text: `${bsize(p.active)} active` }) : null);
      }
      if (c.id === 'ctx') return h('td', { class: cls }, h('span', { class: 'num', text: v ? bctx(v) : '\u2014' }));
      if (c.id === 'price') return h('td', { class: cls, title: 'US dollars per million input / output tokens (Artificial Analysis)' }, h('span', { class: 'num', text: bprice(m.price) }));
      const s = m.scores[c.id], b = c.b;
      if (!s) return h('td', { class: cls, title: `Not yet scored by ${SRC_NAME[b.src]}` }, h('span', { class: 'num', text: '\u2014' }));
      const tip = [`${m.name}: ${bfmt(b, s.v)} on ${b.name}`, s.set ? `at ${EFFORT[s.set] || s.set} reasoning effort` : '', SRC_NAME[b.src],
        s.ci ? `90% interval ${s.ci[0].toFixed(1)}\u2013${s.ci[1].toFixed(1)}` : ''].filter(Boolean).join(' \u00b7 ');
      return h('td', { class: cls, title: tip }, h('span', { class: 'num', text: bfmt(b, s.v) }));
    };
    const rows = models.map(m => h('tr', { id: `bm-${m.id}` },
      h('th', { class: 'm', scope: 'row' },
        h('span', { class: 'mname', text: m.name }), m.open ? h('span', { class: 'chip', text: 'Open weights' }) : null,
        h('span', { class: 'mmeta' }, [m.lab, bmonth(m.released)].filter(Boolean).join(' \u00b7 '), m.card ? ' \u00b7 ' : '',
          m.card ? h('a', { href: m.card.url, target: '_blank', rel: 'noopener', title: m.card.title, text: /model card/i.test(m.card.title) ? 'Model card \u2197' : /system card/i.test(m.card.title) ? 'System card \u2197' : 'Announcement \u2197' }) : null),
        m.note ? h('span', { class: 'mnote', text: m.note }) : null),
      cols.map(c => cell(c, m))));
    $('benchTable').replaceChildren(head, h('tbody', null, rows));
    const f = B.fetched || {};
    const pulled = ['aa', 'epoch', 'la'].map(k => (f[k] ? `${B.sources[k].name} ${dayMonthYear(f[k].slice(0, 10))}` : null)).filter(Boolean).join(' \u00b7 ');
    $('benchCount').textContent = `${B.models.length} models \u00b7 ${B.benchmarks.length} benchmarks \u00b7 sorted by ${col.title}${bench.dir === 1 ? ' (lowest first)' : ''} \u00b7 tap a heading to sort`;
    $('benchNotes').replaceChildren(
      'Each score is the model\u2019s best across its reasoning-effort settings; hover over it for which one and where it\u2019s from. ',
      outLink(B.sources.aa.url, 'Artificial Analysis'), ' runs its evaluations the same way on every model, and ',
      outLink(B.sources.epoch.url, 'Epoch AI'), ' runs or compiles the rest (its data is shared under CC BY 4.0); a dash means that source hasn\u2019t scored the model yet. ',
      'Parameters are the lab\u2019s own figure where it gives one (\u201clab\u201d); otherwise they come from the ', outLink(B.sources.la.url, 'LifeArchitect.ai Models Table'),
      ' (\u201cLA\u201d), marked \u201cest.\u201d where they\u2019re its estimate: most labs don\u2019t disclose their models\u2019 size. Prices are from Artificial Analysis. ',
      'The state of the art is the best score any model has posted, on this board or not; for Epoch AI\u2019s long-running benchmarks its line shows the climb since early 2024. ',
      'Every model links to its system card or model card. Pulled fresh every day: ', pulled, '.');
  }

  function verdictCard(d) {
    const p = state.byId.get(d.id), test = (state.score.tests[d.id] || {}).test, r = trackerFor(p.id);
    const row = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const news = r ? h('details', { class: 'vc-news' }, h('summary', { text: `${r.items.length} ${r.items.length === 1 ? 'story' : 'stories'} in ${theShows()} on this forecast` })) : null;
    if (news) news.addEventListener('toggle', () => { if (news.open && !news.dataset.filled) { news.dataset.filled = '1'; news.append(trail(r)); } });
    return h('li', { class: `vc ${d.verdict}`, id: `v-${p.id}` },
      h('div', { class: 'vc-top' },
        verdictPill(d.verdict),
        h('span', { class: 'vc-when mono', text: `Best guess ${when(p)} · window ${windowText(p)}${d.closed ? ' (closed)' : ''} · ${odds(p)} · ${domainName(p.d)}` }),
        d.on ? h('span', { class: 'vc-on mono', text: `Judged ${dayMonthYear(d.on)}` }) : null),
      h('p', { class: 'vc-t', text: p.t }),
      test ? row('The test', h('p', { text: test })) : null,
      row('What happened', h('p', { text: d.finding || 'Its month has passed. The verdict will be written against its test, from the evidence, within a few days.' })),
      (d.evidence || []).length ? row('Sources', h('ul', { class: 'vc-src' }, d.evidence.map(evidenceItem))) : null,
      (d.was || []).length ? h('details', { class: 'vc-was' }, h('summary', { text: 'Earlier verdicts' }),
        h('ul', null, d.was.map(w => h('li', null, `${VERDICT[w.verdict] ? VERDICT[w.verdict].label : w.verdict}${w.on ? ` (${dayMonthYear(w.on)})` : ''}${w.finding ? `: ${w.finding}` : ''}`)))) : null,
      revisionNote(p),
      news);
  }

  function evidenceItem(x) {
    if (x.story) {
      return h('li', null, h('a', { href: `#/ep/${x.on}/${x.story}`, text: x.title }),
        h('small', { text: ` · the show, EP.${pad3(x.ep)}${x.outlet ? `, via ${x.outlet}` : ''}` }));
    }
    return h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener', text: `${x.title} ↗` }),
      h('small', { text: ` · ${x.outlet}${x.date ? `, ${dayMonthYear(x.date)}` : ''}` }));
  }

  function renderSoon(ids) {
    const box = $('soonBox');
    box.hidden = !ids.length;
    if (!ids.length) return;
    box.replaceChildren(h('h3', { class: 'sub-h', text: 'Falling due next' }),
      h('p', { class: 'section-sub', text: 'These forecasts reach their best-guess month soon. Their tests are set now, before the outcome is known.' }),
      h('ol', { class: 'soon-list' }, ids.map(id => {
        const p = state.byId.get(id), test = (state.score.tests[id] || {}).test;
        return h('li', null,
          h('a', { class: 'soon-f', href: `#/forecasts/${p.id}` }, h('span', { class: 'mono', text: `${when(p)} · window ${windowText(p)} · ${odds(p)}` }), h('b', { text: p.t })),
          test ? h('p', { text: test }) : null);
      })));
  }

  // ------------------------------------------------------------------ revisions: what changed in the forecasts
  function revChange(r) {
    if (r.kind === 'prob') return { dir: r.to > r.from ? 'up' : 'down', text: `${r.from}% → ${r.to}%` };
    if (r.kind === 'month') return { dir: '', text: `${ymLabel(r.from)} → ${ymLabel(r.to)}` };
    if (r.kind === 'dated') return { dir: '', text: `Dated: around ${String(r.to).slice(0, 4)}` };
    if (r.kind === 'wording') return { dir: '', text: 'Reworded' };
    if (r.kind === 'added') return { dir: '', text: 'New forecast' };
    if (r.kind === 'removed') return { dir: '', text: 'Retired' };
    return { dir: r.dir || '', text: r.dir === 'up' ? `Raised to ${r.to}%` : r.dir === 'down' ? `Lowered to ${r.to}%` : 'Revised' };
  }
  function revisionsOf(p) { return state.revs.items.filter(r => r.id === p.id || r.key === p.key); }
  function revisionNote(p) {
    const revs = revisionsOf(p);
    if (!revs.length) return null;
    return h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: 'Odds history' }), h('ul', { class: 'odds-h' }, revs.map(r => {
      const c = revChange(r);
      return h('li', null, h('span', { class: `rev-c ${c.dir}`, text: `${c.dir === 'up' ? '▲ ' : c.dir === 'down' ? '▼ ' : ''}${c.text}` }), ` on ${dayMonthYear(r.on)}`,
        r.note ? h('details', { class: 'rev-why' }, h('summary', { text: 'Why' }), h('p', { text: r.note })) : null);
    })));
  }
  function renderRevisions() {
    const items = state.revs.items;
    const thisMonth = (state.score.month || (state.index.latest || '').slice(0, 7));
    const inMonth = items.filter(r => (r.on || '').slice(0, 7) === thisMonth).length;
    const last = items[0];
    $('changesIntro').textContent = `The Guide's odds move only when Peter revises them, and its dates only when he does or when the daily date review finds verified news that a best guess has clearly moved; every revision is dated, with its reason. ${inMonth
      ? `${inMonth} revision${inMonth === 1 ? '' : 's'} so far this month.`
      : last ? `Nothing revised so far this month; the latest revisions were on ${dayMonthYear(last.on)}.` : 'No revisions recorded yet.'}`;
    const groups = new Map();
    for (const r of items) {
      const k = (r.on || '').slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    $('revisionList').replaceChildren(...[...groups].map(([k, rows]) => h('li', { class: 'rev-m' },
      h('h4', { class: 'mono', text: `${LONG_MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)} · ${rows.length} revision${rows.length === 1 ? '' : 's'}` }),
      h('ol', null, rows.map(revRow)))));
    const b = state.revs.basis;
    $('basisBox').hidden = !(b && b.text);
    if (b && b.text) {
      $('basisSum').textContent = `Read the Guide's latest reassessment note${b.on ? ` (${dayMonthYear(b.on)})` : ''}`;
      $('basisText').textContent = b.text;
    }
  }
  function revRow(r) {
    const p = state.byId.get(r.id) && state.byId.get(r.id).key === r.key ? state.byId.get(r.id) : state.byKey.get(r.key);
    const c = revChange(r);
    return h('li', { class: 'rev' },
      h('span', { class: 'rev-d mono', text: short(r.on) }),
      h('span', { class: `rev-c ${c.dir}`, text: `${c.dir === 'up' ? '▲ ' : c.dir === 'down' ? '▼ ' : ''}${c.text}` }),
      h('div', { class: 'rev-b' },
        p ? h('a', { href: forecastHref(p), text: p.t }) : h('span', { text: r.t }),
        p ? h('small', { class: 'mono', text: ` ${when(p)}${isDue(p) ? ` · judged: ${VERDICT[verdictOf(p)].label.toLowerCase()}` : ''}` }) : null,
        r.was ? h('p', { class: 'rev-was', text: `Was: ${r.was}` }) : null,
        r.note ? h('details', { class: 'rev-why' }, h('summary', { text: 'Why' }), h('p', { text: r.note })) : null));
  }

  // ------------------------------------------------------------------ predictions vs reality: the live forecasts, year by year
  function totals(items) {
    const t = { supports: 0, early: 0, challenges: 0, withNews: 0 };
    for (const p of items) {
      const r = trackerFor(p.id);
      if (!r) continue;
      t.withNews += 1;
      for (const k of Object.keys(REL)) t[k] += r[k] || 0;
    }
    return t;
  }

  function renderScoreboard() {
    const live = liveItems(), t = totals(live);
    const many = (k, one, more) => (k === 1 ? one : more);
    const tiles = [
      h('div', { class: 'tile hot' }, h('b', { text: `${t.withNews}/${live.length}` }), h('span', { text: `live forecasts with news in ${theShows()}` })),
      h('div', { class: 'tile' }, h('b', { text: String(t.supports) }), h('span', { text: many(t.supports, 'story is evidence for a forecast', 'stories are evidence for a forecast') })),
      h('div', { class: 'tile' }, h('b', { text: String(t.early) }), h('span', { text: many(t.early, 'early sign', 'early signs') })),
      h('div', { class: 'tile' }, h('b', { text: String(t.challenges) }), h('span', { text: many(t.challenges, 'story is evidence against one', 'stories are evidence against one') })),
    ];
    const doms = Object.keys(state.preds.domains || {}).map(d => {
      const all = live.filter(p => p.d === d);
      const hit = all.filter(p => trackerFor(p.id)).length;
      const fill = h('i');
      fill.style.width = `${all.length ? Math.round((hit / all.length) * 100) : 0}%`; // CSSOM, allowed by the page's CSP
      return h('button', { type: 'button', class: 'dom', 'aria-pressed': String(state.filters.domain === d), onclick: () => setDomain(state.filters.domain === d ? 'all' : d) },
        h('span', { class: 'name', text: domainName(d) }),
        h('span', { class: 'bar' }, fill),
        h('span', { class: 'num', text: `${hit} of ${all.length} with news` }));
    });
    $('scoreboard').replaceChildren(...tiles, h('div', { class: 'domains' }, doms));
    const dated = live.filter(p => p.kind === 'dated'), first = dated.slice().sort((a, b) => order(a) - order(b))[0];
    const eps = state.index.episodes.length, due = state.score.due.length, thEps = thOn() ? state.th.episodes || 0 : 0;
    $('forecastIntro').textContent = `The Guide's ${dated.length} live dated forecasts, from ${first ? when(first) : 'now'} to 2040, plus ${live.length - dated.length} beyond superintelligence, dated on the condition that aligned superintelligence and their prerequisites arrive first, each with its best-guess date, its odds and, for the dated ones, the test it will be judged against. Every morning, each story in ${thEps ? 'the Singularity Daily and the Transhuman Daily' : 'the show'} is checked against them, across ${eps} episode${eps === 1 ? '' : 's'}${thEps ? ` of the Singularity Daily and ${thEps} of the Transhuman Daily` : ''} so far.${due ? ` ${due} more ${due === 1 ? 'has' : 'have'} fallen due or come true and ${due === 1 ? 'is' : 'are'} judged in What it got right or wrong.` : ''}${fcLive().length ? ` Alongside them, in the year each gave, ${fcLive().length} dated predictions from ${state.people.size} leading forecasters, from Elon Musk and Ray Kurzweil to the AI 2027 team, in their own words and judged the same way once their date has passed.` : ''}`;
  }
  const order = p => (p.kind === 'horizon' ? 1e7 + (p.year ? (p.year * 12 + (p.m || 6)) * 100 : 0) : (p.year * 12 + (p.m || 12)) * 100) + (state.order.get(p.id) || 0);

  function renderMoving() {
    const latest = state.index.latest;
    const scored = [];
    for (const p of liveItems()) {
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
      h('span', { class: 'latest', text: `Latest: ${recent[0].title} (${itemEp(recent[0])})` }),
      h('span', { class: 'tally' }, tallyPills(r)))));
  }

  function tallyPills(r) {
    return Object.keys(REL).filter(k => r[k]).map(k => h('span', { class: `rel ${k}`, title: `${r[k]} × ${REL[k].label.toLowerCase()}` }, h('span', { 'aria-hidden': 'true' }, REL[k].icon), String(r[k])));
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
    $('fs').addEventListener('change', e => { f.view = e.target.value; renderForecasts(); });
    if ($('fw')) $('fw').addEventListener('change', e => { f.who = e.target.value; renderForecasts(); });
    fillWho();
  }
  // the "Whose" options: everyone, the Guide, every forecaster, then each group and each person who has predictions
  function fillWho() {
    const sel = $('fw');
    if (!sel) return;
    const keep = sel.value || state.filters.who;
    [...sel.querySelectorAll('option[data-dyn]')].forEach(o => o.remove());
    const counts = new Map();
    for (const x of fcItems()) counts.set(x.who, (counts.get(x.who) || 0) + 1);
    const mem = memItems().length;
    const all = sel.querySelector('option[value="all"]');
    if (all) all.textContent = mem ? 'Everyone: the Guide, forecasters and members' : 'The Guide and the forecasters';
    if (mem) sel.append(h('option', { value: 'members', 'data-dyn': '1', text: `Transhumanism Australia members (${mem})` }));
    for (const [g, name] of Object.entries((state.fc && state.fc.groups) || {})) sel.append(h('option', { value: `group:${g}`, 'data-dyn': '1', text: name }));
    [...state.people.values()].filter(p => counts.get(p.id)).sort((a, b) => a.name.localeCompare(b.name))
      .forEach(p => sel.append(h('option', { value: `person:${p.id}`, 'data-dyn': '1', text: `${p.name} (${counts.get(p.id)})` })));
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : 'all';
    state.filters.who = sel.value;
  }
  function setDomain(d) {
    state.filters.domain = d;
    $('fd').value = d;
    renderScoreboard();
    renderForecasts();
  }
  function clearFilters() {
    Object.assign(state.filters, { q: '', domain: 'all', rel: 'all', view: 'year', who: 'all' });
    $('fq').value = ''; $('fd').value = 'all'; $('fr').value = 'all'; $('fs').value = 'year';
    if ($('fw')) $('fw').value = 'all';
    renderScoreboard();
    renderForecasts();
  }

  function forecastRows() {
    const f = state.filters;
    if (f.who !== 'all' && f.who !== 'guide') return [];
    const words = f.q ? f.q.split(/\s+/) : [];
    const keep = liveItems().map(p => ({ p, r: trackerFor(p.id) })).filter(({ p, r }) => {
      if (f.domain !== 'all' && p.d !== f.domain) return false;
      if (f.rel === 'none' ? r : f.rel !== 'all' && !(r && r[f.rel])) return false;
      if (f.view !== 'year' && !r && f.rel !== 'none' && !words.length) return false;
      if (words.length) {
        const test = (state.score.tests[p.id] || {}).test || '';
        const hay = `${p.t} ${domainName(p.d)} ${when(p)} ${test} ${r ? r.items.map(i => i.title).join(' ') : ''}`.toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
    const total = r => (r ? r.supports + r.early + r.challenges : 0);
    keep.sort((a, b) => {
      if (f.view === 'most') return total(b.r) - total(a.r) || order(a.p) - order(b.p);
      if (f.view === 'latest') return ((b.r && b.r.last) || '').localeCompare((a.r && a.r.last) || '') || total(b.r) - total(a.r) || order(a.p) - order(b.p);
      return order(a.p) - order(b.p);
    });
    return keep;
  }

  // the forecasters' predictions still to come, for the year-by-year view: only when no domain or signal filter is on
  function fcRows() {
    const f = state.filters;
    if (f.who === 'guide' || f.domain !== 'all' || f.rel !== 'all' || f.view !== 'year') return [];
    const words = f.q ? f.q.split(/\s+/) : [];
    return fcLive().filter(x => whoMatches(x) && (!words.length || words.every(w =>
      `${x.claim} ${x.quote} ${x.when} ${x.where} ${topicName(x.topic)} ${personName(x.who)} ${ymLabel(x.by)}`.toLowerCase().includes(w))));
  }

  function renderForecasts() {
    const f = state.filters, rows = forecastRows(), host = $('forecastList'), live = liveItems(), fc = fcRows(), mem = memRows();
    const filtered = Boolean(f.q) || f.domain !== 'all' || f.rel !== 'all' || f.who !== 'all';
    const fcAll = fcLive().filter(whoMatches).length;
    const memAll = memItems().length;
    const fcText = (fcLive().length && f.view === 'year' && f.who === 'all' ? ` · ${fc.length} of ${fcLive().length} from leading forecasters` : '')
      + (memAll && f.view === 'year' && f.who === 'all' ? ` · ${mem.length} from members` : '');
    const dueN = fcDue().filter(whoMatches).length;
    $('forecastCount').textContent = f.who === 'members'
      ? `Showing ${mem.length} of ${memAll} predictions from Transhumanism Australia members, in the year they gave · their own, not the Guide\u2019s`
      : onlyForecasters()
      ? `Showing ${fc.length} of ${fcAll} predictions still to come from ${whoLabel()}, in the year they gave · ${dueN} more ${dueN === 1 ? 'has' : 'have'} fallen due (What it got right or wrong)`
      : `Showing ${rows.length} of ${live.length} live forecasts · ${rows.filter(x => x.r).length} with news${fcText}${f.view === 'year' ? ' · open a year to read it' : ''}`;
    if (!rows.length && !fc.length && !mem.length) { host.replaceChildren(h('p', { class: 'empty', text: onlyForecasters() && f.view !== 'year' ? 'These predictions show in the year-by-year view.' : 'No forecasts match. Try another search or filter.' })); return; }
    if (f.view !== 'year') { host.replaceChildren(h('ol', { class: 'forecasts' }, rows.map(({ p, r }) => forecastRow(p, r)))); return; }
    const wasOpen = new Set([...host.querySelectorAll('details.yr[open]')].map(d => d.dataset.year));
    const first = !host.dataset.ready;
    host.dataset.ready = '1';
    const now = Number((state.score.month || state.index.latest || '').slice(0, 4));
    const groups = new Map(), fgroups = new Map(), mgroups = new Map();
    for (const x of rows) {
      const k = x.p.kind === 'horizon' ? 'beyond' : String(x.p.year);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    for (const x of fc) {
      const k = fcYear(x);
      if (!groups.has(k)) groups.set(k, []);
      if (!fgroups.has(k)) fgroups.set(k, []);
      fgroups.get(k).push(x);
    }
    for (const x of mem) {
      const k = memYear(x);
      if (!groups.has(k)) groups.set(k, []);
      if (!mgroups.has(k)) mgroups.set(k, []);
      mgroups.get(k).push(x);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === 'beyond') - (b === 'beyond') || Number(a) - Number(b));
    host.replaceChildren(...keys.map(k => yearGroup(k, groups.get(k),
      filtered || (first ? k !== 'beyond' && Number(k) <= now + 1 : wasOpen.has(k)), fgroups.get(k) || [], mgroups.get(k) || [])));
  }

  function yearGroup(k, list, isOpen, fc = [], mem = []) {
    const beyond = k === 'beyond', sum = { supports: 0, early: 0, challenges: 0 };
    let withNews = 0;
    for (const { r } of list) {
      if (!r) continue;
      withNews += 1;
      for (const rel of Object.keys(REL)) sum[rel] += r[rel] || 0;
    }
    const note = beyond
      ? [list.length ? 'Beyond superintelligence. Each horizon is conditional: its best-guess date says when it could arrive if aligned superintelligence and every prerequisite listed with it arrive first, with a window of several years either side, and its probability assumes the same.' : '',
        fc.length ? 'After them, leading forecasters\u2019 predictions dated after 2040, in their own words.' : '',
        mem.length ? 'And members\u2019 own predictions dated after 2040.' : ''].filter(Boolean).join(' ')
      : (state.preds.years || {})[k];
    const count = [list.length ? (beyond ? `${list.length} conditional horizon${list.length === 1 ? '' : 's'}` : `${list.length} live forecast${list.length === 1 ? '' : 's'}`) : '',
      fc.length ? `${fc.length} from leading forecasters` : '', mem.length ? `${mem.length} from members` : ''].filter(Boolean).join(' · ');
    const rows = [...list.map(({ p, r }) => ({ o: order(p), el: () => forecastRow(p, r) })),
      ...fc.map(x => ({ o: (beyond ? 2e7 : 0) + fcOrder(x), el: () => fcRow(x) })),
      ...mem.map(x => ({ o: (beyond ? 2e7 : 0) + memOrder(x), el: () => memRow(x) }))].sort((a, b) => a.o - b.o);
    const det = h('details', { class: `yr${beyond ? ' beyond' : ''}`, id: `y-${k}`, 'data-year': k });
    det.open = isOpen;
    det.append(
      h('summary', null,
        h('span', { class: 'y', text: beyond ? 'Beyond' : k }),
        h('span', { class: 'yc' }, count,
          h('small', { text: withNews ? `${withNews} with news from ${theShows()}` : list.length ? `No news from ${theShows()} yet` : fc.length ? 'Leading forecasters\u2019 predictions' : 'Members\u2019 predictions' })),
        h('span', { class: 'tally' }, tallyPills(sum))),
      note ? h('p', { class: 'ysum', text: note }) : null,
      h('ol', { class: 'forecasts' }, rows.map(x => x.el())));
    return det;
  }

  function fcRow(x) {
    const det = h('details', { class: 'fc ext', id: `m-${x.id}` });
    det.append(h('summary', null,
      h('span', { class: 'meta' }, h('span', { class: 'fy', text: ymLabel(x.by).toUpperCase() }),
        h('span', { class: 'pr', text: `${x.prob ? `${x.prob}% · ` : ''}said ${ymLabel(x.said.slice(0, 7))}` })),
      h('span', { class: 'tx' }, x.claim, h('small', null, `${personName(x.who)} · ${topicName(x.topic)}${x.until ? ` · at the latest ${ymLabel(x.until)}` : ''}`)),
      h('span', { class: 'sig' }, whoPill(x.who))));
    det.addEventListener('toggle', () => {
      if (det.open && !det.dataset.filled) {
        det.dataset.filled = '1';
        det.append(fcBody(x));
      }
    });
    return h('li', null, det);
  }

  function fcBody(x) {
    const fact = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const p = x.forecast ? state.byId.get(x.forecast) : null, who = state.people.get(x.who) || {};
    return h('div', { class: 'fc-body' },
      fact('In their words', h('p', { class: 'mq', text: `\u201c${x.quote}\u201d` }),
        h('p', { class: 'note' }, `${personName(x.who)}${who.role ? `, ${who.role}` : ''}. Said ${dayMonthYear(x.said)}, ${x.where}. `, outLink(x.source.url, `${x.source.outlet} \u2197`),
          x.primary ? [' · ', outLink(x.primary, 'The original \u2197')] : null)),
      fact('When', h('p', { text: `${fcSpan(x)}. In their words: \u201c${x.when}\u201d.${x.prob ? ` They put ${x.prob}% on it.` : ''}` })),
      fact('The test', h('p', { text: x.test }), h('p', { class: 'note', text: `Written ${dayMonthYear(x.added)}, when it was added here; it is judged once the date they gave has passed.` })),
      x.latest ? fact('Latest', h('p', { text: x.latest.text }),
        h('p', { class: 'note' }, `${dayMonthYear(x.latest.date)} · `, outLink(x.latest.url, `${x.latest.outlet} \u2197`))) : null,
      p ? fact('The Guide', h('p', null, h('a', { href: forecastHref(p), text: p.t }),
        h('small', { class: 'mono', text: ` · ${when(p)} · ${odds(p)}${isDue(p) ? ` · judged: ${VERDICT[verdictOf(p)].label.toLowerCase()}` : ''}` }))) : null,
      h('div', { class: 'fc-foot' }, h('a', { href: fcHref(x), text: 'Link to this prediction' }), h('a', { href: `#/people/${x.who}`, text: `All of ${personName(x.who)}\u2019s predictions` })));
  }

  function forecastRow(p, r) {
    const det = h('details', { class: `fc${r ? '' : ' quiet'}`, id: `f-${p.id}` });
    const lastRev = revisionsOf(p)[0];
    const fresh = lastRev && daysBetween(lastRev.on, state.index.latest) <= 45;
    det.append(h('summary', null,
      h('span', { class: 'meta' }, h('span', { class: 'fy', text: when(p).toUpperCase() }), h('span', { class: 'pr', text: [spread(p), odds(p)].filter(Boolean).join(' · ') })),
      h('span', { class: 'tx' }, p.t, h('small', null, domainName(p.d), fresh ? h('span', { class: 'revtag', text: ` · revised ${short(lastRev.on)}` }) : null)),
      h('span', { class: 'sig' }, r ? h('span', { class: 'tally' }, tallyPills(r)) : h('span', { class: 'pr mono', text: 'No news yet' }), strip(r))));
    det.addEventListener('toggle', () => {
      if (det.open && !det.dataset.filled) {
        det.dataset.filled = '1';
        det.append(forecastBody(p, r));
      }
    });
    return h('li', null, det);
  }

  function forecastBody(p, r) {
    const test = state.score.tests[p.id];
    const fact = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const list = xs => h('ul', null, xs.map(x => h('li', { text: x })));
    return h('div', { class: 'fc-body' },
      test ? fact('The test', h('p', { text: test.test }), test.stale ? h('p', { class: 'note', text: 'Written for an earlier wording of this forecast; it will be rewritten.' }) : null) : null,
      p.kind === 'dated' ? fact('When', h('p', { text: `Best guess ${LONG_MONTHS[p.m - 1]} ${p.year}${p.band ? `, give or take ${p.band} months (window ${windowText(p)})` : ''}.${p.why ? ` Why then: ${p.why}` : ''}` })) : null,
      p.kind === 'horizon' && p.year ? fact('When', h('p', { text: `If aligned superintelligence and every prerequisite below arrive first: best guess around ${p.year}${p.band ? `, give or take ${Math.round(p.band / 12)} years (${windowText(p)})` : ''}.${p.why ? ` Why then: ${p.why}` : ''}` })) : null,
      p.deps ? fact('Depends on', list(p.deps)) : null,
      p.signs ? fact('Signs to watch', list(p.signs)) : null,
      p.caveat ? fact('Caveat', h('p', { text: p.caveat })) : null,
      fcFor(p.id).length ? fact('Others\u2019 forecasts', h('ul', null, fcFor(p.id).map(x => h('li', null, h('b', { text: `${personName(x.who)}: ` }), h('a', { href: fcHref(x), text: x.claim }),
        h('small', { class: 'mono', text: ` · said ${dayMonthYear(x.said)}${x.prob ? ` · ${x.prob}%` : ''}${x.verdict && x.verdict !== 'pending' ? ` · ${VERDICT[x.verdict].label.toLowerCase()}` : ''}` }))))) : null,
      revisionNote(p),
      r ? trail(r) : h('p', { class: 'empty', text: `No story in ${theShows()} has been linked to this forecast yet.` }),
      h('div', { class: 'fc-foot' }, h('a', { href: `#/forecasts/${p.id}`, text: 'Link to this forecast' })));
  }

  function trail(r) {
    return h('ol', { class: 'trail' }, r.items.map(i => h('li', null,
      h('div', { class: 'd' }, `${short(i.on)} · ${itemEp(i)}`, h('br'), relPill(i.relation)),
      h('div', null,
        h('div', { class: 'h' }, h('a', { href: itemHref(i), text: i.title })),
        h('div', { class: 'w', text: i.note + (i.revised ? ' (The forecast\u2019s wording has been revised since.)' : '') }),
        h('div', { class: 'o' }, i.url ? h('a', { href: i.url, target: '_blank', rel: 'noopener', text: `${i.outlet || 'Source'} ↗` }) : (i.outlet || ''), i.date ? ` · ${short(i.date)}` : '')))));
  }

  function openForecast(id) {
    const p = state.byId.get(id);
    if (p && isDue(p)) return openVerdict(id);
    let el = $(`f-${id}`);
    if (!el || state.filters.view !== 'year') {
      clearFilters();
      el = $(`f-${id}`);
    }
    if (!el) return null;
    const yr = el.closest('details.yr');
    if (yr) yr.open = true;
    el.open = true;
    flash(el);
    return el;
  }
  function openYear(k) {
    let y = $(`y-${k}`);
    if (!y || state.filters.view !== 'year') {
      clearFilters();
      y = $(`y-${k}`);
    }
    if (!y) return $('forecasts');
    y.open = true;
    flash(y);
    return y;
  }
  function openVerdict(id) {
    const el = $(`v-${id}`);
    if (!el) return $('scorecard');
    flash(el);
    return el;
  }
  // #/forecasters: the timeline with only the leading forecasters' predictions; #/people/<id>: one person's; #/musk: Elon
  // Musk's (the first one tracked); #/predictions/<id> (or #/musk/<id>): one prediction, wherever it is now
  function showWho(who) {
    clearFilters();
    if ($('fw') && ![...$('fw').options].some(o => o.value === who)) who = 'others';
    state.filters.who = who;
    if ($('fw')) $('fw').value = who;
    renderForecasts();
    return $('forecasts');
  }
  function openFc(id) {
    const x = state.fcById.get(id);
    if (!x) return $('forecasts');
    if (fcJudged(x)) {
      const v = $(`mv-${id}`);
      if (v) flash(v);
      return v || $('scorecard');
    }
    let el = $(`m-${id}`);
    if (!el) {
      clearFilters();
      el = $(`m-${id}`);
    }
    if (!el) return $('forecasts');
    const yr = el.closest('details.yr');
    if (yr) yr.open = true;
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

  // ------------------------------------------------------------------ the guide
  // The Guide's chapters, year summaries, horizon prerequisites and author notes are read live from its published page
  // and data (same origin on peterxing.com), so this page always shows the current text. Its forecasts, year notes and
  // horizons come from this site's own snapshot, shown in Predictions vs reality.
  const GUIDE_LIVE = onPeterxing || host === 'localhost' || host === '127.0.0.1';
  const ROUTES = { capability: 'Capability', abundance: 'Abundance', risk: 'Risk' };
  const guide = { ready: null, failed: false, chapters: [] };
  let readerAt = -1, titleBefore = '', readerDocTitle = '';
  const routeOf = s => (/abundance/i.test(s) ? 'abundance' : /risk/i.test(s) ? 'risk' : /capability/i.test(s) ? 'capability' : '');
  const txt = el => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('br').forEach(b => b.replaceWith(' '));
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const dec = s => String(s == null ? '' : s).replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, n) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" })[n]);
  const safeHttps = u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch (e) { return null; } };

  async function getLive(path, asText) {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined;
    const r = await fetch(path, { cache: 'no-cache', signal });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return asText ? r.text() : r.json();
  }

  function ensureGuide() {
    if (!guide.ready || (guide.failed && GUIDE_LIVE)) {
      guide.failed = false;
      guide.ready = loadGuide();
      guide.ready.catch(() => { guide.failed = true; });
    }
    return guide.ready;
  }
  async function loadGuide() {
    setGuideStatus('Loading the chapters from the Guide\u2026');
    try {
      if (!GUIDE_LIVE) throw new Error('the Guide loads on peterxing.com');
      const [page, author] = await Promise.allSettled([getLive('/guide', true), getLive('/author.json')]);
      if (author.status === 'fulfilled') {
        try { renderAuthor(author.value); } catch (e) { /* the static author note stands */ }
      }
      if (page.status !== 'fulfilled') throw page.reason;
      readGuidePage(page.value);
      renderBook();
      setGuideStatus('');
      return true;
    } catch (e) {
      setGuideStatus(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }
  function setGuideStatus(v) {
    const el = $('guideStatus');
    if (!v) { el.hidden = true; return; }
    el.hidden = false;
    if (v instanceof Error) {
      el.replaceChildren('The chapters didn\u2019t load. ', GUIDE_LIVE
        ? h('button', { type: 'button', class: 'linkish', onclick: () => ensureGuide().catch(() => {}), text: 'Try again' })
        : h('a', { href: `${SITE}#/guide/read`, text: 'Read them on peterxing.com \u2197' }));
    } else el.textContent = v;
  }

  function readGuidePage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const chapters = [...doc.querySelectorAll('#bookSource > article[data-idx]')].map(a => ({
      idx: Number(a.dataset.idx), kicker: txt(a.querySelector('.reader-eyebrow')), route: routeOf(txt(a.querySelector('.reader-route'))),
      title: txt(a.querySelector('h1')), lede: txt(a.querySelector('.lede')), mins: Math.max(1, Math.round(txt(a).split(' ').length / 230)), node: a,
    })).filter(c => Number.isInteger(c.idx) && c.title).sort((a, b) => a.idx - b.idx);
    if (!chapters.length) throw new Error('no chapters in the Guide page');
    guide.chapters = chapters;
    const tag = txt(doc.getElementById('heroTitle'));
    if (tag) $('guideTag').textContent = tag;
    const deck = txt(doc.querySelector('.hero-deck'));
    if (deck) $('guideDeck').textContent = deck;
    const key = [...doc.querySelectorAll('.reading-key p')];
    if (key.length) {
      $('guideKey').replaceChildren(...key.map(p => {
        const b = p.querySelector('strong');
        return b ? h('p', null, h('b', { text: txt(b) }), txt(p).slice(txt(b).length).trim()) : h('p', { class: 'note', text: txt(p) });
      }));
    }
  }

  function renderBook() {
    $('chapterList').replaceChildren(...guide.chapters.map((c, i) => h('li', null,
      h('a', { class: `chap ${c.route}`, href: `#/guide/chapter-${c.idx}` },
        h('span', { class: 'k' }, h('span', { text: i === 0 ? 'Start here' : c.kicker }), c.route ? h('span', { class: `route-word ${c.route}`, text: ROUTES[c.route] }) : null),
        h('span', { class: 't', text: c.title }),
        c.lede ? h('span', { class: 'l', text: c.lede }) : null,
        h('span', { class: 'm mono', text: `${c.mins} min read` })))));
    $('readerTocList').replaceChildren(...guide.chapters.map(c => h('li', null, h('a', { href: `#/guide/chapter-${c.idx}`, 'data-idx': String(c.idx), text: c.title }))));
    $('startBook').href = `#/guide/chapter-${guide.chapters[0].idx}`;
    $('startBookT').textContent = guide.chapters[0].title;
    $('startBookN').textContent = `${guide.chapters.length} chapters`;
  }

  function renderAuthor(a) {
    if (!a || typeof a.headline !== 'string' || !Array.isArray(a.bio)) return;
    const talks = (Array.isArray(a.talks) ? a.talks : []).filter(t => t && safeHttps(t.url)).slice(0, 4);
    const roles = (Array.isArray(a.roles) ? a.roles : []).filter(r => r && r.org);
    const li = safeHttps(a.linkedin);
    $('authorBox').replaceChildren(
      h('p', { class: 'author-name', text: dec(a.name || 'Peter Xing') }),
      h('p', { class: 'author-head', text: dec(a.headline) }),
      h('p', { class: 'author-book' }, 'Author of ', h('a', { href: KINDLE, target: '_blank', rel: 'noopener' },
        h('em', { text: "The Hitchhiker's Guide to the Singularity" }), ', out now on Kindle \u2197')),
      roles.length ? h('ul', { class: 'roles' }, roles.map(r => h('li', null, h('b', { text: dec(r.org) }), r.detail ? dec(r.detail) : null))) : null,
      h('div', { class: 'bio' }, a.bio.map(p => h('p', { text: dec(p) }))),
      talks.length ? h('div', { class: 'talks' }, h('h4', { text: 'Recent talks' }), h('ul', null, talks.map(t => h('li', null,
        h('a', { href: safeHttps(t.url), target: '_blank', rel: 'noopener', text: `${dec(t.title)} \u2197` }),
        h('small', { text: [dec(t.venue), t.year].filter(Boolean).join(' \u00b7 ') }))))) : null,
      li ? h('p', null, h('a', { href: li, target: '_blank', rel: 'noopener', text: 'About Peter on LinkedIn \u2197' })) : null);
  }

  // A chapter is Peter's own text from the Guide. It is copied in as inert nodes, without scripts, handlers or ids,
  // and its links are pointed at their place on this site.
  function chapterNodes(src) {
    const frag = document.createDocumentFragment();
    for (const n of src.childNodes) frag.append(document.importNode(n, true));
    frag.querySelectorAll('script,style,link,meta,base,iframe,frame,object,embed,form,input,button,select,textarea,template,dialog').forEach(n => n.remove());
    frag.querySelectorAll('*').forEach(el => {
      for (const { name, value } of [...el.attributes]) {
        const k = name.toLowerCase();
        if (k.startsWith('on') || k === 'id' || k === 'srcset' || k === 'formaction') el.removeAttribute(name);
        else if (k === 'href' || k === 'src' || k === 'xlink:href') {
          const u = guideLink(value);
          if (u) el.setAttribute(name, u); else el.removeAttribute(name);
        }
      }
      if (el.localName === 'a' && /^https?:/i.test(el.getAttribute('href') || '')) { el.target = '_blank'; el.rel = 'noopener'; }
    });
    return frag;
  }
  function guideLink(v) {
    const s = String(v || '').trim();
    const legacy = (hash, query) => (window.sdLegacy && window.sdLegacy(hash, query)) || '#/guide';
    if (s.startsWith('#')) return /^#\//.test(s) ? s : legacy(s, '');
    let u;
    try { u = new URL(s, SITE); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const ours = /^(www\.)?peterxing\.com$/.test(u.hostname);
    if (ours && /^\/guide\/?$/.test(u.pathname)) return legacy(u.hash, u.search);
    if (ours && /^\/(ai-timeline|game)(\.html)?\/?$/.test(u.pathname)) return null; // pages this site doesn't link to: keep the words, drop the link
    return onPeterxing && u.origin === GUIDE ? `${u.pathname}${u.search}${u.hash}` : u.href;
  }

  function readerEnd(c) {
    const [label, href] = c.route === 'risk' ? ['The futures beyond the timeline', '#/forecasts/beyond'] : ['The forecasts, year by year', '#/forecasts'];
    const last = guide.chapters[guide.chapters.length - 1] === c;
    return h('footer', { class: 'reader-end' }, h('a', { class: 'btn', href, text: label }), h('a', { class: 'btn', href: '#/scorecard', text: 'What it got right or wrong' }),
      h('a', { class: `btn btn-kindle${last ? ' solid' : ''}`, href: KINDLE, target: '_blank', rel: 'noopener', text: 'Get the book on Kindle \u2197' }));
  }
  function setStep(a, c, label) {
    a.hidden = !c;
    if (!c) return;
    a.href = `#/guide/chapter-${c.idx}`;
    a.title = c.title;
    a.textContent = label(clip(c.title, 38));
  }
  function openReader(idx) {
    const dlg = $('reader');
    const pos = guide.chapters.findIndex(c => c.idx === idx);
    if (pos < 0) {
      if (dlg.open) dlg.close();
      history.replaceState(null, '', '#/guide/read');
      toast('That chapter isn\u2019t in the Guide.');
      return;
    }
    const c = guide.chapters[pos];
    readerAt = idx;
    $('readerPos').textContent = `${pos + 1} / ${guide.chapters.length}`;
    $('readerTitle').textContent = c.title;
    $('readerBody').replaceChildren(chapterNodes(c.node), readerEnd(c));
    setStep($('readerPrev'), guide.chapters[pos - 1], t => `\u2190 ${t}`);
    setStep($('readerNext'), guide.chapters[pos + 1], t => `${t} \u2192`);
    $('readerToc').open = false;
    $('readerTocList').querySelectorAll('a').forEach(a => a.setAttribute('aria-current', String(Number(a.dataset.idx) === idx)));
    if (!dlg.open) {
      titleBefore = document.title;
      document.documentElement.classList.add('reading');
      dlg.showModal();
    }
    dlg.scrollTop = 0;
    // Focus the text, so Space and the arrow keys read on rather than pressing a button.
    $('readerBody').focus({ preventScroll: true });
    document.title = readerDocTitle = `${c.title} \u00b7 The Hitchhiker\u2019s Guide to the Singularity`;
  }
  function closeReader() {
    if ($('reader').open) $('reader').close();
  }
  function readerClosed() {
    document.documentElement.classList.remove('reading');
    if (titleBefore && document.title === readerDocTitle) document.title = titleBefore;
    const card = document.querySelector(`.chap[href="#/guide/chapter-${readerAt}"]`);
    readerAt = -1;
    if (!/^#\/guide\/chapter-/.test(location.hash)) return; // closed by navigating somewhere else, which owns scroll and focus
    // Closed from the reader itself (button, Esc or the backdrop): back to the chapter list without a new history entry.
    history.replaceState(null, '', '#/guide/read');
    if (card) {
      card.scrollIntoView({ block: 'nearest' });
      card.focus({ preventScroll: true });
    }
  }
  function wireReader() {
    const dlg = $('reader');
    $('readerClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', readerClosed);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.target.closest && e.target.closest('input,select,textarea'))) return;
      const step = e.key === 'ArrowLeft' ? $('readerPrev') : e.key === 'ArrowRight' ? $('readerNext') : null;
      if (step && !step.hidden) { e.preventDefault(); location.hash = step.getAttribute('href'); }
    });
  }

  function guideRoute(sub) {
    ensureGuide().catch(() => {});
    const ch = /^chapter-(\d+)$/.exec(sub || '');
    if (ch) {
      const want = location.hash, idx = Number(ch[1]);
      guide.ready.then(() => { if (location.hash === want) openReader(idx); }, () => {
        if (location.hash !== want) return;
        history.replaceState(null, '', '#/guide/read');
        toast('That chapter didn\u2019t load.', GUIDE_LIVE ? { label: 'Try again', href: want } : { label: 'Read it on peterxing.com', href: `${SITE}${want}` });
      });
      return firstRoute ? $('guide-read') : null;
    }
    // The timeline and the horizons moved into Predictions vs reality.
    const moved = sub === 'timeline' ? '' : sub === 'beyond' ? 'beyond' : /^\d{4}$/.test(sub || '') ? sub : null;
    if (moved !== null) {
      history.replaceState(null, '', `#/forecasts${moved ? `/${moved}` : ''}`);
      return moved ? openYear(moved) : $('forecasts');
    }
    return (sub && $(`guide-${sub}`)) || $('guide');
  }

  function watchGuide() {
    if (!('IntersectionObserver' in window)) { ensureGuide().catch(() => {}); return; }
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      ensureGuide().catch(() => {});
    }, { rootMargin: '900px 0px' });
    io.observe($('guide'));
  }

  // ------------------------------------------------------------------ routing
  // A link lands on its section and holds it there while the page above is still filling in (the Guide's chapters load
  // as they come near; the Microsoft for Education Daily line under Start here appears once its episode loads), which
  // would otherwise leave the reader short of a section near the end of the page. Links from elsewhere land at once and
  // links on the page scroll there. The reader's own scroll, tap or key lets go, as does time, and a reader who started
  // scrolling while the page loaded stays put.
  const HOLD_MS = 15000;
  const LET_GO = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  let scrolled = false, letGo = null;
  ['wheel', 'touchmove'].forEach(t => addEventListener(t, () => { scrolled = true; }, { capture: true, passive: true, once: true }));
  function jump(el, how) {
    try { el.scrollIntoView({ block: 'start', behavior: how }); } catch (e) { el.scrollIntoView(true); }
  }
  function land(el, instant) {
    if (letGo) letGo();
    const main = $('main');
    let height = 0, timer = 0, done = false;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (done || main.offsetHeight === height) return;
      height = main.offsetHeight;
      jump(el, 'instant');
    }) : null;
    const stop = () => {
      if (done) return;
      done = true;
      if (letGo === stop) letGo = null;
      clearTimeout(timer);
      if (ro) ro.disconnect();
      LET_GO.forEach(t => removeEventListener(t, stop, true));
    };
    letGo = stop;
    LET_GO.forEach(t => addEventListener(t, stop, { capture: true, passive: true }));
    requestAnimationFrame(() => {
      if (done) return;
      jump(el, instant ? 'instant' : 'auto');
      height = main.offsetHeight;
      if (ro) ro.observe(main);
      timer = setTimeout(stop, HOLD_MS);
    });
  }
  // the Transhuman Daily's section (th.js) lands a story's own link (#/transhuman/<date>/<story>) on its card once it's drawn
  window.sdLand = el => land(el, firstRoute);

  let firstRoute = true;
  async function route() {
    const hash = location.hash;
    if (hash && hash !== '#' && !hash.startsWith('#/')) return;
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    let date = state.current ? state.current.date : state.index.latest;
    let target = null;
    if (parts[0] === 'ep' && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '')) {
      date = parts[1];
      target = parts[2] ? (parts[2] === 'stories' ? 'stories' : `s-${parts[2]}`) : 'today';
    } else if (parts[0] === 'today') {
      date = state.index.latest;
      target = 'now';
    } else if (['stories', 'forecasts', 'episodes', 'about', 'guide', 'scorecard', 'weekly', 'transhuman', 'education', 'musk', 'forecasters', 'people', 'predictions', 'paths', 'members', 'benchmarks'].includes(parts[0])) {
      target = parts[0];
    } else {
      date = state.index.latest;
      target = firstRoute ? null : 'top';
    }
    if (!(parts[0] === 'guide' && /^chapter-\d+$/.test(parts[1] || ''))) closeReader();
    if (!state.current || state.current.date !== date) {
      try { await showEpisode(date); } catch (e) { toast(`Couldn\u2019t load that episode (${e.message}).`); }
    }
    let el = null;
    if (parts[0] === 'forecasts' && parts[1]) el = /^(\d{4}|beyond)$/.test(parts[1]) ? openYear(parts[1]) : openForecast(parts[1]);
    else if (parts[0] === 'musk') el = parts[1] ? openFc(parts[1]) : showWho('person:elon-musk');
    else if (parts[0] === 'predictions') el = parts[1] ? openFc(parts[1]) : showWho('others');
    else if (parts[0] === 'forecasters') el = showWho(parts[1] ? `group:${parts[1]}` : 'others');
    else if (parts[0] === 'people') el = showWho(parts[1] ? `person:${parts[1]}` : 'others');
    else if (parts[0] === 'paths' && parts[1]) { el = $(`path-${parts[1]}`) || $(`dim-${parts[1]}`) || $('paths'); if (el !== $('paths')) flash(el); }
    else if (parts[0] === 'benchmarks' && parts[1]) { el = $(`bm-${parts[1]}`) || $(`bb-${parts[1]}`) || $('benchmarks'); if (el !== $('benchmarks')) flash(el); }
    else if (parts[0] === 'members' && parts[1] === 'p' && parts[2]) el = await openMember(parts[2]);
    else if (parts[0] === 'members') el = window.SDM ? await SDM.route(parts.slice(1)) : null;
    else if (parts[0] === 'scorecard' && parts[1]) el = parts[1] === 'changes' ? $('changes') : openVerdict(parts[1]);
    else if (parts[0] === 'weekly' && parts[1]) el = openWeek(parts[1]);
    else if (parts[0] === 'guide') el = guideRoute(parts[1]);
    else if (target === 'top') { window.scrollTo({ top: 0 }); }
    else if (target && target.startsWith('s-')) { el = $(target); if (el) flash(el); }
    else if (target === 'now') el = $('today');
    else if (target === 'today' && !firstRoute) el = $('today');
    else if (target && target !== 'today') el = $(target);
    if (letGo) letGo();
    if (el && !(firstRoute && scrolled)) land(el, firstRoute);
    const nav = location.hash.replace(/^#\/?/, '').split('/')[0];
    document.querySelectorAll('.nav a[href^="#/"]').forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === `#/${['ep', 'today'].includes(nav) ? '' : nav}`)));
    firstRoute = false;
  }

  // ------------------------------------------------------------------ sync: new episodes land every morning
  function renderAll() {
    renderPromo(); renderSingularity(); renderStart(); renderEpisodes(); renderWeekly(); renderScorecard(); renderPaths(); renderScoreboard(); renderMoving(); renderForecasts(); renderBenchmarks(); footer();
  }
  async function sync(manual) {
    state.lastSync = Date.now();
    try {
      const index = await getJSON('daily/data/index.json');
      if (index.latest === state.index.latest && index.updated === state.index.updated) {
        // the Transhuman Daily publishes on its own schedule: fold in its new forecast links
        const th = await getOptional('daily/th/data/links.json');
        if (th && th.updated !== (state.th && state.th.updated)) {
          setTracker(state.sdTracker, th);
          renderScoreboard(); renderMoving(); renderForecasts(); renderScorecard();
        }
        return;
      }
      const [preds, tracker, score, revs, weekly, th, fcData, pathsData, benchData] = await Promise.all([getJSON('daily/data/predictions.json'), getJSON('daily/data/tracker.json'),
        getOptional('daily/data/scorecard.json'), getOptional('daily/data/revisions.json'), getOptional('daily/data/weekly.json'), getOptional('daily/th/data/links.json'),
        getOptional('daily/data/forecasters.json'), getOptional('daily/data/paths.json'), getOptional('daily/data/benchmarks.json')]);
      const fresh = index.latest !== state.index.latest;
      state.index = index; setPreds(preds); setTracker(tracker, th); setExtras(score, revs, weekly); setForecasters(fcData, pathsData); setBench(benchData);
      if (window.SDM) SDM.setDomains(state.preds.domains);
      fillWho();
      state.episodes.clear();
      renderAll();
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

  // The header's height, which section links land below (html's scroll-padding-top): it wraps its tabs onto more lines as the
  // window narrows, and on a phone it scrolls away with the page (not sticky), so nothing needs clearing there
  function keepTopHeight() {
    const top = document.querySelector('.top');
    if (!top) return;
    const set = () => document.documentElement.style.setProperty('--top-h', `${getComputedStyle(top).position === 'sticky' ? top.offsetHeight : 0}px`);
    set();
    if (typeof ResizeObserver === 'function') new ResizeObserver(set).observe(top);
    addEventListener('resize', set);
  }

  function wireStatic() {
    $('btnPlay').addEventListener('click', () => {
      const v = $('video');
      $('player').scrollIntoView({ block: 'nearest' });
      v.play().catch(() => v.focus());
    });
    $('startWatch').addEventListener('click', e => {
      // Already showing today's episode: play it right here, inside the click, so browsers allow sound.
      if (!state.current || !state.index || state.current.date !== state.index.latest || !state.current.entry.video) return;
      e.preventDefault();
      $('player').scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('video').play().catch(() => $('video').focus());
    });
    $('btnTranscript').addEventListener('click', () => toggleTranscript());
    $('btnShare').addEventListener('click', share);
    $('video').addEventListener('error', videoFailed);
    wireReader();
  }

  function showLoadError(e) {
    $('singularity').hidden = true;
    $('epKicker').textContent = 'Couldn\u2019t load the show';
    $('epHook').textContent = 'Back in a moment.';
    $('epTldr').replaceChildren(h('li', { text: `The episode data didn\u2019t load (${e.message}).` }));
    $('epStats').replaceChildren(h('button', { type: 'button', class: 'btn', onclick: () => location.reload(), text: 'Try again' }));
  }

  async function init() {
    wireStatic();
    keepTopHeight();
    // members' predictions arrive from the members API on their own time (members.js): fold them into the timeline
    document.addEventListener('sdm:data', () => { if (state.preds) { fillWho(); renderForecasts(); } });
    try {
      const [index, preds, tracker, score, revs, weekly, th, fcData, pathsData, benchData] = await Promise.all([getJSON('daily/data/index.json'), getJSON('daily/data/predictions.json'),
        getJSON('daily/data/tracker.json'), getOptional('daily/data/scorecard.json'), getOptional('daily/data/revisions.json'), getOptional('daily/data/weekly.json'),
        getOptional('daily/th/data/links.json'), getOptional('daily/data/forecasters.json'), getOptional('daily/data/paths.json'), getOptional('daily/data/benchmarks.json')]);
      if (!index.episodes || !index.episodes.length) throw new Error('no episodes yet');
      state.index = index; setPreds(preds); setTracker(tracker, th); setExtras(score, revs, weekly); setForecasters(fcData, pathsData); setBench(benchData);
      if (window.SDM) SDM.setDomains(state.preds.domains);
    } catch (e) {
      showLoadError(e);
      return;
    }
    state.lastSync = Date.now();
    buildFilters();
    renderAll();
    watchGuide();
    await route();
    addEventListener('hashchange', route);
    startSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
