/* Runs before the page renders. peterxing.com now opens on the Daily, so links made for the Guide's homepage
   (peterxing.com/#chapter-3, /#event-2027-1, /?fd=economic, ...) are forwarded to the Guide at /guide. */
(function () {
  var h = location.hash || '', q = location.search || '';
  var host = location.hostname;
  var onPeterxing = /(^|\.)peterxing\.com$/.test(host) || /post-agi-planning/.test(host);
  var own = h === '' || h === '#' || /^#\//.test(h) || /^#(main|top)$/.test(h);
  var guideHash = /^#(chapter-|timeline|month-|year-|event-|article-|horizon-|post-superintelligence|news-timeline|signals|explore|read|about|author|planner|watchlist|simulator|portfolio|field-notes|book|toc)/.test(h);
  var guideQuery = /[?&](fd|fb|fp|ft|fc|fq)=/.test(q);
  if (guideQuery || guideHash || (onPeterxing && !own)) {
    location.replace((onPeterxing ? '/guide' : 'https://peterxing.com/guide') + q + h);
  }
})();
