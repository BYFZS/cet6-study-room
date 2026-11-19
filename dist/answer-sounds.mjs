const key = 'cet6-answer-sounds-v1';
let settings = {correct:true, wrong:true, autoPronounce:false, accent:"en-US", volume:0.8};
let audio;

export function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved) settings = {
      correct:saved.correct !== false,
      wrong:saved.wrong !== false,
      autoPronounce:saved.autoPronounce === true,
      accent:saved.accent === "en-GB" ? "en-GB" : "en-US",
      volume:Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.8
    };
  } catch {}
  return settings;
}

export function initAnswerSoundSettings(panel) {
  const controls = [...panel.querySelectorAll('[data-answer-sound]')];
  const volume = panel.querySelector('[data-sound-volume]');
  const value = panel.querySelector('output');
  const accent = panel.querySelector('#wordAccent');
  accent.onchange = () => update({accent:accent.value});
  function update(patch) {
    settings = {...readSoundSettings(), ...patch};
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
    window.dispatchEvent(new CustomEvent('cet6-sound-change'));
  }
  function follow() {
    const current = readSoundSettings();
    for (const control of controls) control.checked = current[control.dataset.answerSound];
    accent.value = current.accent;
    volume.value = Math.round(current.volume * 100);
    value.value = volume.value + '%';
  }
  for (const control of controls) {
    control.onchange = () => update({[control.dataset.answerSound]:control.checked});
  }
  volume.oninput = () => {
    value.value = volume.value + '%';
    update({volume:Number(volume.value) / 100});
  };
  follow();
  panel.addEventListener('cet6-settings-open', follow);
}

export function playAnswerSound(correct) {
  const preferences = readSoundSettings();
  if (!preferences[correct ? 'correct' : 'wrong'] || !preferences.volume) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    const play = () => {
      const volume = readSoundSettings().volume;
      if (!volume) return;
      const start = audio.currentTime + 0.005;
      const notes = correct ? [659, 880] : [370, 277];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + index * 0.065;
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.21 * volume, at + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.004 * volume, at + 0.085);
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
