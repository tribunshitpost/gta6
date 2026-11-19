// Keyboard + mouse input. Tracks held keys, edge-triggered presses and
// pointer-lock mouse look. No game logic lives here — this module only
// reports what the player did, and the main loop decides what it means.
// Revision: mouse-look sensitivity is now a property the main loop reads,
// so the look speed can be tuned in one place instead of a magic number
// buried in the camera code.

// Keys whose default browser action (scrolling, focus) would fight the game.
const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); // currently held key codes
    this.pressed = new Set(); // codes pressed since the last endFrame()
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // left click since the last consumeMouse()
    this.locked = false; // pointer lock active
    this.dragging = false; // fallback drag-look when pointer lock is unavailable
    this.lastX = 0;
    this.lastY = 0;
    this.sensitivity = 1.0; // mouse-look multiplier (1.0 = default feel)

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return; // one press per physical key-down
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (SCROLL_KEYS.includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      // Losing the window must never leave a key "stuck" down.
      this.keys.clear();
      this.dragging = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (this.locked) {
        this.mouseDX += event.movementX;
        this.mouseDY += event.movementY;
      } else if (this.dragging) {
        this.mouseDX += event.clientX - this.lastX;
        this.mouseDY += event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
      }
    });

    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      if (!this.locked) {
        this.dragging = true;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.mouseDown = false;
        this.dragging = false;
      }
    });
    canvas.addEventListener('click', () => {
      // Pointer lock gives smooth mouse-look; harmless if the browser refuses.
      if (!this.locked && document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch {
          /* ignore — drag-look still works */
        }
      }
    });
  }

  /** Scale mouse-look speed (0.5 = half speed, 2.0 = double). Clamped sane. */
  setSensitivity(value) {
    const v = Number(value);
    if (Number.isFinite(v)) this.sensitivity = Math.min(3, Math.max(0.25, v));
  }

  /** True while the key is held down. */
  down(code) {
    return this.keys.has(code);
  }

  /** True once per physical press; cleared by endFrame() each frame. */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /**
   * Take this frame's mouse movement and click, then reset them.
   * Movement is already scaled by the sensitivity setting.
   */
  consumeMouse() {
    const frame = {
      dx: this.mouseDX * this.sensitivity,
      dy: this.mouseDY * this.sensitivity,
      clicked: this.mouseClicked,
    };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
    return frame;
  }

  /** Call once per frame, after the game has read the input. */
  endFrame() {
    this.pressed.clear();
  }

  /** Forget every held key (used when the game pauses or loses focus). */
  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;
  }

  /** WASD / arrow keys as a -1..1 pair: forward and strafe. */
  moveAxes() {
    let forward = 0;
    let strafe = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) forward += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) forward -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) strafe += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) strafe -= 1;
    return { forward, strafe };
  }
}
