// client.js

const socket = io();

// Canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;

let players = {};
let bots = {};
let coins = {};
let projectiles = {};

let playerId = null;
let currentPlayer = null;

let gameMode = 'Free For All';
let gameModes = [];

let upgrades = {
  damage: 0,
  bulletSpeed: 0,
  health: 0,
  regen: 0,
  reload: 0,
};

const MAX_LEVELS = {
  damage: 10,
  bulletSpeed: 10,
  health: 10,
  regen: 10,
  reload: 10,
};

let keysPressed = {};
let autoFire = false;

let camera = {
  x: 0,
  y: 0,
  zoom: 1,
};

let mousePos = { x: 0, y: 0 };

let lastShotTime = 0;
const SHOOT_COOLDOWN_BASE = 250;

// UI Elements
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const playerNameInput = document.getElementById('player-name');
const gameModeSelect = document.getElementById('game-mode-select');
const teamSelectContainer = document.getElementById('team-select-container');
const playButton = document.getElementById('play-button');

const healthFill = document.getElementById('health-fill');
const scoreboard = document.getElementById('scoreboard');
const leaderboardList = document.getElementById('leaderboard-list');
const upgradesPanel = document.getElementById('upgrades-panel');

let selectedTeam = 'red';

document.querySelectorAll('input[name="team"]').forEach(radio => {
  radio.addEventListener('change', e => {
    selectedTeam = e.target.value;
  });
});

// Show/hide team select based on game mode
gameModeSelect.addEventListener('change', () => {
  if (gameModeSelect.value === 'Team Deathmatch') {
    teamSelectContainer.style.display = 'block';
  } else {
    teamSelectContainer.style.display = 'none';
  }
});

playButton.onclick = () => {
  const name = playerNameInput.value.trim();
  if (!name) return alert('Please enter a name');

  socket.emit('selectGameMode', gameModeSelect.value);
  socket.emit('playerJoined', { name, team: selectedTeam });

  mainMenu.classList.remove('visible');
  mainMenu.classList.add('hidden');

  gameContainer.classList.remove('hidden');
  gameContainer.classList.add('visible');
};

// Listen for initial game data
socket.on('init', (data) => {
  players = data.players;
  bots = data.bots;
  coins = data.coins;
  projectiles = data.projectiles;
  gameMode = data.gameMode;
  gameModes = data.gameModes;

  playerId = socket.id;
  currentPlayer = players[playerId];
});

// Update players
socket.on('updatePlayers', (data) => {
  players = data;
  currentPlayer = players[playerId];
});

// Update bots
socket.on('updateBots', (data) => {
  bots = data;
});

// Update coins
socket.on('updateCoins', (data) => {
  coins = data;
});

// New projectile
socket.on('newProjectile', (proj) => {
  projectiles[proj.id] = proj;
});

// Remove projectile
socket.on('removeProjectile', (id) => {
  delete projectiles[id];
});

// Spawn coin
socket.on('spawnCoin', (coin) => {
  coins[coin.id] = coin;
});

// Leaderboard update
socket.on('leaderboard', (list) => {
  leaderboardList.innerHTML = '';
  list.forEach(player => {
    const li = document.createElement('li');
    li.textContent = `${player.name}: ${player.score} pts | Coins: ${player.coins}`;
    if (gameMode === 'Team Deathmatch' && player.team) {
      li.textContent += ` [${player.team.toUpperCase()}]`;
      li.style.color = player.team === 'red' ? '#ff4444' : '#44aaff';
    }
    leaderboardList.appendChild(li);
  });
});

// Movement input handling
window.addEventListener('keydown', (e) => {
  keysPressed[e.key.toLowerCase()] = true;

  if (e.key.toLowerCase() === 'e') {
    autoFire = !autoFire;
    socket.emit('toggleAutoFire', autoFire);
  }

  // Prevent default arrow key scroll
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  keysPressed[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;
});

canvas.addEventListener('click', () => {
  if (!autoFire) shoot();
});

function shoot() {
  if (!currentPlayer) return;
  const now = Date.now();
  const reloadTime = SHOOT_COOLDOWN_BASE - upgrades.reload * 15; // faster reload with upgrades

  if (now - lastShotTime < reloadTime) return;
  lastShotTime = now;

  socket.emit('shoot');
}

// Game update & draw loop
function gameLoop() {
  if (!currentPlayer) {
    requestAnimationFrame(gameLoop);
    return;
  }

  // Calculate player movement vector
  let dx = 0, dy = 0;
  if (keysPressed['w'] || keysPressed['arrowup']) dy -= 1;
  if (keysPressed['s'] || keysPressed['arrowdown']) dy += 1;
  if (keysPressed['a'] || keysPressed['arrowleft']) dx -= 1;
  if (keysPressed['d'] || keysPressed['arrowright']) dx += 1;

  // Normalize movement
  if (dx !== 0 || dy !== 0) {
    const length = Math.sqrt(dx * dx + dy * dy);
    dx /= length;
    dy /= length;

    // Apply player speed and upgrades
    const speed = currentPlayer.speed + upgrades.health * 0.3;
    currentPlayer.x += dx * speed;
    currentPlayer.y += dy * speed;

    // Clamp inside map
    currentPlayer.x = Math.min(Math.max(currentPlayer.size, currentPlayer.x), MAP_WIDTH - currentPlayer.size);
    currentPlayer.y = Math.min(Math.max(currentPlayer.size, currentPlayer.y), MAP_HEIGHT - currentPlayer.size);

    // Send movement update
    socket.emit('playerMovement', {
      x: currentPlayer.x,
      y: currentPlayer.y,
      angle: Math.atan2(mousePos.y - canvas.height / 2, mousePos.x - canvas.width / 2),
    });
  }

  // Update player angle to face mouse
  currentPlayer.angle = Math.atan2(mousePos.y - canvas.height / 2, mousePos.x - canvas.width / 2);

  // Auto fire if enabled
  if (autoFire) shoot();

  // Update camera to smoothly follow player
  camera.x += (currentPlayer.x - camera.x - canvas.width / 2) * 0.1;
  camera.y += (currentPlayer.y - camera.y - canvas.height / 2) * 0.1;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw map background
  drawMap();

  // Draw coins
  Object.values(coins).forEach(drawCoin);

  // Draw bots
  Object.values(bots).forEach(drawBot);

  // Draw projectiles
  Object.values(projectiles).forEach(drawProjectile);

  // Draw players
  Object.values(players).forEach(drawPlayer);

  // Draw UI overlays
  drawUI();

  // Draw minimap top-right
  drawMinimap();

  requestAnimationFrame(gameLoop);
}

function drawMap() {
  // Gradient background simulating 3D depth
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#111a27');
  gradient.addColorStop(1, '#0a0f15');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines for map depth
  ctx.strokeStyle = '#00335544';
  ctx.lineWidth = 1;
  const gridSize = 100;
  for (let x = -camera.x % gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = -camera.y % gridSize; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer(player) {
  const screenX = player.x - camera.x;
  const screenY = player.y - camera.y;

  if (screenX < -100 || screenX > canvas.width + 100 || screenY < -100 || screenY > canvas.height + 100) return;

  // Draw shadow
  ctx.fillStyle = '#0008';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + player.size * 0.7, player.size * 0.8, player.size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bot body with gradient for 3D effect
  let grad = ctx.createRadialGradient(screenX, screenY, player.size * 0.2, screenX, screenY, player.size);
  grad.addColorStop(0, player.color1);
  grad.addColorStop(1, player.color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(screenX, screenY, player.size, 0, Math.PI * 2);
  ctx.fill();

  // Draw health bar above player
  const healthBarWidth = player.size * 2;
  const healthRatio = player.health / player.maxHealth;
  ctx.fillStyle = '#222';
  ctx.fillRect(screenX - healthBarWidth / 2, screenY - player.size - 15, healthBarWidth, 6);
  ctx.fillStyle = '#00ffaa';
  ctx.fillRect(screenX - healthBarWidth / 2, screenY - player.size - 15, healthBarWidth * healthRatio, 6);
  ctx.strokeStyle = '#003311';
  ctx.lineWidth = 1;
  ctx.strokeRect(screenX - healthBarWidth / 2, screenY - player.size - 15, healthBarWidth, 6);

  // Gun barrel
  ctx.strokeStyle = '#004466';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX + Math.cos(player.angle) * player.size * 1.3, screenY + Math.sin(player.angle) * player.size * 1.3);
  ctx.stroke();

  // Name
  ctx.fillStyle = '#00d8ff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, screenX, screenY - player.size - 25);

  // Team indicator
  if (player.team) {
    ctx.fillStyle = player.team === 'red' ? 'rgba(255, 80, 80, 0.6)' : 'rgba(80, 150, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(screenX, screenY + player.size + 8, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBot(bot) {
  const screenX = bot.x - camera.x;
  const screenY = bot.y - camera.y;

  if (screenX < -100 || screenX > canvas.width + 100 || screenY < -100 || screenY > canvas.height + 100) return;

  // Shadow
  ctx.fillStyle = '#0008';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + bot.size * 0.7, bot.size * 0.9, bot.size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body gradient
  let grad = ctx.createRadialGradient(screenX, screenY, bot.size * 0.3, screenX, screenY, bot.size);
  grad.addColorStop(0, bot.color1);
  grad.addColorStop(1, bot.color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(screenX, screenY, bot.size, 0, Math.PI * 2);
  ctx.fill();

  // Saw blade (rotating)
  ctx.strokeStyle = '#ff5500';
  ctx.lineWidth = 4;
  ctx.beginPath();
  const sawRadius = bot.size * 0.6;
  for (let i = 0; i < 6; i++) {
    const angle = bot.sawAngle + (i * Math.PI / 3);
    const x1 = screenX + Math.cos(angle) * sawRadius;
    const y1 = screenY + Math.sin(angle) * sawRadius;
    const x2 = screenX + Math.cos(angle + Math.PI / 12) * sawRadius * 0.5;
    const y2 = screenY + Math.sin(angle + Math.PI / 12) * sawRadius * 0.5;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  // Health bar
  const healthBarWidth = bot.size * 2;
  const healthRatio = bot.health / bot.maxHealth;
  ctx.fillStyle = '#222';
  ctx.fillRect(screenX - healthBarWidth / 2, screenY - bot.size - 15, healthBarWidth, 6);
  ctx.fillStyle = '#ff5500';
  ctx.fillRect(screenX - healthBarWidth / 2, screenY - bot.size - 15, healthBarWidth * healthRatio, 6);
  ctx.strokeStyle = '#330000';
  ctx.lineWidth = 1;
  ctx.strokeRect(screenX - healthBarWidth / 2, screenY - bot.size - 15, healthBarWidth, 6);

  // Name
  ctx.fillStyle = '#ff7700';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(bot.name, screenX, screenY - bot.size - 25);
}

function drawCoin(coin) {
  const screenX = coin.x - camera.x;
  const screenY = coin.y - camera.y;

  if (screenX < -20 || screenX > canvas.width + 20 || screenY < -20 || screenY > canvas.height + 20) return;

  ctx.fillStyle = 'gold';
  ctx.beginPath();
  ctx.arc(screenX, screenY, coin.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#bb9900';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawProjectile(proj) {
  const screenX = proj.x - camera.x;
  const screenY = proj.y - camera.y;

  if (screenX < -10 || screenX > canvas.width + 10 || screenY < -10 || screenY > canvas.height + 10) return;

  ctx.fillStyle = '#00ffff';
  ctx.beginPath();
  ctx.arc(screenX, screenY, proj.size, 0, Math.PI * 2);
  ctx.fill();
}

// Draw UI overlays
function drawUI() {
  if (!currentPlayer) return;

  // Health bar fill width (smooth)
  const healthPercent = currentPlayer.health / currentPlayer.maxHealth;
  healthFill.style.width = `${healthPercent * 100}%`;

  // Scoreboard
  scoreboard.textContent = `Score: ${currentPlayer.score} | Coins: ${currentPlayer.coins} | Auto Fire: ${autoFire ? 'ON' : 'OFF'}`;
}

// Draw minimap top-right corner
function drawMinimap() {
  const miniSize = 200;
  const margin = 20;

  ctx.save();
  ctx.beginPath();
  ctx.rect(canvas.width - miniSize - margin, margin, miniSize, miniSize);
  ctx.fillStyle = '#000c';
  ctx.fill();
  ctx.strokeStyle = '#00d8ff55';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Scale to map size
  const scaleX = miniSize / MAP_WIDTH;
  const scaleY = miniSize / MAP_HEIGHT;

  // Draw coins on minimap
  Object.values(coins).forEach(coin => {
    ctx.fillStyle = 'gold';
    ctx.beginPath();
    ctx.arc(canvas.width - miniSize - margin + coin.x * scaleX, margin + coin.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw bots on minimap
  Object.values(bots).forEach(bot => {
    ctx.fillStyle = '#ff5500';
    ctx.beginPath();
    ctx.arc(canvas.width - miniSize - margin + bot.x * scaleX, margin + bot.y * scaleY, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw players on minimap
  Object.values(players).forEach(player => {
    ctx.fillStyle = player.team === 'red' ? '#ff4444' : (player.team === 'blue' ? '#44aaff' : '#00ffff');
    ctx.beginPath();
    ctx.arc(canvas.width - miniSize - margin + player.x * scaleX, margin + player.y * scaleY, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw current player highlight
  if (currentPlayer) {
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width - miniSize - margin + currentPlayer.x * scaleX, margin + currentPlayer.y * scaleY, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// Upgrade system logic
upgradesPanel.addEventListener('click', e => {
  if (!e.target.classList.contains('upgrade-btn')) return;
  const upgradeType = e.target.dataset.upgrade;

  if (upgrades[upgradeType] >= MAX_LEVELS[upgradeType]) return alert('Max level reached!');

  const cost = (upgrades[upgradeType] + 1) * 5;

  if (!currentPlayer || currentPlayer.coins < cost) return alert('Not enough coins!');

  currentPlayer.coins -= cost;
  upgrades[upgradeType]++;
  
  // Apply upgrades effects
  switch (upgradeType) {
    case 'damage': currentPlayer.damage += 2; break;
    case 'bulletSpeed': /* bullet speed handled client-side */ break;
    case 'health':
      currentPlayer.maxHealth += 10;
      currentPlayer.health = currentPlayer.maxHealth;
      break;
    case 'regen':
      // Regen handled below
      break;
    case 'reload':
      // Reload speed handled in shoot cooldown
      break;
  }

  alert(`Upgraded ${upgradeType} to level ${upgrades[upgradeType]}`);
});

// Health regen loop
setInterval(() => {
  if (!currentPlayer) return;
  if (currentPlayer.health < currentPlayer.maxHealth) {
    currentPlayer.health = Math.min(currentPlayer.maxHealth, currentPlayer.health + 0.1 * (upgrades.regen + 1));
  }
}, 100);

// Start game loop
requestAnimationFrame(gameLoop);
