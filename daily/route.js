/* Runs before the page renders.
   1. The show's address is peterxing.com. The GitHub Pages copy only hosts its files (peterxing.com proxies them), so a
      visitor who lands on peterxing.github.io is sent to the real address. Add ?stay to the URL to look at the copy itself.
   2. The Guide lives on this page (#/guide), and its timeline lives in Predictions vs reality (#/forecasts). Links made
      for its old homepage (peterxing.com/#chapter-3, /#event-2027-1, /#year-2030, /#post-superintelligence, /?fd=economic …)
      open the same place here, on load and when the hash changes. */
(function () {
  var host = location.hostname;
  if (host === 'peterxing.github.io' && !/[?&]stay(=|&|$)/.test(location.search || '')) {
    location.replace('https://peterxing.com/' + (location.search || '') + (location.hash || ''));
    return;
  }
  function legacy(h, q) {
    var m;
    if (/^#\//.test(h)) return null;
    if ((m = /^#chapter-(\d+)$/.exec(h))) return '#/guide/chapter-' + m[1];
    if ((m = /^#event-(\d{4}-\d+)$/.exec(h))) return '#/forecasts/' + m[1];
    if ((m = /^#horizon-([\w-]+)$/.exec(h))) return '#/forecasts/horizon-' + m[1];
    if ((m = /^#(?:year|month)-(\d{4})/.exec(h))) return '#/forecasts/' + m[1];
    if (/^#(book|read|toc)$/.test(h)) return '#/guide/read';
    if (/^#post-superintelligence/.test(h)) return '#/forecasts/beyond';
    if (/^#(author|about)$/.test(h)) return '#/guide/author';
    if (/^#(timeline|news-timeline)$/.test(h)) return '#/forecasts';
    if (/^#(reality|scorecard|resolved)$/.test(h)) return '#/scorecard';
    if (/^#(explore|scenario-lab|mission-control|futures|moonshot|observations|engine|signals|article-|planner|watchlist|simulator|portfolio|field-notes|atlasSearch)/.test(h)) return '#/guide';
    if (/[?&](fd|fb|fp|ft|fc|fq)=/.test(q || '')) return '#/forecasts';
    return null;
  }
  window.sdLegacy = legacy;
  function forward() {
    var to = legacy(location.hash || '', location.search || '');
    if (to) location.replace(to);
  }
  forward();
  window.addEventListener('hashchange', forward);
})();
