/* English text for imported Testbogen questions that shipped only in German.
   The German original stays in qd/od/cd; this only fills qe/oe/ce. */
(function () {
  var map = {
    "2.2.11-001-M": {
      q: "Why must you be especially attentive now?",
      o: [
        "Because traffic is backing up in the road I want to turn into",
        "Because the lorry will slow down considerably while turning",
        "Because the traffic light could change to red"
      ],
      c: "All three answers are correct. You must be especially attentive now because the lorry will slow down considerably while turning, traffic is backing up in the road you want to turn into, and the traffic light could change to red. This is a parent question with variable images and video; the variants used in the real exam are not published."
    }
  };
  (window.__TESTBOEGEN_EXTRA || []).forEach(function (q) {
    var t = map[q.id];
    if (!t) return;
    q.qe = t.q;
    q.oe = t.o.slice();
    q.ce = t.c;
  });
})();
