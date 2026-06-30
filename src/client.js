import { Game } from './game.js';
import { showModeScreen, hideModeScreen, showHUD, showWaiting, hideWaiting } from './ui.js';

class CyberpunkRaceClient {
  constructor() {
    this.game = null;
    this.ws = null;
    this.mode = null;
    this.playerIndex = null;
    this.isRaceStarted = false;
    this.positionInterval = null;

    this.initUI();
  }

  initUI() {
    const container = document.getElementById('game-container');
    this.game = new Game(container);

    document.getElementById('btn-ai').addEventListener('click', () => {
      this.startAIMode();
    });

    document.getElementById('btn-hvh').addEventListener('click', () => {
      this.startHumanVsHuman();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      this.restart();
    });

    showModeScreen();
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (err) => {
        reject(err);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        if (this.positionInterval) {
          clearInterval(this.positionInterval);
        }
      };
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'waiting':
        this.isRaceStarted = false;
        showWaiting();
        break;

      case 'go':
        this.playerIndex = msg.playerIndex;
        this.isRaceStarted = true;
        hideWaiting();
        hideModeScreen();
        showHUD();
        this.game.startMode(this.playerIndex === 0 ? 'ai' : 'hvh');
        this.startPositionBroadcast();
        break;

      case 'opponent':
        this.game.setOpponentPosition(msg.x, msg.y, msg.z, msg.rotation);
        break;

      case 'ai_position':
        this.game.setOpponentPosition(msg.x, msg.y, msg.z, msg.rotation);
        break;

      case 'opponent_left':
        break;
    }
  }

  async startAIMode() {
    this.mode = 'ai';
    try {
      await this.connect(`ws://${window.location.host}`);
      this.ws.send(JSON.stringify({ type: 'start-ai' }));
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  }

  async startHumanVsHuman() {
    this.mode = 'hvh';
    showWaiting();
    try {
      await this.connect(`ws://${window.location.host}`);
      this.ws.send(JSON.stringify({ type: 'join' }));
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  }

  startPositionBroadcast() {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
    }

    this.positionInterval = setInterval(() => {
      if (!this.isRaceStarted || !this.game || !this.game.playerCar) return;

      const state = this.game.getPlayerState();
      if (state && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'position',
          ...state
        }));
      }

      this.game.updateHUD();
    }, 50);
  }

  restart() {
    hideEndScreen();
    this.game.restart();
    this.isRaceStarted = true;
    showHUD();
  }
}

// Auto-start on load — placed AFTER class definition to avoid TDZ ReferenceError
new CyberpunkRaceClient();

