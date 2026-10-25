/* Runs before the page renders.
   1. The show's address is peterxing.com. The GitHub Pages copy only hosts its files (peterxing.com proxies them), so a
      visitor who lands on peterxing.github.io is sent to the real address. Add ?stay to the URL to look at the copy itself.
   2. peterxing.com now opens on the Daily, so links made for the Guide's homepage (peterxing.com/#chapter-3,
      /#event-2027-1, /?fd=economic, and "/" from the AI timeline or the game) are forwarded to the Guide at /guide,
      on load and when the hash changes. */
(function () {
  var host = location.hostname;
  if (host === 'peterxing.github.io' && !/[?&]stay(=|&|$)/.test(location.search || '')) {
    location.replace('https://peterxing.com/' + (location.search || '') + (location.hash || ''));
    return;
  }
  var onPeterxing = /(^|\.)peterxing\.com$/.test(host) || /post-agi-planning/.test(host);
  // The AI timeline's "Back to the field guide" and the game's header link point at "/", which on peterxing.com is now
  // the Daily; a visitor arriving from those pages wants the Guide.
  if (onPeterxing && !location.hash && /^https:\/\/(www\.)?peterxing\.com\/(ai-timeline|game)(\.html)?([?#]|$)/.test(document.referrer || '')) {
    location.replace('/guide' + (location.search || ''));
    return;
  }
  function forward() {
    var h = location.hash || '', q = location.search || '';
    var own = h === '' || h === '#' || /^#\//.test(h) || /^#(main|top)$/.test(h);
    var guideHash = /^#(chapter-|timeline|month-|year-|event-|article-|horizon-|post-superintelligence|news-timeline|signals|explore|read|about|author|planner|watchlist|simulator|portfolio|field-notes|book|toc)/.test(h);
    var guideQuery = /[?&](fd|fb|fp|ft|fc|fq)=/.test(q);
    if (guideQuery || guideHash || (onPeterxing && !own)) {
      location.replace((onPeterxing ? '/guide' : 'https://peterxing.com/guide') + q + h);
      return true;
    }
    return false;
  }
  if (!forward()) window.addEventListener('hashchange', forward);
})();
