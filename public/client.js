const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const mainMenu = document.getElementById('main-menu');
const startGameBtn = document.getElementById('startGameBtn');
const playerNameInput = document.getElementById('playerNameInput');

const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const teamScoreEl = document.getElementById('teamScore');

const upgradesPanel = document.getElementById('upgradesPanel');
const toggleUpgradesBtn = document.getElementById('toggleUpgrades');
const closeUpgradesBtn = document.getElementById('closeUpgrades');
const upgradeButtons = [...document.querySelectorAll('.upgradeBtn')];

const chatContainer = document.getElementById('chatContainer');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

let players = {};
let bots = {};
let projectiles = {};
let coins = {};

let playerId = null;
let player = null;
let gameStarted = false;

const keys = {};

let cameraX = 0;
let cameraY = 0;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;

const lerp = (a, b, t) => a + (b - a) * t;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

function drawRoundedRect(x, y, w, h, r, fillStyle, strokeStyle, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Draw 3D-ish circle with simple shading
function draw3DCircle(x, y, radius, color1, color2) {
  let gradient = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Draw health bar above entities
function drawHealthBar(x, y, width, height, healthPercent) {
  ctx.fillStyle = '#555';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = healthPercent > 0.5 ? '#27ae60' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(x, y, width * healthPercent, height);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
}

// Draw player/bot tank with barrel and saw (bot)
function drawTank(entity, x, y, isPlayer = false) {
  // Body circle with 3D shading
  draw3DCircle(x, y, entity.size, entity.color1, entity.color2);

  // Barrel
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(entity.angle);
  ctx.fillStyle = '#444';
  ctx.fillRect(0, -entity.size / 6, entity.size * 1.5, entity.size / 3);

  // Barrel highlight
  ctx.fillStyle = '#888';
  ctx.fillRect(5, -entity.size / 8, entity.size * 0.8, entity.size / 8);
  ctx.restore();

  // Saw blade (for bots)
  if (!isPlayer) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(entity.sawAngle || 0);
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(entity.size + 6, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 6);
    }
    ctx.restore();
  }

  // Health bar
  drawHealthBar(x - entity.size, y - entity.size - 10, entity.size * 2, 6, entity.health / entity.maxHealth);

  // Name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(entity.name || 'Bot', x, y - entity.size - 20);

  // Team circle outline
  if (entity.team === 'red') {
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, entity.size + 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (entity.team === 'blue') {
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, entity.size + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Draw projectile with glow
function drawProjectile(proj) {
  const glow = ctx.createRadialGradient(proj.x, proj.y, proj.size / 4, proj.x, proj.y, proj.size);
  glow.addColorStop(0, '#ffcc00');
  glow.addColorStop(1, '#996600');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
  ctx.fill();
}

// Draw coin with shine effect
function drawCoin(coin) {
  const gradient = ctx.createRadialGradient(coin.x, coin.y, coin.size / 3, coin.x, coin.y, coin.size);
  gradient.addColorStop(0, '#ffeb3b');
  gradient.addColorStop(1, '#fbc02d');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, coin.size, 0, Math.PI * 2);
  ctx.fill();

  // Shine
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(coin.x - coin.size / 3, coin.y - coin.size / 3, coin.size / 1.8, 0, Math.PI * 2);
  ctx.stroke();
}

// Camera and smoothing
function updateCamera() {
  if (!player) return;
  const targetX = player.x - canvas.width / 2;
  const targetY = player.y - canvas.height / 2;

  cameraX = lerp(cameraX, targetX, 0.15);
  cameraY = lerp(cameraY, targetY, 0.15);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Input handling
const inputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shooting: false,
  autofire: false,
};

window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      inputState.up = true;
      break;
    case 's':
    case 'arrowdown':
      inputState.down = true;
      break;
    case 'a':
    case 'arrowleft':
      inputState.left = true;
      break;
    case 'd':
    case 'arrowright':
      inputState.right = true;
      break;
    case ' ':
      inputState.shooting = true;
      break;
    case 'e':
      inputState.autofire = !inputState.autofire;
      break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      inputState.up = false;
      break;
    case 's':
    case 'arrowdown':
      inputState.down = false;
      break;
    case 'a':
    case 'arrowleft':
      inputState.left = false;
      break;
    case 'd':
    case 'arrowright':
      inputState.right = false;
      break;
    case ' ':
      inputState.shooting = false;
      break;
  }
});

// Mouse aiming
canvas.addEventListener('mousemove', (e) => {
  if (!player) return;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  player.angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
  sendMovement();
});

// Mouse shooting on click
canvas.addEventListener('mousedown', (e) => {
  if (!player) return;
  socket.emit('shoot');
});

// Send player movement to server
function sendMovement() {
  if (!player) return;

  // Calculate new player position based on input
  let dx = 0,
    dy = 0;
  if (inputState.up) dy -= player.speed;
  if (inputState.down) dy += player.speed;
  if (inputState.left) dx -= player.speed;
  if (inputState.right) dx += player.speed;

  // Normalize diagonal speed
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  // Update position locally for smoothness
  player.x = Math.max(player.size, Math.min(player.x + dx, MAP_WIDTH - player.size));
  player.y = Math.max(player.size, Math.min(player.y + dy, MAP_HEIGHT - player.size));

  socket.emit('playerMovement', { x: player.x, y: player.y, angle: player.angle });
}

// Game loop
function gameLoop() {
  if (!gameStarted) return;

  if (inputState.autofire) {
    socket.emit('shoot');
  } else if (inputState.shooting) {
    socket.emit('shoot');
  }

  sendMovement();
  updateCamera();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw map background
  ctx.fillStyle = '#111';
  ctx.fillRect(-cameraX, -cameraY, MAP_WIDTH, MAP_HEIGHT);

  // Draw coins
  Object.values(coins).forEach(drawCoin);

  // Draw bots
  Object.values(bots).forEach((bot) => {
    drawTank(bot, bot.x - cameraX, bot.y - cameraY, false);
  });

  // Draw players
  Object.values(players).forEach((p) => {
    drawTank(p, p.x - cameraX, p.y - cameraY, true);
  });

  // Draw projectiles
  Object.values(projectiles).forEach(drawProjectile);

  // Draw mini map (top right)
  drawMiniMap();

  // Update HUD
  if (player) {
    scoreEl.textContent = player.score;
    coinsEl.textContent = player.coins;
    if (player.team) {
      teamScoreEl.textContent = `Team Score: ${teamScores[player.team] || 0}`;
    } else {
      teamScoreEl.textContent = '';
    }
  }

  requestAnimationFrame(gameLoop);
}

// Mini map drawing
function drawMiniMap() {
  const mapWidth = 200;
  const mapHeight = 150;
  const padding = 20;

  const x = canvas.width - mapWidth - padding;
  const y = padding;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x, y, mapWidth, mapHeight);

  // Border
  ctx.strokeStyle = '#00bfff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, mapWidth, mapHeight);

  // Scale ratio
  const scaleX = mapWidth / MAP_WIDTH;
  const scaleY = mapHeight / MAP_HEIGHT;

  // Draw coins on mini map
  Object.values(coins).forEach((coin) => {
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(x + coin.x * scaleX, y + coin.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw bots on mini map
  Object.values(bots).forEach((bot) => {
    ctx.fillStyle = bot.team === 'red' ? '#e74c3c' : bot.team === 'blue' ? '#3498db' : '#f39c12';
    ctx.beginPath();
    ctx.arc(x + bot.x * scaleX, y + bot.y * scaleY, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw players on mini map
  Object.values(players).forEach((p) => {
    ctx.fillStyle = p.team === 'red' ? '#e74c3c' : p.team === 'blue' ? '#3498db' : '#00bfff';
    ctx.beginPath();
    ctx.arc(x + p.x * scaleX, y + p.y * scaleY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Player pointer (white border)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + p.x * scaleX, y + p.y * scaleY, 7, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Socket events
let teamScores = {};

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('init', (data) => {
  players = data.players;
  bots = data.bots;
  projectiles = data.projectiles;
  coins = data.coins;

  playerId = socket.id;
  player = players[playerId];

  // Hide menu, show HUD
  mainMenu.classList.add('hidden');
  hud.classList.remove('hidden');

  gameStarted = true;
  gameLoop();
});

socket.on('newPlayer', (p) => {
  players[p.id] = p;
});

socket.on('removePlayer', (id) => {
  delete players[id];
});

socket.on('updatePlayers', (data) => {
  players = data;
  player = players[playerId];
});

socket.on('updateBots', (data) => {
  bots = data;
});

socket.on('newProjectile', (proj) => {
  projectiles[proj.id] = proj;
});

socket.on('removeProjectile', (id) => {
  delete projectiles[id];
});

socket.on('updateProjectiles', (data) => {
  projectiles = data;
});

socket.on('spawnCoin', (coin) => {
  coins[coin.id] = coin;
});

socket.on('removeCoin', (id) => {
  delete coins[id];
});

socket.on('updateCoins', (data) => {
  coins = data;
});

socket.on('leaderboard', (topPlayers) => {
  // Could implement leaderboard UI here
});

socket.on('teamScores', (scores) => {
  teamScores = scores;
});

socket.on('chatMessage', (msg) => {
  const msgEl = document.createElement('div');
  msgEl.className = 'chatMessage';
  msgEl.textContent = `${msg.team ? `[${msg.team.toUpperCase()}] ` : ''}${msg.name}: ${msg.message}`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Button events
startGameBtn.onclick = () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    alert('Please enter your name!');
    return;
  }
  const mode = document.querySelector('input[name="mode"]:checked').value;
  socket.emit('playerJoin', { name, mode });
};

toggleUpgradesBtn.onclick = () => {
  upgradesPanel.classList.toggle('hidden');
};

closeUpgradesBtn.onclick = () => {
  upgradesPanel.classList.add('hidden');
};

upgradeButtons.forEach((btn) => {
  btn.onclick = () => {
    const upgrade = btn.getAttribute('data-upgrade');
    socket.emit('upgrade', upgrade);
  };
});

toggleChatBtn.onclick = () => {
  chatContainer.classList.toggle('hidden');
};

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    socket.emit('chatMessage', chatInput.value.trim());
    chatInput.value = '';
  }
});
