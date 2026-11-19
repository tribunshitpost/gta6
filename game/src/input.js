// Neon Bay — keyboard and mouse input.
// One object owns every key and pointer state; game systems ask it
// questions instead of touching DOM events themselves.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._dragging = false;
    this._canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this._dragging = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.dragDX += e.clientX - this._lastX;
      this.dragDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    const endDrag = () => {
      this.mouseDown = false;
      this._dragging = false;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down; cleared each frame.
  hit(code) {
    return this.pressed.has(code);
  }

  // Mission keys 1-3: returns the mission index just pressed, or -1.
  missionKey() {
    if (this.hit('Digit1')) return 0;
    if (this.hit('Digit2')) return 1;
    if (this.hit('Digit3')) return 2;
    return -1;
  }

  axis(neg, pos) {
    let v = 0;
    if (this.down(neg)) v -= 1;
    if (this.down(pos)) v += 1;
    return v;
  }

  get moveX() {
    return this.axis('KeyA', 'KeyD') + this.axis('ArrowLeft', 'ArrowRight');
  }

  get moveY() {
    return this.axis('KeyW', 'KeyS') + this.axis('ArrowUp', 'ArrowDown');
  }

  consumeDrag() {
    const dx = this.dragDX;
    const dy = this.dragDY;
    this.dragDX = 0;
    this.dragDY = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  // Call at the end of every frame: one-frame presses expire.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
