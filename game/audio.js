let context = null;
let master = null;
let noiseBuffer = null;
let engine = null;
let siren = null;

function init() {
  if (context) return;
  const Audio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Audio) return;
  try {
    context = new Audio();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    buildEngine();
    buildSiren();
  } catch (err) {
    context = null;
    master = null;
  }
}

function buildEngine() {
  const osc = context.createOscillator();
  const sub = context.createOscillator();
  const subGain = context.createGain();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 58;
  sub.type = 'square';
  sub.frequency.value = 29;
  subGain.gain.value = 0.35;
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  filter.Q.value = 6;
  gain.gain.value = 0;
  osc.connect(filter);
  sub.connect(subGain);
  subGain.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start();
  sub.start();
  engine = { osc, sub, filter, gain };
}

function buildSiren() {
  const osc = context.createOscillator();
  const lfo = context.createOscillator();
  const sweep = context.createGain();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 620;
  lfo.type = 'sine';
  lfo.frequency.value = 1.2;
  sweep.gain.value = 210;
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  filter.Q.value = 2;
  gain.gain.value = 0;
  lfo.connect(sweep);
  sweep.connect(osc.frequency);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start();
  lfo.start();
  siren = { osc, lfo, gain };
}

function getNoise() {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.5);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

export function createAudio() {
  return {
    unlock() {
      init();
      if (context && context.state !== 'running') context.resume().catch(() => {});
    },

    setPaused(paused) {
      if (!context) return;
      if (paused && context.state === 'running') context.suspend().catch(() => {});
      else if (!paused && context.state === 'suspended') context.resume().catch(() => {});
    },

    engine(speed, active) {
      if (!context || !engine) return;
      const now = context.currentTime;
      const pitch = 58 + speed * 138;
      engine.osc.frequency.setTargetAtTime(pitch, now, 0.08);
      engine.sub.frequency.setTargetAtTime(pitch * 0.5, now, 0.08);
      engine.filter.frequency.setTargetAtTime(240 + speed * 1100, now, 0.1);
      engine.gain.gain.setTargetAtTime(active ? 0.04 + speed * 0.075 : 0, now, 0.12);
    },

    siren(level) {
      if (!context || !siren) return;
      const now = context.currentTime;
      siren.gain.gain.setTargetAtTime(level * 0.055, now, 0.16);
      siren.lfo.frequency.setTargetAtTime(0.9 + level * 0.9, now, 0.25);
    },

    gunshot() {
      if (!context || !master) return;
      const now = context.currentTime;
      const burst = context.createBufferSource();
      const highpass = context.createBiquadFilter();
      const crack = context.createGain();
      burst.buffer = getNoise();
      highpass.type = 'highpass';
      highpass.frequency.value = 360;
      crack.gain.setValueAtTime(0.0001, now);
      crack.gain.exponentialRampToValueAtTime(0.55, now + 0.006);
      crack.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      burst.connect(highpass);
      highpass.connect(crack);
      crack.connect(master);
      burst.start(now);
      burst.stop(now + 0.22);

      const thump = context.createOscillator();
      const body = context.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(125, now);
      thump.frequency.exponentialRampToValueAtTime(44, now + 0.14);
      body.gain.setValueAtTime(0.32, now);
      body.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      thump.connect(body);
      body.connect(master);
      thump.start(now);
      thump.stop(now + 0.18);
    },

    chime(pitch = 1) {
      if (!context || !master) return;
      const now = context.currentTime;
      const notes = [1, 1.26, 1.5];
      for (let i = 0; i < notes.length; i++) {
        const tone = context.createOscillator();
        const env = context.createGain();
        const start = now + i * 0.075;
        tone.type = 'sine';
        tone.frequency.value = 523.25 * pitch * notes[i];
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(0.17, start + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
        tone.connect(env);
        env.connect(master);
        tone.start(start);
        tone.stop(start + 0.36);
      }
    },
  };
}
