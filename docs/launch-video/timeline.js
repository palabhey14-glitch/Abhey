// Shots for film.html. Times in seconds. Captions follow the voiceover script
// (voiceover.md). No labels above lines, no colons.
const D = new Date().toISOString().slice(0, 10);
module.exports = {
  DURATION: 30,
  PHONE_IN: 2.6,
  END_AT: 26.8,
  CAPS: [
    [3.3, 6.3, 'Your whole program.<br><span class="m">Set by me.</span>'],
    [6.6, 11.6, 'Sore shoulder?<br><span class="m">I swap the lift, not the goal.</span>'],
    [11.9, 15.6, 'Biryani counts.<br><span class="m">Log the food you grew up on.</span>'],
    [15.9, 19.6, 'Green when you hit it.<br><span class="m">Amber when you’re close.</span>'],
    [19.9, 23.6, 'Sleep, blood pressure,<br><span class="m">resting heart rate, blood work.</span>'],
    [23.9, 26.6, 'And it’s me<br><span class="m">who replies.</span>'],
  ],
  SHOTS: [
    { at: 0, go: '#home' },
    { at: 4.4, scroll: [4.4, 5.6, 0, 260] },
    { at: 5.6, scroll: [5.6, 6.0, 260, 0] },
    // Training, today's Push day and the shoulder-friendly swap in the plan
    { at: 6.4, tap: '.client-home-actions a', go: `#training/${D}` },
    { at: 7.7, tap: 'a[href="#training/plans"]', go: '#training/plans' },
    { at: 8.3, scroll: [8.3, 9.6, 0, ['.exercise-note', 330]] },
    { at: 10.2, scroll: [10.2, 11.3, ['.exercise-note', 330], ['.training-session-note', 420]] },
    // Nutrition, food log with biryani
    { at: 11.8, go: `#meals/${D}` },
    { at: 12.8, scroll: [12.8, 14.4, 0, ['text:Chicken biryani', 260]] },
    // Habits, green and amber
    { at: 15.8, go: `#habits/${D}` },
    { at: 16.6, scroll: [16.6, 17.6, 0, 120] },
    // Sleep and health markers, same screen further down
    { at: 19.8, scroll: [19.8, 21.4, 120, ['.w-client-health', 60]] },
    { at: 22.0, scroll: [22.0, 23.4, ['.w-client-health', 60], ['.w-client-sleep', 330]] },
    // Messages
    { at: 23.8, go: '#messages' },
  ],
};
