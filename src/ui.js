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

export function updateHUD(lap, speed, position) {
  const lapEl = document.getElementById('lap-current');
  const posEl = document.getElementById('pos-display');
  const speedEl = document.getElementById('speed-display');

  if (lapEl) lapEl.textContent = Math.min(lap, 3);
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
  if (endScreen) {
    endScreen.style.display = 'none';
  }
}
