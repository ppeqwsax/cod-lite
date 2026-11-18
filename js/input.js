/* cod-lite · 键鼠输入 + 指针锁定 */
var Input = (function () {
  var keys = {};
  var state = {
    keyW: false, keyA: false, keyS: false, keyD: false,
    shift: false, fire: false, reload: false, jump: false, crouch: false, aim: false,
    mouseDX: 0, mouseDY: 0,
    locked: false
  };
  var canvasEl = null;
  var onLock = null;

  function down(e) {
    var c = e.code;
    if (c === 'KeyW') state.keyW = true;
    else if (c === 'KeyA') state.keyA = true;
    else if (c === 'KeyS') state.keyS = true;
    else if (c === 'KeyD') state.keyD = true;
    else if (c === 'ShiftLeft' || c === 'ShiftRight') state.shift = true;
    else if (c === 'KeyR') state.reload = true;
    else if (c === 'Space') { state.jump = true; e.preventDefault(); }
    else if (c === 'ControlLeft' || c === 'ControlRight' || c === 'KeyC') { state.crouch = true; e.preventDefault(); }
    else if (c === 'Digit1') state.pick = 0;
    else if (c === 'Digit2') state.pick = 1;
    else if (c === 'Space') e.preventDefault();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].indexOf(c) >= 0) e.preventDefault();
  }
  function up(e) {
    var c = e.code;
    if (c === 'KeyW') state.keyW = false;
    else if (c === 'KeyA') state.keyA = false;
    else if (c === 'KeyS') state.keyS = false;
    else if (c === 'KeyD') state.keyD = false;
    else if (c === 'ShiftLeft' || c === 'ShiftRight') state.shift = false;
    else if (c === 'ControlLeft' || c === 'ControlRight' || c === 'KeyC') state.crouch = false;
  }

  function bind(canvas, lockCb) {
    canvasEl = canvas;
    onLock = lockCb;
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', function () {
      state.keyW = state.keyA = state.keyS = state.keyD = false;
      state.shift = false; state.fire = false;
    });

    canvas.addEventListener('mousedown', function (e) {
      if (!state.locked) {
        lock();
        /* 抢锁的这一次点击也当成开火，不然第一枪永远"没反应" */
        if (e.button === 0) state.fire = true;
        return;
      }
      if (e.button === 0) state.fire = true;
      if (e.button === 2) state.aim = true;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) state.fire = false;
      if (e.button === 2) state.aim = false;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('mousemove', function (e) {
      if (!state.locked) return;
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', function () {
      state.locked = (document.pointerLockElement === canvasEl);
      if (!state.locked) { state.fire = false; state.mouseDX = 0; state.mouseDY = 0; }
      if (onLock) onLock(state.locked);
    });
  }

  function lock() {
    /* ?nolock=1 给自动化测试用：不抢真实鼠标指针 */
    if (/[?&]nolock=1/.test(location.search)) {
      state.locked = true;
      if (onLock) onLock(true);
      return;
    }
    if (canvasEl && canvasEl.requestPointerLock) canvasEl.requestPointerLock();
  }
  function unlock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  /* 每帧取一次，取完清零增量 */
  function read() {
    var out = {
      keyW: state.keyW, keyA: state.keyA, keyS: state.keyS, keyD: state.keyD,
      shift: state.shift, fire: state.fire, reload: state.reload,
      jump: state.jump, crouch: state.crouch, aim: state.aim,
      mouseDX: state.mouseDX, mouseDY: state.mouseDY,
      lock: state.locked, pick: state.pick
    };
    state.mouseDX = 0; state.mouseDY = 0;
    state.reload = false;
    state.jump = false;   // 跳跃是边沿触发：按下即被消费，快速点按不会丢
    state.pick = -1;
    return out;
  }

  return { bind: bind, read: read, lock: lock, unlock: unlock, state: state };
})();
