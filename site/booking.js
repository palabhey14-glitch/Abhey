// The one place the booking link lives. Every element marked data-book on
// the site points here.
window.REWIRED_BOOKING_URL = 'https://calendly.com/coaching-abheyrewired/30min';
document.querySelectorAll('[data-book]').forEach((a) => {
  a.href = window.REWIRED_BOOKING_URL;
  a.target = '_blank';
  a.rel = 'noopener';
});
