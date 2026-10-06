/**
 * Unified Input Manager
 * Handles Keyboard (P1 & P2 mappings), Mouse, and Touch virtual controllers.
 */
export class InputManager {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    this.mouse = { x: 0, y: 0, isDown: false, click: false };

    // P1 Virtual Joystick state (Touch)
    this.virtualP1 = { x: 0, y: 0, fire: false };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onKeyDown(e) {
    if (!this.keys[e.code]) {
      this.justPressed[e.code] = true;
    }
    this.keys[e.code] = true;
    // Prevent scrolling for game controls
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  _onMouseMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _onMouseDown(e) {
    this.mouse.isDown = true;
    this.mouse.click = true;
  }

  _onMouseUp() {
    this.mouse.isDown = false;
  }

  isDown(code) {
    return !!this.keys[code];
  }

  wasJustPressed(code) {
    return !!this.justPressed[code];
  }

  // Player 1 input abstraction (WASD + Space + Q/E)
  getP1() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('KeyA')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('KeyD')) x += 1;
    if (this.isDown('KeyW')) y += 1;
    if (this.isDown('KeyS')) y -= 1;

    // Merge virtual stick
    if (Math.abs(this.virtualP1.x) > 0.1) x = this.virtualP1.x;
    if (Math.abs(this.virtualP1.y) > 0.1) y = this.virtualP1.y;

    const fire = this.isDown('Space') || this.virtualP1.fire;
    const fireJustPressed = this.wasJustPressed('Space') || this.virtualP1.fireJustPressed;

    return { x, y, fire, fireJustPressed, left: x < -0.3, right: x > 0.3, up: y > 0.3, down: y < -0.3 };
  }

  // Player 2 input abstraction (Arrows + Enter / Numpad0)
  getP2() {
    let x = 0;
    let y = 0;
    if (this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('ArrowRight')) x += 1;
    if (this.isDown('ArrowUp')) y += 1;
    if (this.isDown('ArrowDown')) y -= 1;

    const fire = this.isDown('Enter') || this.isDown('Numpad0') || this.isDown('Slash');
    const fireJustPressed = this.wasJustPressed('Enter') || this.wasJustPressed('Numpad0') || this.wasJustPressed('Slash');

    return { x, y, fire, fireJustPressed, left: x < -0.3, right: x > 0.3, up: y > 0.3, down: y < -0.3 };
  }

  update() {
    // Reset transient frame triggers
    this.justPressed = {};
    this.mouse.click = false;
    this.virtualP1.fireJustPressed = false;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}
