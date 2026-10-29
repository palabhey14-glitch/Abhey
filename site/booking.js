// The one place the booking link lives. Every element marked data-book on
// the site points here.
window.REWIRED_BOOKING_URL = 'https://calendly.com/coaching-abheyrewired/30min';
document.querySelectorAll('[data-book]').forEach((a) => {
  a.href = window.REWIRED_BOOKING_URL;
  a.target = '_blank';
  a.rel = 'noopener';
});

// The Stripe payment link behind every "Join now" button (data-join).
window.REWIRED_JOIN_URL = 'https://buy.stripe.com/5kQcMZ6qd8yr6TvgvX0Ny00';
document.querySelectorAll('[data-join]').forEach((a) => {
  a.href = window.REWIRED_JOIN_URL;
});

// The Stripe subscription payment link for Entry Level Guidance (AUD $80 per
// week), behind every data-join-entry button. Paste the link from Stripe
// here. Until then the buttons open an email to Abhey instead, so nobody hits
// a dead checkout.
window.REWIRED_ENTRY_JOIN_URL = 'https://buy.stripe.com/28E14hg0N4iba5HdjL0Ny02';
document.querySelectorAll('[data-join-entry]').forEach((a) => {
  if (window.REWIRED_ENTRY_JOIN_URL) {
    a.href = window.REWIRED_ENTRY_JOIN_URL;
    return;
  }
  a.href = 'mailto:coaching@abheyrewired.com?subject=' + encodeURIComponent('Entry Level Guidance: payment link');
  const note = document.querySelector('[data-join-entry-note]');
  if (note) note.hidden = false;
});
