// Every sound is synthesised with WebAudio: no audio files, nothing to download. The
// context is created on the player's first gesture (browsers block sound before that).

const MUSIC_NOTES = [110, 130.81, 164.81, 196, 164.81, 130.81, 98, 123.47];
const ARP_NOTES = [220, 261.63, 329.63, 440, 329.63, 261.63];

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ frequency, endFrequency, duration, type, volume, when = 0, destination }) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination || master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise({ duration, volume, frequency, when = 0 }) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  const audio = {
    get muted() {
      return muted;
    },
    /** Call from any player gesture; safe to call every frame. */
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    shoot(colorIndex) {
      tone({ frequency: 620 + colorIndex * 90, endFrequency: 300, duration: 0.07, type: 'square', volume: 0.1 });
    },
    hit() {
      noise({ duration: 0.06, volume: 0.16, frequency: 3200 });
    },
    explode(big) {
      noise({ duration: big ? 0.5 : 0.28, volume: big ? 0.4 : 0.25, frequency: big ? 900 : 1400 });
      tone({ frequency: big ? 160 : 220, endFrequency: 40, duration: big ? 0.45 : 0.25, type: 'sine', volume: 0.3 });
    },
    hurt() {
      tone({ frequency: 200, endFrequency: 55, duration: 0.35, type: 'sawtooth', volume: 0.32 });
      noise({ duration: 0.2, volume: 0.2, frequency: 700 });
    },
    pickup() {
      tone({ frequency: 660, duration: 0.09, type: 'sine', volume: 0.2 });
      tone({ frequency: 990, duration: 0.14, type: 'sine', volume: 0.2, when: 0.08 });
    },
    waveHorn() {
      tone({ frequency: 196, duration: 0.35, type: 'triangle', volume: 0.25 });
      tone({ frequency: 294, duration: 0.35, type: 'triangle', volume: 0.22, when: 0.1 });
    },
    gameOver() {
      [392, 311, 233, 175].forEach((frequency, index) => {
        tone({ frequency, duration: 0.3, type: 'triangle', volume: 0.22, when: index * 0.22 });
      });
    },
    click() {
      tone({ frequency: 880, duration: 0.05, type: 'sine', volume: 0.15 });
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = window.setInterval(() => {
        if (muted || !context) return;
        const bass = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
        const arp = ARP_NOTES[(musicStep * 2) % ARP_NOTES.length];
        tone({ frequency: bass, duration: 0.42, type: 'triangle', volume: 0.5, destination: musicGain });
        tone({ frequency: arp, duration: 0.16, type: 'sine', volume: 0.35, destination: musicGain });
        musicStep += 1;
      }, 210);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };

  return audio;
}
