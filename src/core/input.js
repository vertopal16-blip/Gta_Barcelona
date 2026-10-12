// Gestión de teclado, ratón (pointer lock) y mandos.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // pulsadas este frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = new Set();
    this.buttonsPressed = new Set();
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) this.requestLock();
      this.buttons.add(e.button);
      this.buttonsPressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* entornos sin pointer lock */ }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  mouse(btn) { return this.enabled && this.buttons.has(btn); }
  mouseHit(btn) { return this.enabled && this.buttonsPressed.has(btn); }

  /** Eje de movimiento combinado teclado + mando. */
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const gp = this.gamepad();
    if (gp) {
      const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
      if (Math.abs(gx) > 0.15) x += gx;
      if (Math.abs(gy) > 0.15) y -= gy;
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Delta de cámara (ratón + stick derecho). */
  look(dt) {
    let dx = this.mouseDX * 0.0025 * this.sensitivity;
    let dy = this.mouseDY * 0.0025 * this.sensitivity;
    const gp = this.gamepad();
    if (gp) {
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.abs(rx) > 0.15) dx += rx * 2.5 * dt;
      if (Math.abs(ry) > 0.15) dy += ry * 2.0 * dt;
    }
    if (this.invertY) dy = -dy;
    return { dx, dy };
  }

  endFrame() {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
