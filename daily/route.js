/* Runs before the page renders.
   1. The show's address is peterxing.com. The GitHub Pages copy only hosts its files (peterxing.com proxies them), so a
      visitor who lands on peterxing.github.io is sent to the real address. Add ?stay to the URL to look at the copy itself.
   2. peterxing.com opens on the Daily, and the Guide's chapters, timeline and author now live on this page too (#/guide).
      Links made for the Guide's homepage that point at a chapter or the book (peterxing.com/#chapter-3, /#book) open
      them here; everything else (/#event-2027-1, /?fd=economic, the Guide's tools, and "/" from the AI timeline or the
      game) is forwarded to the full Guide at /guide, on load and when the hash changes. */
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
    var guideQuery = /[?&](fd|fb|fp|ft|fc|fq)=/.test(q);
    var chapter = /^#chapter-(\d+)$/.exec(h);
    if (!guideQuery && (chapter || /^#(book|read|toc)$/.test(h))) {
      location.replace(chapter ? '#/guide/chapter-' + chapter[1] : '#/guide/read');
      return false;
    }
    var own = h === '' || h === '#' || /^#\//.test(h) || /^#(main|top)$/.test(h);
    var guideHash = /^#(chapter-|timeline|month-|year-|event-|article-|horizon-|post-superintelligence|news-timeline|signals|explore|read|about|author|planner|watchlist|simulator|portfolio|field-notes|book|toc)/.test(h);
    if (guideQuery || guideHash || (onPeterxing && !own)) {
      location.replace((onPeterxing ? '/guide' : 'https://peterxing.com/guide') + q + h);
      return true;
    }
    return false;
  }
  if (!forward()) window.addEventListener('hashchange', forward);
})();
