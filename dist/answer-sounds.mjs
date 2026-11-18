const key = 'cet6-answer-sounds-v1';
let settings = {correct:true, wrong:true};
let audio;

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved) settings = {correct:saved.correct !== false, wrong:saved.wrong !== false};
  } catch {}
  return settings;
}

export function initAnswerSoundSettings(panel) {
  const controls = [...panel.querySelectorAll('[data-answer-sound]')];
  for (const control of controls) {
    const kind = control.dataset.answerSound;
    control.checked = readSettings()[kind];
    control.onchange = () => {
      settings = {...readSettings(), [kind]:control.checked};
      try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
    };
  }
}

export function playAnswerSound(correct) {
  if (!readSettings()[correct ? 'correct' : 'wrong']) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    const play = () => {
      const start = audio.currentTime + 0.005;
      const notes = correct ? [659, 880] : [370, 277];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + index * 0.075;
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.085, at + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.085);
        oscillator.start(at);
        oscillator.stop(at + 0.09);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    };
    if (audio.state === 'running') play();
    else audio.resume().then(play).catch(() => {});
  } catch {}
}
