/**
 * Interim static Oohira schedule for the already published Mizuki story.
 * Calendar source was checked on 2026-10-18.
 * This is NOT a live Calendar feed. Remove completed windows from view to avoid
 * representing past availability as upcoming; hide purchase CTA if all are past.
 * Does not send data or affect the existing Umetsu Stripe/realtime integration.
 */
(function () {
  'use strict';
  const list = document.getElementById('ohira-schedule-list');
  const empty = document.getElementById('ohira-no-upcoming');
  const purchase = document.getElementById('ohira-stores-purchase');
  if (!list || !empty || !purchase) return;

  const entries = Array.from(list.querySelectorAll('li[data-end-iso]'));
  function refreshOohiraSchedule() {
    const now = Date.now();
    let upcoming = 0;
    for (const row of entries) {
      const endsAt = Date.parse(row.dataset.endIso || '');
      const available = Number.isFinite(endsAt) && endsAt > now;
      row.style.display = available ? '' : 'none';
      if (available) upcoming++;
    }
    empty.style.display = upcoming ? 'none' : '';
    // No scheduled slot => don't offer an immediate purchase route.
    purchase.style.display = upcoming ? '' : 'none';
  }

  refreshOohiraSchedule();
  window.setInterval(refreshOohiraSchedule, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshOohiraSchedule();
  });
})();
