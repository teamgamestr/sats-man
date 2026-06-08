declare global {
  interface Window {
    satsmanAudioContext?: AudioContext;
    satsmanDotAudioContext?: AudioContext;
  }
}

export function unlockPacmanAudio() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;

  window.satsmanAudioContext ??= new AudioContextConstructor();
  window.satsmanDotAudioContext ??= new AudioContextConstructor();

  void window.satsmanAudioContext.resume();
  void window.satsmanDotAudioContext.resume();
}
