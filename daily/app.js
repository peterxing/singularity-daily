'use strict';
(() => {
  const SITE = 'https://peterxing.com/';
  const GUIDE = 'https://peterxing.com';
  const PAGES = 'https://peterxing.github.io/singularity-daily/';
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
    current: null, lastSync: 0, filters: { q: '', domain: 'all', rel: 'all', view: 'year' },
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
  const when = p => (p.kind === 'horizon' ? 'Undated' : p.m ? `${MONTHS[p.m - 1]} ${p.year}` : String(p.year));
  const spread = p => (p.kind === 'dated' && p.band ? `±${p.band} mo` : '');
  const windowText = p => {
    if (!p.win) return String(p.year || '');
    const [a, b] = p.win;
    return `${ymLabel(a, a.slice(0, 4) !== b.slice(0, 4))}–${ymLabel(b)}`;
  };
  const odds = p => (p.kind === 'horizon' ? `${p.cond}% conditional` : `${p.prob}%`);
  const domainName = d => (state.preds.domains && state.preds.domains[d]) || d;
  const relPill = (rel, extra) => h('span', { class: `rel ${rel}` }, h('span', { 'aria-hidden': 'true' }, REL[rel].icon), extra != null ? extra : REL[rel].label);
  const verdictPill = v => h('span', { class: `verdict ${v}` }, h('span', { 'aria-hidden': 'true', text: VERDICT[v].icon }), VERDICT[v].label);
  const forecastHref = p => (isDue(p) ? `#/scorecard/${p.id}` : `#/forecasts/${p.id}`);
  const dayMonthYear = iso => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });

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
        ...t.slice(0, 3).map(({ p, rel }) => h('a', { class: 'chip', href: forecastHref(p), title: `${REL[rel].label}: ${p.t}` },
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
    renderRevisions();
  }

  function verdictCard(d) {
    const p = state.byId.get(d.id), test = (state.score.tests[d.id] || {}).test, r = trackerFor(p.id);
    const row = (label, ...kids) => h('div', { class: 'vc-row' }, h('span', { class: 'lab mono', text: label }), h('div', null, ...kids));
    const news = r ? h('details', { class: 'vc-news' }, h('summary', { text: `${r.items.length} ${r.items.length === 1 ? 'story' : 'stories'} in the show on this forecast` })) : null;
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
    $('changesIntro').textContent = `The Guide's odds move only when Peter revises them, and every revision is dated, with its reason. ${inMonth
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
      h('div', { class: 'tile hot' }, h('b', { text: `${t.withNews}/${live.length}` }), h('span', { text: 'live forecasts with news in the show' })),
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
    const eps = state.index.episodes.length, due = state.score.due.length;
    $('forecastIntro').textContent = `The Guide's ${dated.length} live dated forecasts, from ${first ? when(first) : 'now'} to 2040, plus ${live.length - dated.length} undated ones beyond superintelligence, each with its best-guess month, its odds and the test it will be judged against. Every morning, each story in the show is checked against them, across ${eps} episode${eps === 1 ? '' : 's'} so far.${due ? ` ${due} more ${due === 1 ? 'has' : 'have'} fallen due and ${due === 1 ? 'is' : 'are'} judged in What it got right or wrong.` : ''}`;
  }
  const order = p => (p.kind === 'horizon' ? 1e7 : (p.year * 12 + (p.m || 12)) * 100) + (state.order.get(p.id) || 0);

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
      h('span', { class: 'latest', text: `Latest: ${recent[0].title} (EP.${pad3(recent[0].ep)})` }),
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
  }
  function setDomain(d) {
    state.filters.domain = d;
    $('fd').value = d;
    renderScoreboard();
    renderForecasts();
  }
  function clearFilters() {
    Object.assign(state.filters, { q: '', domain: 'all', rel: 'all', view: 'year' });
    $('fq').value = ''; $('fd').value = 'all'; $('fr').value = 'all'; $('fs').value = 'year';
    renderScoreboard();
    renderForecasts();
  }

  function forecastRows() {
    const f = state.filters;
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

  function renderForecasts() {
    const f = state.filters, rows = forecastRows(), host = $('forecastList'), live = liveItems();
    const filtered = Boolean(f.q) || f.domain !== 'all' || f.rel !== 'all';
    $('forecastCount').textContent = `Showing ${rows.length} of ${live.length} live forecasts · ${rows.filter(x => x.r).length} with news${f.view === 'year' ? ' · open a year to read it' : ''}`;
    if (!rows.length) { host.replaceChildren(h('p', { class: 'empty', text: 'No forecasts match. Try another search or filter.' })); return; }
    if (f.view !== 'year') { host.replaceChildren(h('ol', { class: 'forecasts' }, rows.map(({ p, r }) => forecastRow(p, r)))); return; }
    const wasOpen = new Set([...host.querySelectorAll('details.yr[open]')].map(d => d.dataset.year));
    const first = !host.dataset.ready;
    host.dataset.ready = '1';
    const now = Number((state.score.month || state.index.latest || '').slice(0, 4));
    const groups = new Map();
    for (const x of rows) {
      const k = x.p.kind === 'horizon' ? 'beyond' : String(x.p.year);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    host.replaceChildren(...[...groups].map(([k, list]) => yearGroup(k, list,
      filtered || (first ? k !== 'beyond' && Number(k) <= now + 1 : wasOpen.has(k)))));
  }

  function yearGroup(k, list, isOpen) {
    const beyond = k === 'beyond', sum = { supports: 0, early: 0, challenges: 0 };
    let withNews = 0;
    for (const { r } of list) {
      if (!r) continue;
      withNews += 1;
      for (const rel of Object.keys(REL)) sum[rel] += r[rel] || 0;
    }
    const note = beyond
      ? 'Some futures don\u2019t have a date. These horizons are possibilities to examine, not events with an invented year: each probability assumes aligned superintelligence and every prerequisite listed with it.'
      : (state.preds.years || {})[k];
    const det = h('details', { class: `yr${beyond ? ' beyond' : ''}`, id: `y-${k}`, 'data-year': k });
    det.open = isOpen;
    det.append(
      h('summary', null,
        h('span', { class: 'y', text: beyond ? 'Beyond' : k }),
        h('span', { class: 'yc' }, beyond ? `${list.length} undated horizon${list.length === 1 ? '' : 's'}` : `${list.length} live forecast${list.length === 1 ? '' : 's'}`,
          h('small', { text: withNews ? `${withNews} with news from the show` : 'No news from the show yet' })),
        h('span', { class: 'tally' }, tallyPills(sum))),
      note ? h('p', { class: 'ysum', text: note }) : null,
      h('ol', { class: 'forecasts' }, list.map(({ p, r }) => forecastRow(p, r))));
    return det;
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
      p.deps ? fact('Depends on', list(p.deps)) : null,
      p.signs ? fact('Signs to watch', list(p.signs)) : null,
      p.caveat ? fact('Caveat', h('p', { text: p.caveat })) : null,
      revisionNote(p),
      r ? trail(r) : h('p', { class: 'empty', text: 'No story in the show has been linked to this forecast yet.' }),
      h('div', { class: 'fc-foot' }, h('a', { href: `#/forecasts/${p.id}`, text: 'Link to this forecast' })));
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
    return h('footer', { class: 'reader-end' }, h('a', { class: 'btn', href, text: label }), h('a', { class: 'btn', href: '#/scorecard', text: 'What it got right or wrong' }));
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
    } else if (['stories', 'forecasts', 'episodes', 'about', 'guide', 'scorecard', 'weekly'].includes(parts[0])) {
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
    else if (parts[0] === 'scorecard' && parts[1]) el = parts[1] === 'changes' ? $('changes') : openVerdict(parts[1]);
    else if (parts[0] === 'weekly' && parts[1]) el = openWeek(parts[1]);
    else if (parts[0] === 'guide') el = guideRoute(parts[1]);
    else if (target === 'top') { window.scrollTo({ top: 0 }); }
    else if (target && target.startsWith('s-')) { el = $(target); if (el) flash(el); }
    else if (target === 'now') el = $('today');
    else if (target === 'today' && !firstRoute) el = $('today');
    else if (target && target !== 'today') el = $(target);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    const nav = location.hash.replace(/^#\/?/, '').split('/')[0];
    document.querySelectorAll('.nav a[href^="#/"]').forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === `#/${['ep', 'today'].includes(nav) ? '' : nav}`)));
    firstRoute = false;
  }

  // ------------------------------------------------------------------ sync: new episodes land every morning
  function renderAll() {
    renderPromo(); renderStart(); renderEpisodes(); renderWeekly(); renderScorecard(); renderScoreboard(); renderMoving(); renderForecasts(); footer();
  }
  async function sync(manual) {
    state.lastSync = Date.now();
    try {
      const index = await getJSON('daily/data/index.json');
      if (index.latest === state.index.latest && index.updated === state.index.updated) return;
      const [preds, tracker, score, revs, weekly] = await Promise.all([getJSON('daily/data/predictions.json'), getJSON('daily/data/tracker.json'),
        getOptional('daily/data/scorecard.json'), getOptional('daily/data/revisions.json'), getOptional('daily/data/weekly.json')]);
      const fresh = index.latest !== state.index.latest;
      state.index = index; setPreds(preds); state.tracker = tracker; setExtras(score, revs, weekly);
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
    $('epKicker').textContent = 'Couldn\u2019t load the show';
    $('epHook').textContent = 'Back in a moment.';
    $('epTldr').replaceChildren(h('li', { text: `The episode data didn\u2019t load (${e.message}).` }));
    $('epStats').replaceChildren(h('button', { type: 'button', class: 'btn', onclick: () => location.reload(), text: 'Try again' }));
  }

  async function init() {
    wireStatic();
    try {
      const [index, preds, tracker, score, revs, weekly] = await Promise.all([getJSON('daily/data/index.json'), getJSON('daily/data/predictions.json'),
        getJSON('daily/data/tracker.json'), getOptional('daily/data/scorecard.json'), getOptional('daily/data/revisions.json'), getOptional('daily/data/weekly.json')]);
      if (!index.episodes || !index.episodes.length) throw new Error('no episodes yet');
      state.index = index; setPreds(preds); state.tracker = tracker; setExtras(score, revs, weekly);
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
