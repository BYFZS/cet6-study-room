import {readSoundSettings} from './answer-sounds.mjs?v=27';

export function pronunciationFilename(word) {
  return word.replace(/[ ']/g, '_') + '.mp3';
}

export function createWordPronunciation() {
  let active;
  function stop() {
    const current = active;
    active = undefined;
    if (current?.clip) current.clip.pause();
    if (current?.utterance) window.speechSynthesis?.cancel();
  }
  window.addEventListener('cet6-sound-change', () => {
    const {volume, accent} = readSoundSettings();
    if (!volume || (active && active.accent !== accent)) stop();
    else if (active?.clip) active.clip.volume = volume * 0.82;
  });
  function play(word, {example, onPlaying=()=>{}, onFailure=()=>{}, onMuted=()=>{}} = {}) {
    stop();
    const {volume, accent} = readSoundSettings();
    if (!volume) { onMuted(); return; }
    const request = active = {accent};
    function systemVoice() {
      if (active !== request || request.utterance) return;
      request.clip?.pause();
      function fail(error) {
        if (active !== request) return;
        active = undefined;
        if (!['canceled', 'interrupted'].includes(error)) onFailure();
      }
      // The Android app ships both voices; its system bridge is used only by older clients.
      if (window.CET6Android) { fail(); return; }
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) { fail(); return; }
      try {
        const utterance = request.utterance = new window.SpeechSynthesisUtterance(example || word);
        utterance.lang = accent;
        utterance.rate = 0.8;
        utterance.volume = readSoundSettings().volume * 0.82;
        const english = (synth.getVoices?.() || []).filter(voice => /^en\b/i.test(voice.lang));
        const matches = voice => voice.lang.replace('_', '-').toLowerCase() === accent.toLowerCase();
        const voice = english.find(v => v.localService && matches(v)) || english.find(matches);
        if (english.length && !voice) { fail('voice-unavailable'); return; }
        if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
        utterance.onstart = () => { if (active === request) onPlaying(); };
        utterance.onend = () => { if (active === request) active = undefined; };
        utterance.onerror = event => fail(event.error);
        synth.speak(utterance);
      } catch { fail(); }
    }
    try {
      const url = new URL((example ? './example-audio/' : './pronunciation/') + accent + '/' + encodeURIComponent(pronunciationFilename(word)) + '?v=1', import.meta.url);
      // Only one short clip is fetched per play: a desktop browser need not have a voice installed.
      const clip = request.clip = new window.Audio(url.href);
      clip.volume = volume * 0.82;
      clip.onplaying = () => { if (active === request) onPlaying(); };
      clip.onended = () => { if (active === request) active = undefined; };
      clip.onerror = systemVoice;
      clip.play().catch(systemVoice);
    } catch { systemVoice(); }
  }
  return {play, stop};
}
