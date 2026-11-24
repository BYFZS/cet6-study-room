const key = 'cet6-answer-sounds-v1';
let settings = {correct:true, wrong:true, autoPronounce:false, accent:"en-US", pronunciationVolume:0.55, effectsVolume:0.85};
let audio;
const volumeValue=(value,fallback)=>Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback;

export function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved) settings = {
      correct:saved.correct !== false,
      wrong:saved.wrong !== false,
      autoPronounce:saved.autoPronounce === true,
      accent:saved.accent === "en-GB" ? "en-GB" : "en-US",
      pronunciationVolume:volumeValue(saved.pronunciationVolume,volumeValue(saved.volume,0.55)),
      effectsVolume:volumeValue(saved.effectsVolume,0.85)
    };
  } catch {}
  return settings;
}

export function initAnswerSoundSettings(panel) {
  const controls = [...panel.querySelectorAll('[data-answer-sound]')];
  const sliders = [...panel.querySelectorAll('[data-sound-volume]')];
  const accents = [...panel.querySelectorAll('[name="wordAccent"]')];
  for (const radio of accents) radio.onchange = () => update({accent:radio.value});
  function update(patch) {
    settings = {...readSoundSettings(), ...patch};
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
    window.dispatchEvent(new CustomEvent('cet6-sound-change'));
  }
  function showVolume(slider) {
    const percent = slider.value + '%';
    slider.parentElement.querySelector('output').value = percent;
    slider.style.setProperty('--volume-level', percent);
  }
  function follow() {
    const current = readSoundSettings();
    for (const control of controls) control.checked = current[control.dataset.answerSound];
    for (const radio of accents) radio.checked = radio.value===current.accent;
    for (const slider of sliders) {
      slider.value = Math.round(current[slider.dataset.soundVolume] * 100);
      showVolume(slider);
    }
  }
  for (const control of controls) {
    control.onchange = () => update({[control.dataset.answerSound]:control.checked});
  }
  for (const slider of sliders) {
    slider.oninput = () => {
      showVolume(slider);
      update({[slider.dataset.soundVolume]:Number(slider.value) / 100});
    };
  }
  follow();
  panel.addEventListener('cet6-settings-open', follow);
}

export async function playAnswerSound(correct) {
  const preferences = readSoundSettings();
  if (!preferences[correct ? 'correct' : 'wrong'] || !preferences.effectsVolume) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    if (audio.state !== 'running') await audio.resume();
    await new Promise(resolve => {
      const current=readSoundSettings();
      const volume=current.effectsVolume;
      if (!volume || !current[correct ? "correct" : "wrong"]) {resolve();return;}
      const start = audio.currentTime + 0.005;
      const notes = correct ? [[740,0,.095],[1109,.083,.125]] : [[294,0,.115],[175,.115,.155]];
      notes.forEach(([frequency,offset,duration],index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + offset;
        oscillator.type = correct ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime((correct?0.42:0.46) * volume, at + (correct?.007:.016));
        gain.gain.exponentialRampToValueAtTime(0.003 * volume, at + duration);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.005);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          if(index===notes.length-1)resolve();
        };
      });
    });
  } catch {}
}
