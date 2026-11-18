'use strict';

/* ============================================================
   cod-lite · 联机（1v1）
   - 信令：Supabase Realtime 广播（Phoenix over WebSocket）
   - 数据：WebRTC DataChannel 直连；连不上就退回广播中转
   - 房主权威：房主跑 60Hz 模拟、20Hz 发快照；客机 30Hz 发输入
   ============================================================ */

var Net = (function () {
  var S = window.COD_NET || {};
  var WS_URL = String(S.url || '').replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + S.key + '&vsn=1.0.0';
  var PREFIX = S.channelPrefix || 'cod';
  var ICE = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' }
  ];
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randRoom() {
    var s = '';
    for (var i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    return s;
  }

  /* ---------- Supabase Realtime：只用来发广播（信令 + 兜底通道） ---------- */
  function RT(room, onEvent, onStatus) {
    var topic = 'realtime:' + PREFIX + '-' + room;
    var ws = null, joined = false, ref = 0, hb = null, closed = false, retry = 0;
    var cfg = {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: '' },
        postgres_changes: [],
        private: false
      }
    };

    function sendRaw(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

    function join() {
      sendRaw({ topic: topic, event: 'phx_join', payload: cfg, ref: String(++ref) });
    }
    function broadcast(event, data) {
      sendRaw({
        topic: topic, event: 'broadcast', ref: String(++ref),
        payload: { type: 'broadcast', event: event, payload: data }
      });
    }
    function connect() {
      if (closed) return;
      try { ws = new WebSocket(WS_URL); } catch (e) { return; }
      ws.onopen = function () {
        retry = 0;
        join();
        if (hb) clearInterval(hb);
        hb = setInterval(function () {
          sendRaw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) });
        }, 20000);
      };
      ws.onmessage = function (ev) {
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !joined) {
          joined = true;
          if (onStatus) onStatus('joined');
          return;
        }
        if (m.event === 'broadcast') {
          var p = m.payload || {};
          if (onEvent) onEvent(p.event, p.payload);
        }
      };
      ws.onclose = function () {
        joined = false;
        if (hb) { clearInterval(hb); hb = null; }
        if (closed) return;
        retry++;
        if (onStatus) onStatus('closed');
        setTimeout(connect, Math.min(8000, 500 * Math.pow(1.6, retry)));
      };
      ws.onerror = function () { };
    }

    connect();
    return {
      broadcast: broadcast,
      close: function () {
        closed = true;
        if (hb) clearInterval(hb);
        try { ws && ws.close(); } catch (e) { }
      }
    };
  }

  /* ---------- WebRTC 直连 ---------- */
  function Peer(isHost, signal, hooks) {
    var pc = null, dc = null, open = false, pendingIce = [];

    function flushIce() {
      for (var i = 0; i < pendingIce.length; i++) {
        try { pc.addIceCandidate(new RTCIceCandidate(pendingIce[i])); } catch (e) { }
      }
      pendingIce.length = 0;
    }

    function setup() {
      if (!window.RTCPeerConnection) return false;
      try {
        pc = new RTCPeerConnection({ iceServers: ICE });
      } catch (e) { return false; }

      pc.onicecandidate = function (e) {
        if (e.candidate) signal({ c: 'ice', d: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
      };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (open) { open = false; hooks.onState('relay'); }
        }
      };

      if (isHost) {
        dc = pc.createDataChannel('g', { ordered: true });
        wire();
        pc.createOffer().then(function (o) {
          return pc.setLocalDescription(o);
        }).then(function () {
          signal({ c: 'offer', d: pc.localDescription });
        }).catch(function () { });
      } else {
        pc.ondatachannel = function (e) { dc = e.channel; wire(); };
      }
      return true;
    }

    function wire() {
      dc.onopen = function () { open = true; hooks.onState('direct'); };
      dc.onclose = function () { open = false; hooks.onState('relay'); };
      dc.onmessage = function (e) { hooks.onData(e.data); };
    }

    var api = {
      ready: false,
      send: function (obj) {
        if (open && dc && dc.readyState === 'open') { dc.send(JSON.stringify(obj)); return true; }
        return false;
      },
      isOpen: function () { return open; },
      handle: function (m) {
        if (!pc) return;
        if (m.c === 'offer') {
          pc.setRemoteDescription(new RTCSessionDescription(m.d)).then(function () {
            flushIce();
            return pc.createAnswer();
          }).then(function (a) {
            return pc.setLocalDescription(a);
          }).then(function () {
            signal({ c: 'answer', d: pc.localDescription });
          }).catch(function () { });
        } else if (m.c === 'answer') {
          pc.setRemoteDescription(new RTCSessionDescription(m.d)).then(flushIce).catch(function () { });
        } else if (m.c === 'ice') {
          /* 候选可能比 offer/answer 先到，先攒着 */
          if (!pc.remoteDescription) { pendingIce.push(m.d); return; }
          try { pc.addIceCandidate(new RTCIceCandidate(m.d)); } catch (e) { }
        }
      },
      close: function () {
        open = false;
        try { dc && dc.close(); } catch (e) { }
        try { pc && pc.close(); } catch (e) { }
      },
      /* 重新开一轮协商（房里已经有对手时才发 offer，避免 offer 丢失） */
      restart: function () {
        api.close();
        dc = null; pc = null;
        return setup();
      }
    };

    api.ready = setup();
    return api;
  }

  /* ---------- 对外接口 ---------- */
  function Session(opts) {
    var self = this;
    this.role = null;          // 'host' | 'guest'
    this.room = null;
    this.link = 'idle';        // 'waiting' | 'direct' | 'relay'
    this.rtt = 0;
    this.peer = null;
    this.rt = null;
    this.cb = opts || {};
    this.connected = false;
    this.lastRx = 0;
    this.pingT = 0;
    this.onTick = null;
    this._sentPing = 0;

    function emit(name, arg) { if (self.cb[name]) self.cb[name](arg); }

    this._emit = emit;

    this._open = function (role, room) {
      self.role = role;
      self.room = room;
      self.link = 'waiting';
      self.lastRx = performance.now();
      self.rt = RT(room, function (event, data) {
        if (event === 'sig') { if (self.peer) self.peer.handle(data); return; }
        if (event === 'data') { self._recv(data); }
      }, function (st) {
        if (st === 'joined' && role === 'guest' && !self.connected) self._send({ t: 'hi' });
      });

      if (window.RTCPeerConnection) {
        self.peer = Peer(role === 'host', function (sig) {
          self.rt.broadcast('sig', sig);
        }, {
          onState: function (st) {
            if (st === 'direct') { self.link = 'direct'; emit('link', 'direct'); }
            else if (st === 'relay' && self.link === 'direct') { self.link = 'relay'; emit('link', 'relay'); }
          },
          onData: function (raw) {
            var m;
            try { m = JSON.parse(raw); } catch (e) { return; }
            self._recv(m);
          }
        });
        if (!self.peer.ready) self.peer = null;
      }

      /* 5 秒还没直连就退回广播中转 */
      setTimeout(function () {
        if (self.link === 'waiting' && !self.connected) {
          self.link = 'relay';
          emit('link', 'relay');
        }
      }, 5000);

      emit('link', self.link);
    };

    this._send = function (obj) {
      obj = obj || {};
      if (self.peer && self.peer.send(obj)) return;
      self.rt && self.rt.broadcast('data', obj);
    };

    this._recv = function (m) {
      if (!m || !m.t) return;
      if (m.t === 'ping') { self._send({ t: 'pong', n: m.n }); return; }
      if (m.t === 'pong') {
        self.rtt = Math.round(performance.now() - (m.n || 0));
        return;
      }
      self.lastRx = performance.now();
      if (m.t === 'hi') {
        if (self.role !== 'host') return;
        self.connected = true;
        if (self.peer) self.peer.restart();
        self._send({ t: 'welcome' });
        emit('peer');
        return;
      }
      if (m.t === 'welcome') { self.connected = true; emit('start'); return; }
      if (m.t === 'start') { self.connected = true; emit('start'); return; }
      emit('msg', m);
    };

    this.ping = function () {
      var now = performance.now();
      if (now - self._sentPing < 2000) return;
      self._sentPing = now;
      self._send({ t: 'ping', n: now });
    };

    this.stallMs = function () { return performance.now() - self.lastRx; };

    this.close = function () {
      try { self._send({ t: 'bye' }); } catch (e) { }
      if (self.peer) self.peer.close();
      if (self.rt) self.rt.close();
      self.connected = false;
      self.role = null;
      self.link = 'idle';
    };
  }

  return {
    host: function (cb, room) {
      var s = new Session(cb);
      s._open('host', room || randRoom());
      return s;
    },
    join: function (code, cb) {
      var s = new Session(cb);
      s._open('guest', String(code || '').toUpperCase().trim());
      return s;
    },
    randRoom: randRoom
  };
})();
