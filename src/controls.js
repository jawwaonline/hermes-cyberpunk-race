export class Controls {
  constructor() {
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onKeyDown(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.right = true;
        break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.right = false;
        break;
    }
  }

  getInput() {
    return {
      forward: this.forward,
      backward: this.backward,
      left: this.left,
      right: this.right
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
