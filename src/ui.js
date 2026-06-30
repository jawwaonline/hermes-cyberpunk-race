export function showModeScreen() {
  document.getElementById('mode-screen').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
}

export function hideModeScreen() {
  document.getElementById('mode-screen').style.display = 'none';
}

export function showHUD() {
  document.getElementById('hud').style.display = 'block';
}

export function hideHUD() {
  document.getElementById('hud').style.display = 'none';
}

export function showWaiting() {
  document.getElementById('waiting').style.display = 'block';
}

export function hideWaiting() {
  document.getElementById('waiting').style.display = 'none';
}

export function showWaitingTimer() {
  const el = document.getElementById('waiting');
  if (el) el.textContent = 'Connected — waiting for opponent...';
}

export function updateWaitingTimer(mins, secs) {
  const el = document.getElementById('waiting');
  if (el) el.textContent = `Connected — waiting (${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')})`;
}

export function hideWaitingTimer() {
  const el = document.getElementById('waiting');
  if (el) el.textContent = 'Connected — waiting for opponent...';
}

export function showConnectionError(modeName) {
  const overlay = document.createElement('div');
  overlay.id = 'connection-error';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(10,10,15,0.97);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; z-index: 500;
  `;
  overlay.innerHTML = `
    <h2 style="color:#f55;font-size:2.5rem;margin-bottom:1rem;text-shadow:0 0 20px #f55">
      CONNECTION FAILED
    </h2>
    <p style="color:#aaa;font-size:1.1rem;margin-bottom:2rem;text-align:center;max-width:400px">
      Could not connect to server for <strong style="color:#0ff">${modeName}</strong> mode.<br>
      Check your connection and try again.
    </p>
    <button class="mode-btn" id="btn-retry-connection">Retry</button>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-retry-connection').addEventListener('click', () => {
    overlay.remove();
    window.location.reload();
  });
}

export function updateHUD(lap, speed, position) {
  const lapEl = document.getElementById('lap-current');
  const posEl = document.getElementById('pos-display');
  const speedEl = document.getElementById('speed-display');

  if (lapEl) lapEl.textContent = lap;
  if (posEl) posEl.textContent = position;
  if (speedEl) speedEl.textContent = Math.round(speed);
}

export function showEndScreen(isWinner) {
  const endScreen = document.getElementById('end-screen');
  const endTitle = document.getElementById('end-title');

  if (endScreen && endTitle) {
    endScreen.className = isWinner ? 'win' : 'lose';
    endTitle.textContent = isWinner ? 'WINNER' : 'GAME OVER';
    endScreen.style.display = 'flex';
  }
}

export function hideEndScreen() {
  const endScreen = document.getElementById('end-screen');
  if (endScreen) endScreen.style.display = 'none';
}
