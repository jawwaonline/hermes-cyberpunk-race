import { Game } from './game.js';
import {
  showModeScreen, hideModeScreen, showHUD, showWaiting, hideWaiting,
  showConnectionError, showWaitingTimer, updateWaitingTimer, hideWaitingTimer,
  hideEndScreen
} from './ui.js';

class CyberpunkRaceClient {
  constructor() {
    this.game = null;
    this.ws = null;
    this.mode = null;
    this.playerIndex = null;
    this.isRaceStarted = false;
    this.positionInterval = null;
    this.waitingTimer = null;
    this.waitingStartTime = null;

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

    document.getElementById('btn-back-menu').addEventListener('click', () => {
      this.backToMenu();
    });

    showModeScreen();
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        if (this.positionInterval) {
          clearInterval(this.positionInterval);
          this.positionInterval = null;
        }
      };
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'waiting':
        this.isRaceStarted = false;
        showWaiting();
        this.startWaitingTimer();
        break;

      case 'go':
        this.playerIndex = msg.playerIndex;
        this.isRaceStarted = true;
        this.stopWaitingTimer();
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
        this.game.setOpponentPosition(msg.x, msg.y, msg.z, msg.rotation, msg.waypointIndex);
        break;

      case 'opponent_left':
        // Opponent disconnected — player wins by default
        if (this.game && this.game.isRunning) {
          this.game.isRunning = false;
          this.game.onRaceEnd(true); // Player wins
          // Show a notification
          const hud = document.getElementById('lap-current');
          if (hud) hud.textContent = 'YOU WIN — OPPONENT LEFT';
        }
        break;

      case 'error':
        console.warn('Server error:', msg.msg);
        break;
    }
  }

  startWaitingTimer() {
    this.waitingStartTime = Date.now();
    showWaitingTimer();
    this.waitingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.waitingStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      updateWaitingTimer(mins, secs);
    }, 1000);
  }

  stopWaitingTimer() {
    if (this.waitingTimer) {
      clearInterval(this.waitingTimer);
      this.waitingTimer = null;
    }
    hideWaitingTimer();
  }

  getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  async startAIMode() {
    this.mode = 'ai';
    try {
      await this.connect(this.getWsUrl());
      this.ws.send(JSON.stringify({ type: 'start-ai' }));
    } catch (err) {
      showConnectionError('Human vs AI');
    }
  }

  async startHumanVsHuman() {
    this.mode = 'hvh';
    showWaiting();
    try {
      await this.connect(this.getWsUrl());
      this.ws.send(JSON.stringify({ type: 'join' }));
    } catch (err) {
      hideWaiting();
      showConnectionError('Human vs Human');
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

  async restart() {
    hideEndScreen();
    this.game.restart();

    // Reconnect WebSocket if disconnected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.connect(this.getWsUrl());
        if (this.mode === 'ai') {
          this.ws.send(JSON.stringify({ type: 'start-ai' }));
        } else {
          this.ws.send(JSON.stringify({ type: 'join' }));
        }
      } catch {
        showConnectionError(this.mode === 'ai' ? 'Human vs AI' : 'Human vs Human');
        return;
      }
    }

    this.isRaceStarted = true;
    showHUD();
  }

  backToMenu() {
    this.stopWaitingTimer();
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isRaceStarted = false;
    this.mode = null;
    this.game.destroy();
    const container = document.getElementById('game-container');
    this.game = new Game(container);
    showModeScreen();
  }
}

new CyberpunkRaceClient();
