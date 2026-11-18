/* cod-lite · 极简音效（WebAudio 合成，无音频文件） */
var Sfx = (function () {
  var ac = null, master = null, on = true;

  function init() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    return ac;
  }

  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  function noise(dur) {
    var n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ac.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function tone(type, f0, f1, dur, vol, delay) {
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function burst(dur, vol, type, f0, f1) {
    var src = noise(dur);
    var f = ac.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, ac.currentTime);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
    var g = ac.createGain();
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  return {
    enabled: function (v) { if (v === undefined) return on; on = !!v; },
    unlock: function () { if (!on) return; init(); resume(); },
    shot: function (weapon) {
      if (!on || !init()) return;
      resume();
      if (weapon === 'pistol') {
        burst(0.14, 0.55, 'bandpass', 1600, 400);
        tone('square', 220, 70, 0.09, 0.18);
      } else if (weapon === 'spr') {
        /* 栓动：一声很沉、很长的爆响 + 尾音 */
        burst(0.28, 0.95, 'lowpass', 900, 180);
        tone('sawtooth', 90, 34, 0.34, 0.34);
        tone('square', 55, 26, 0.18, 0.16);
      } else {
        burst(0.16, 0.6, 'bandpass', 1200, 300);
        tone('sawtooth', 160, 60, 0.1, 0.22);
      }
    },
    hit: function () {
      if (!on || !init()) return;
      tone('square', 1500, 1500, 0.035, 0.12);
    },
    kill: function () {
      if (!on || !init()) return;
      tone('square', 700, 700, 0.06, 0.14);
      tone('square', 1050, 1050, 0.08, 0.14, 0.07);
    },
    /* 击杀确认音：一声清脆的金属「咔」+ 上扬双音，比命中更亮更厚 */
    killConfirm: function (headshot) {
      if (!on || !init()) return;
      burst(0.06, 0.5, 'highpass', 3200);
      tone('triangle', headshot ? 1400 : 1200, headshot ? 2200 : 1800, 0.1, 0.16);
      tone('square', headshot ? 900 : 780, headshot ? 1400 : 1180, 0.12, 0.12, 0.06);
      if (headshot) tone('square', 2400, 3000, 0.08, 0.1, 0.02);
    },
    hurt: function () {
      if (!on || !init()) return;
      burst(0.18, 0.35, 'lowpass', 400, 120);
      tone('sine', 120, 60, 0.16, 0.2);
    },
    reload: function () {
      if (!on || !init()) return;
      burst(0.05, 0.3, 'highpass', 2500);
      burst(0.05, 0.25, 'highpass', 1800);
      tone('square', 320, 320, 0.03, 0.08, 0.22);
    },
    empty: function () {
      if (!on || !init()) return;
      tone('square', 900, 600, 0.05, 0.09);
    },
    step: function () {
      if (!on || !init()) return;
      burst(0.05, 0.12, 'lowpass', 500, 200);
    }
  };
})();
