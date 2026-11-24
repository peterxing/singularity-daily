'use strict';
// Transhumanism Australia members on the timeline. Members sign in with a one-time link to their email, add their own
// dated predictions, and timeline sponsors put their logo on the timeline. The members API (the Vercel project
// peterxing-members) checks membership with Stripe on every sign-in and post, holds predictions and logos for
// approval, and serves the public feed. app.js draws the approved predictions in "Predictions vs reality"; this file
// draws the sponsors' strip, the members' section and the admins' queue. Nothing shows until the API says it's live.
(() => {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = local ? '/api/members' : 'https://peterxing-members.vercel.app/api/members';
  const KEY = 'sdm.session';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
  const safe = u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch (e) { return null; } };
  const ext = (href, text, cls) => (safe(href) ? h('a', { href: safe(href), target: '_blank', rel: 'noopener', class: cls, text }) : h('span', { text }));
  const ymLong = s => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  const dmy = d => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  function money(x) {
    if (!x || x.amount == null) return '';
    const cur = String(x.currency || 'aud').toUpperCase();
    const sym = { AUD: 'A$', USD: 'US$' }[cur] || `${cur} `;
    return `${sym}${x.amount % 100 ? (x.amount / 100).toFixed(2) : x.amount / 100}${x.interval ? ` a ${x.interval}` : ''}`;
  }

  const S = window.SDM = { data: null, live: false, me: null, domains: {}, logoUrl: f => `${API}?a=logo&f=${encodeURIComponent(f)}` };
  let token = null;
  try { token = localStorage.getItem(KEY); } catch (e) { /* storage blocked: sign-in lasts for this page only */ }
  let shown = false, link = null, welcome = false, wantAdmin = false, meLoaded = false, queue = null, notice = '', adminNote = '';
  const setToken = t => { token = t; try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { /* see above */ } };

  async function call(a, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let r;
    try {
      r = await fetch(`${API}?a=${a}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch (e) {
      throw new Error('Couldn\u2019t reach the members service. Check your connection and try again.');
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && token && a !== 'verify') { setToken(null); S.me = null; meLoaded = true; queue = null; paint(); }
    if (!r.ok || j.ok === false) throw new Error(j.error || `Something went wrong (HTTP ${r.status}).`);
    return j;
  }

  async function loadPublic(fresh) {
    try {
      const r = await fetch(`${API}?a=public${fresh ? `&t=${Date.now()}` : ''}`);
      S.data = r.ok ? await r.json() : null;
    } catch (e) {
      S.data = null;
    }
    S.live = Boolean(S.data && S.data.live);
    document.dispatchEvent(new CustomEvent('sdm:data'));
    paint();
  }
  async function loadMe() {
    try { S.me = (await call('me')).me; } catch (e) { S.me = null; }
    meLoaded = true;
    paint();
    if (S.me && S.me.admin && wantAdmin) loadQueue();
  }
  async function loadQueue() {
    if (loadQueue.busy) return;
    loadQueue.busy = true;
    try { queue = await call('queue'); adminNote = ''; } catch (e) { adminNote = e.message; }
    loadQueue.busy = false;
    paintAdmin();
  }
  S.ready = loadPublic().then(() => { if (token && S.data && S.data.signin) return loadMe(); meLoaded = true; return null; });

  // ------------------------------------------------------------------ on the timeline: sponsors' logos and the invitation
  function paintStrip() {
    const el = $('sponsorStrip');
    if (!el) return;
    const list = S.live ? S.data.sponsors || [] : [];
    const offer = S.live && S.data.join && S.data.join.sponsor;
    el.hidden = !(list.length || offer);
    if (el.hidden) return;
    el.replaceChildren(...[
      h('span', { class: 'mono k', text: list.length ? 'Timeline sponsors' : 'Sponsor this timeline' }),
      list.length ? h('span', { class: 'logos' }, list.filter(s => safe(s.url)).map(s => h('a', { href: safe(s.url), target: '_blank', rel: 'sponsored noopener', title: s.name },
        h('img', { src: S.logoUrl(s.logo), alt: s.name, loading: 'lazy', decoding: 'async', height: '32' })))) : null,
      offer ? h('a', { class: 'more', href: '#/members/sponsor', text: list.length ? 'Sponsor it too' : `Put your logo here · ${money(S.data.join.sponsor)}` }) : null].filter(Boolean));
  }
  function paintCta() {
    const el = $('membersCta');
    if (!el) return;
    el.hidden = !S.live;
    if (!S.live) return;
    const n = (S.data.predictions || []).length;
    el.replaceChildren(h('p', null, h('b', { text: 'Your turn. ' }),
      `Members of Transhumanism Australia can put their own dated predictions on this timeline${n ? `: ${n} so far, in green` : ''}. `,
      h('a', { href: '#/members', text: 'Add yours \u2192' })));
  }

  // ------------------------------------------------------------------ the members' section
  function paint() { paintStrip(); paintCta(); paintSection(); }
  function paintSection() {
    const sec = $('members');
    if (!sec) return;
    const d = S.data;
    sec.hidden = !(S.live || (shown && (!d || d.signin || link)));
    if (sec.hidden) return;
    const main = $('membersMain');
    if (!d) { main.replaceChildren(h('p', { class: 'mwarn', text: 'Couldn\u2019t reach the members service just now. Please try again in a minute.' })); return; }
    const kids = [];
    if (!d.live) kids.push(h('p', { class: 'mwarn', text: 'Members\u2019 predictions aren\u2019t open yet: only the site\u2019s admins can sign in while they\u2019re being set up.' }));
    if (notice) { kids.push(h('p', { class: 'mok', role: 'status', text: notice })); notice = ''; }
    if (link) kids.push(linkCard());
    else if (S.me) kids.push(...memberView());
    else if (token && !meLoaded) kids.push(h('p', { class: 'mnote', text: 'Checking your sign-in\u2026' }));
    else kids.push(...signedOut());
    main.replaceChildren(...kids);
    paintAdmin();
  }

  function signedOut() {
    const j = S.data.join || {};
    const note = h('p', { class: 'mnote', role: 'status' });
    const email = h('input', { type: 'email', id: 'mEmail', required: true, autocomplete: 'email', maxlength: '254', placeholder: 'you@example.com' });
    const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Email me a sign-in link' });
    const form = h('form', {
      class: 'mform',
      onsubmit: async e => {
        e.preventDefault();
        btn.disabled = true;
        note.textContent = 'Sending\u2026';
        try { note.textContent = (await call('login', { email: email.value })).message; } catch (err) { note.textContent = err.message; }
        btn.disabled = false;
      },
    }, h('label', { class: 'field' }, h('span', { text: 'The email on your membership' }), email), h('div', { class: 'mrow' }, btn));
    const price = j.member && j.member.amount != null ? ` for ${money(j.member)}${j.member.trial ? `, with your first ${j.member.trial} days free` : ''}` : '';
    const cards = [h('article', { class: 'mcard' },
      welcome ? h('p', { class: 'mok', text: 'Thank you! Now sign in with the email you used at checkout.' }) : null,
      h('h3', { text: 'Members, sign in' }),
      h('p', { text: 'Members of Transhumanism Australia can add their own dated predictions to this timeline, next to the Guide\u2019s and the leading forecasters\u2019. Sign in with the email on your membership and we\u2019ll email you a link: no password needed.' }),
      form, note,
      j.member ? h('p', { class: 'msmall' }, 'Not a member yet? ', ext(j.member.url, 'Join Transhumanism Australia'), `${price}, then come back here and sign in.`) : null)];
    if (j.sponsor) cards.push(sponsorOffer(j.sponsor, false));
    return [h('div', { class: 'mcards' }, cards)];
  }

  function sponsorOffer(s, signedIn) {
    return h('article', { class: 'mcard sponsor', id: 'mSponsor' },
      h('h3', { text: 'Sponsor the timeline' }),
      h('p', { text: 'Put your organisation\u2019s logo and link on the prediction timeline here, in front of everyone who follows the Guide and the Daily. Sponsors are members too, so you can add predictions as well.' }),
      h('p', { class: 'price', text: money(s) }),
      h('div', { class: 'mrow' }, ext(s.url, 'Become a sponsor', 'btn primary')),
      h('p', { class: 'msmall', text: signedIn ? 'Use the email you\u2019re signed in with at checkout, then sign out and back in to upload your logo.' : 'Already a sponsor? Sign in with your email to upload your logo.' }));
  }

  function linkCard() {
    let email = '';
    try { email = JSON.parse(atob(link.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).e || ''; } catch (e) { /* show it without the address */ }
    const note = h('p', { class: 'mnote', role: 'status' });
    const btn = h('button', {
      class: 'btn primary', type: 'button', text: 'Sign in',
      onclick: async () => {
        btn.disabled = true;
        note.textContent = 'Signing in\u2026';
        try {
          const r = await call('verify', { token: link });
          setToken(r.session);
          S.me = r.me;
          meLoaded = true;
          link = null;
          notice = 'You\u2019re signed in.';
          history.replaceState(null, '', '#/members');
          paint();
          if (S.me.admin) loadQueue();
          const sec = $('members');
          if (sec) sec.scrollIntoView({ block: 'start' });
        } catch (err) {
          note.textContent = err.message;
          btn.disabled = false;
        }
      },
    });
    const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { link = null; history.replaceState(null, '', '#/members'); paint(); } });
    return h('div', { class: 'mcards' }, h('article', { class: 'mcard' }, h('h3', { text: 'Finish signing in' }),
      h('p', null, email ? ['Sign in to The Singularity Daily as ', h('b', { text: email }), '?'] : 'Sign in with the link from your email?'),
      h('div', { class: 'mrow' }, btn, cancel), note));
  }

  function memberView() {
    const me = S.me, j = S.data.join || {};
    const tier = { admin: 'Admin', sponsor: 'Timeline sponsor', member: 'Member' }[me.tier] || 'Membership not active';
    const head = h('div', { class: 'mhead' }, h('span', null, 'Signed in as ', h('b', { text: me.email })), h('span', { class: 'who-pill mem', text: tier }),
      h('button', { class: 'linkish', type: 'button', text: 'Sign out', onclick: () => { setToken(null); S.me = null; queue = null; notice = 'You\u2019re signed out.'; paint(); } }));
    const cards = [];
    if (me.tier) cards.push(predictForm());
    else {
      cards.push(h('article', { class: 'mcard' }, h('h3', { text: 'Your membership isn\u2019t active' }),
        h('p', null, 'You can\u2019t add predictions right now. ', j.member ? ext(j.member.url, 'Renew your membership') : 'Renew your membership', ', then sign in again. You can still withdraw yours below.')));
    }
    cards.push(myPredictions());
    if (me.tier === 'sponsor' || me.tier === 'admin') cards.push(sponsorForm());
    else if (j.sponsor) cards.push(sponsorOffer(j.sponsor, true));
    return [head, h('div', { class: 'mcards' }, cards)];
  }

  function predictForm() {
    const me = S.me, now = new Date(), y0 = now.getUTCFullYear();
    const note = h('p', { class: 'mnote', role: 'status' });
    const claim = h('textarea', { id: 'mClaim', rows: '3', maxlength: '240', required: true, placeholder: 'One clear claim someone could check later, e.g. \u201cA humanoid robot is on sale to Australian households for under A$30,000\u201d' });
    const count = h('small', { class: 'mono cnt', text: '0 / 240' });
    claim.addEventListener('input', () => { count.textContent = `${claim.value.length} / 240`; });
    const month = h('select', { id: 'mMonth', 'aria-label': 'Month' }, MONTHS.map((m, i) => h('option', { value: String(i + 1).padStart(2, '0'), text: m })));
    const year = h('select', { id: 'mYear', 'aria-label': 'Year' }, Array.from({ length: 2100 - y0 + 1 }, (_, i) => h('option', { value: String(y0 + i), text: String(y0 + i) })));
    month.value = '12';
    year.value = String(y0 + 2);
    const prob = h('input', { id: 'mProb', type: 'number', min: '1', max: '99', step: '1', inputmode: 'numeric', placeholder: 'e.g. 70' });
    const topic = h('select', { id: 'mTopic' }, h('option', { value: '', text: 'Choose one (optional)' }), Object.entries(S.domains || {}).map(([k, v]) => h('option', { value: k, text: v })));
    const why = h('textarea', { id: 'mWhy', rows: '3', maxlength: '500', placeholder: 'What makes you think so? (optional)' });
    const name = h('input', { id: 'mName', type: 'text', maxlength: '60', required: true, autocomplete: 'name', value: me.name || '' });
    const url = h('input', { id: 'mLink', type: 'url', maxlength: '200', placeholder: 'https:// (optional)', value: me.link || '' });
    const agree = h('input', { id: 'mAgree', type: 'checkbox', required: true });
    const direct = me.moderation === 'post' || me.admin;
    const btn = h('button', { class: 'btn primary', type: 'submit', text: direct ? 'Add it to the timeline' : 'Send it for approval' });
    const form = h('form', {
      class: 'mform',
      onsubmit: async e => {
        e.preventDefault();
        const by = `${year.value}-${month.value}`;
        if (by <= now.toISOString().slice(0, 7)) { note.textContent = 'Choose a month after this one.'; return; }
        btn.disabled = true;
        note.textContent = 'Sending\u2026';
        try {
          const r = await call('predict', { claim: claim.value, by, prob: prob.value === '' ? null : Number(prob.value), topic: topic.value, why: why.value, name: name.value, link: url.value, agree: agree.checked });
          S.me = r.me;
          notice = r.prediction.status === 'live' ? 'It\u2019s on the timeline.' : 'Thank you! It\u2019ll go on the timeline once it\u2019s been checked, usually within a day or two, and we\u2019ll email you when it does.';
          paint();
          if (r.prediction.status === 'live') loadPublic(true);
          const sec = $('members');
          if (sec) sec.scrollIntoView({ block: 'start' });
        } catch (err) {
          note.textContent = err.message;
          btn.disabled = false;
        }
      },
    },
    h('label', { class: 'field' }, h('span', { text: 'Your prediction' }), claim, count),
    h('div', { class: 'mrow' },
      h('div', { class: 'field', role: 'group', 'aria-labelledby': 'mByL' }, h('span', { id: 'mByL', text: 'By the end of' }), h('span', { class: 'pair' }, month, year)),
      h('label', { class: 'field narrow' }, h('span', { text: 'How sure (%)' }), prob)),
    Object.keys(S.domains || {}).length ? h('label', { class: 'field' }, h('span', { text: 'Domain' }), topic) : null,
    h('label', { class: 'field' }, h('span', { text: 'Why (optional)' }), why),
    h('div', { class: 'mrow' },
      h('label', { class: 'field' }, h('span', { text: 'Your name, as shown' }), name),
      h('label', { class: 'field' }, h('span', { text: 'Your link (optional)' }), url)),
    h('label', { class: 'check' }, agree, h('span', { text: 'This is my own prediction, and I\u2019m happy for it to appear publicly on peterxing.com under this name.' })),
    h('div', { class: 'mrow' }, btn),
    direct ? null : h('p', { class: 'msmall', text: 'Every prediction is read before it goes up. Keep it on topic, checkable and civil: no ads, links or claims about named private people.' }));
    return h('article', { class: 'mcard' }, h('h3', { text: 'Add your prediction' }), form, note);
  }

  function myPredictions() {
    const list = (S.me.predictions || []).slice().reverse();
    const note = h('p', { class: 'mnote', role: 'status' });
    const lim = S.me.limits || {};
    return h('article', { class: 'mcard' }, h('h3', { text: 'Your predictions' }),
      list.length ? h('ul', { class: 'mlist' }, list.map(p => h('li', null,
        h('div', { class: 'mono mmeta', text: `By ${ymLong(p.by)}${p.prob ? ` \u00b7 ${p.prob}%` : ''} \u00b7 sent ${dmy(p.posted)}` }),
        h('div', { class: 'mclaim', text: p.claim }),
        h('div', { class: 'mrow' },
          p.status === 'live' ? h('a', { class: 'mstat ok', href: `#/members/p/${p.id}`, text: 'On the timeline' }) : h('span', { class: 'mstat', text: 'Awaiting approval' }),
          h('button', {
            class: 'linkish', type: 'button', text: 'Withdraw',
            onclick: async e => {
              if (!window.confirm('Withdraw this prediction? It comes off the timeline and is deleted.')) return;
              e.target.disabled = true;
              try {
                S.me = (await call('withdraw', { id: p.id })).me;
                notice = 'Withdrawn and deleted.';
                paint();
                if (p.status === 'live') loadPublic(true);
              } catch (err) {
                note.textContent = err.message;
                e.target.disabled = false;
              }
            },
          }))))) : h('p', { class: 'msmall', text: 'None yet. Yours will show here, and whether each is on the timeline.' }),
      note,
      lim.active ? h('p', { class: 'msmall', text: `Up to ${lim.active} at a time, and ${lim.perDay} new ones a day.` }) : null);
  }

  function sponsorForm() {
    const s = S.me.sponsor || {};
    const cur = s.draft || s.live || {};
    const note = h('p', { class: 'mnote', role: 'status' });
    const name = h('input', { id: 'sName', type: 'text', maxlength: '60', required: true, value: cur.name || '' });
    const url = h('input', { id: 'sUrl', type: 'url', maxlength: '200', required: true, placeholder: 'https://', value: cur.url || '' });
    const file = h('input', { id: 'sLogo', type: 'file', accept: 'image/png,image/jpeg,image/webp', required: true });
    const preview = h('img', { class: 'mlogo', alt: 'Your new logo', hidden: true });
    let data = null;
    file.addEventListener('change', () => {
      data = null;
      preview.hidden = true;
      note.textContent = '';
      const f = file.files && file.files[0];
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { note.textContent = 'Choose a PNG, JPEG or WebP image.'; return; }
      if (f.size > 300 * 1024) { note.textContent = 'Your logo must be under 300 KB.'; return; }
      const rd = new FileReader();
      rd.onload = () => { data = String(rd.result); preview.src = data; preview.hidden = false; };
      rd.readAsDataURL(f);
    });
    const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Send it for approval' });
    const form = h('form', {
      class: 'mform',
      onsubmit: async e => {
        e.preventDefault();
        if (!data) { note.textContent = 'Choose your logo first.'; return; }
        btn.disabled = true;
        note.textContent = 'Uploading\u2026';
        try {
          S.me = (await call('sponsor', { name: name.value, url: url.value, logo: data })).me;
          notice = 'Thank you! Your logo goes on the timeline once it\u2019s been checked, and we\u2019ll email you when it does.';
          paint();
        } catch (err) {
          note.textContent = err.message;
          btn.disabled = false;
        }
      },
    },
    h('div', { class: 'mrow' },
      h('label', { class: 'field' }, h('span', { text: 'Organisation' }), name),
      h('label', { class: 'field' }, h('span', { text: 'Website' }), url)),
    h('label', { class: 'field' }, h('span', { text: 'Logo: PNG, JPEG or WebP, under 300 KB' }), file),
    preview,
    h('div', { class: 'mrow' }, btn));
    const status = [];
    if (s.live) {
      status.push(h('p', null, h('span', { class: 'mstat ok', text: s.active === false ? 'Off the timeline' : 'On the timeline' }), ` since ${dmy(s.live.approved)}: ${s.live.name}`));
      if (s.active !== false) status.push(h('img', { class: 'mlogo', src: S.logoUrl(s.live.logo), alt: `${s.live.name} logo` }));
    }
    if (s.active === false) status.push(h('p', { class: 'mwarn', text: 'Your sponsorship isn\u2019t active, so your logo is off the timeline. Renew it and it goes back up within a day.' }));
    if (s.draft) status.push(h('p', null, h('span', { class: 'mstat', text: 'Awaiting approval' }), ` ${s.draft.name}, sent ${dmy(s.draft.submitted)}.`));
    return h('article', { class: 'mcard sponsor', id: 'mSponsor' }, h('h3', { text: 'Your logo on the timeline' }), ...status,
      h('p', { class: 'msmall', text: 'A wide logo on a transparent or white background works best, at least 240 pixels wide. It links to your website. Every logo is checked before it goes up.' }),
      form, note);
  }

  // ------------------------------------------------------------------ admins: approve, reject, take down, set up the sponsor tier
  function paintAdmin() {
    const el = $('membersAdmin');
    if (!el) return;
    if (!(S.me && S.me.admin) || ($('members') && $('members').hidden)) { el.replaceChildren(); return; }
    const kids = [h('h3', { text: 'Admin' })];
    if (adminNote) kids.push(h('p', { class: 'mwarn', role: 'status', text: adminNote }));
    if (!queue) {
      kids.push(h('p', { class: 'msmall', text: 'Loading the queue\u2026' }));
      el.replaceChildren(h('article', { class: 'mcard admin', id: 'mAdmin' }, kids));
      if (!adminNote) loadQueue();
      return;
    }
    const missing = Object.entries({ stripe: 'the Stripe key', member: 'the membership product (from the Payment Link)', email: 'email (Resend)', admins: 'admin emails' })
      .filter(([k]) => queue.ready && !queue.ready[k]).map(([, v]) => v);
    if (missing.length) kids.push(h('p', { class: 'mwarn', text: `Still to set up: ${missing.join(', ')}.` }));
    kids.push(h('div', { class: 'mrow' }, h('button', { class: 'btn', type: 'button', text: 'Refresh', onclick: () => { queue = null; paintAdmin(); } }),
      h('span', { class: 'msmall', text: queue.moderation === 'post' ? 'Members\u2019 predictions go up straight away; take down anything that shouldn\u2019t be there.' : 'Members\u2019 predictions wait here for approval.' })));
    kids.push(tierBlock());
    kids.push(h('h4', { text: `Predictions awaiting approval (${queue.predictions.length})` }));
    kids.push(queue.predictions.length ? h('ul', { class: 'mlist' }, queue.predictions.map(p => h('li', null,
      h('div', { class: 'mono mmeta', text: `By ${ymLong(p.by)}${p.prob ? ` \u00b7 ${p.prob}%` : ''}${p.topic ? ` \u00b7 ${S.domains[p.topic] || p.topic}` : ''} \u00b7 sent ${dmy(p.posted)} \u00b7 ${p.tier}` }),
      h('div', { class: 'mclaim', text: p.claim }),
      p.why ? h('div', { class: 'msmall', text: `Why: ${p.why}` }) : null,
      h('div', { class: 'msmall' }, `${p.name} \u00b7 ${p.email}`, p.link ? [' \u00b7 ', ext(p.link, p.link)] : null),
      h('div', { class: 'mrow' }, act('prediction', p.key, 'approve', 'Approve'), act('prediction', p.key, 'reject', 'Reject'))))) : h('p', { class: 'msmall', text: 'Nothing waiting.' }));
    kids.push(h('h4', { text: `Logos awaiting approval (${queue.sponsors.length})` }));
    kids.push(queue.sponsors.length ? h('ul', { class: 'mlist' }, queue.sponsors.map(s => h('li', null,
      s.preview ? h('img', { class: 'mlogo', src: s.preview, alt: `${s.name} logo` }) : null,
      h('div', { class: 'mclaim', text: s.name }),
      h('div', { class: 'msmall' }, ext(s.url, s.url), ` \u00b7 ${s.email} \u00b7 sent ${dmy(s.submitted)}${s.replacing ? ` \u00b7 replaces the live logo for ${s.replacing}` : ''}`),
      h('div', { class: 'mrow' }, act('sponsor', s.key, 'approve', 'Approve'), act('sponsor', s.key, 'reject', 'Reject'))))) : h('p', { class: 'msmall', text: 'Nothing waiting.' }));
    const live = queue.live || { predictions: [], sponsors: [] };
    kids.push(h('details', { class: 'mlive' }, h('summary', { text: `On the timeline now: ${live.predictions.length} predictions, ${live.sponsors.length} sponsors` }),
      h('ul', { class: 'mlist' },
        live.sponsors.map(s => h('li', null, h('div', { class: 'mclaim', text: `Sponsor: ${s.name}` }), h('div', { class: 'msmall' }, ext(s.url, s.url), ` \u00b7 since ${dmy(s.since)}`),
          h('div', { class: 'mrow' }, act('sponsor', s.key, 'remove', 'Take it down')))),
        live.predictions.map(p => h('li', null, h('div', { class: 'mono mmeta', text: `By ${ymLong(p.by)} \u00b7 ${p.name}` }), h('div', { class: 'mclaim', text: p.claim }),
          h('div', { class: 'mrow' }, act('prediction', p.key, 'remove', 'Take it down')))))));
    el.replaceChildren(h('article', { class: 'mcard admin', id: 'mAdmin' }, kids));
  }

  function act(kind, key, action, label) {
    const b = h('button', {
      class: action === 'approve' ? 'btn primary' : 'btn', type: 'button', text: label,
      onclick: async () => {
        if (action !== 'approve' && !window.confirm(action === 'reject' ? 'Reject this? It will be deleted.' : 'Take this off the timeline? It will be deleted.')) return;
        b.disabled = true;
        try { queue = await call('moderate', { kind, key, action }); adminNote = ''; loadPublic(true); } catch (e) { adminNote = e.message; }
        paintAdmin();
      },
    });
    return b;
  }

  function tierBlock() {
    const t = queue.tiers || {};
    if (t.sponsor && t.sponsor.link) {
      return h('p', { class: 'msmall' }, `Sponsor tier: ${money(t.sponsor)} in Stripe, created ${dmy(t.sponsor.created.slice(0, 10))}. `, ext(t.sponsor.link, 'Its payment link'));
    }
    if (!queue.ready || !queue.ready.stripe) return h('p', { class: 'msmall', text: 'Once the Stripe key is in, you can create the sponsor tier here.' });
    const amount = h('input', { type: 'number', min: '10', max: '10000', step: '1', value: '99', id: 'tAmount' });
    const interval = h('select', { id: 'tInterval' }, h('option', { value: 'month', text: 'a month' }), h('option', { value: 'year', text: 'a year' }));
    const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Create the sponsor tier in Stripe' });
    return h('form', {
      class: 'mform tier',
      onsubmit: async e => {
        e.preventDefault();
        if (!window.confirm(`Create a "Timeline sponsor" product at A$${amount.value} ${interval.value === 'year' ? 'a year' : 'a month'}, with its own payment link, in your Stripe account?`)) return;
        btn.disabled = true;
        try { queue = await call('setup', { amount: Number(amount.value), interval: interval.value }); adminNote = ''; loadPublic(true); } catch (err) { adminNote = err.message; }
        paintAdmin();
      },
    }, h('h4', { text: 'Sponsor tier' }),
    h('div', { class: 'mrow' }, h('label', { class: 'field narrow' }, h('span', { text: 'Price (A$)' }), amount), h('label', { class: 'field narrow' }, h('span', { text: 'Billed' }), interval), btn));
  }

  // #/members, #/members/signin/<token> (the emailed link), #/members/admin, #/members/sponsor, #/members/welcome (after checkout)
  S.route = async parts => {
    shown = true;
    await S.ready;
    welcome = parts[0] === 'welcome';
    wantAdmin = parts[0] === 'admin';
    if (parts[0] === 'signin' && parts[1]) link = parts[1];
    paint();
    if (wantAdmin) return $('mAdmin') || $('members');
    if (parts[0] === 'sponsor') return $('mSponsor') || $('members');
    return $('members');
  };
  // app.js redraws the timeline on 'sdm:data'; it hands over the Guide's domains for the form
  S.setDomains = d => { S.domains = d || {}; };
})();
