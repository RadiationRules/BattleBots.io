// client.js

const socket = io();

// Canvas & context
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Resize canvas to container
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Game state
let players = {};
let bots = {};
let projectiles = {};
let coins = {};
let leaderboard = [];
let playerId = null;
let playerName = null;

// Input state
const inputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  autoShoot: false,
  mouseX: 0,
  mouseY: 0,
  angle: 0,
};

// Smooth movement variables
let smoothX = 0;
let smoothY = 0;
let smoothAngle = 0;

// DOM references
const menuDiv = document.getElementById('menu');
const nameInput = document.getElementById('name-input');
const playBtn = document.getElementById('play-btn');
const healthFill = document.getElementById('health-fill');
const scoreCoins = document.getElementById('score-coins');
const leaderboardList = document.getElementById('leaderboard-list');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const upgradesPanel = document.getElementById('upgrades-panel');
const openUpgradesBtn = document.getElementById('open-upgrades');
const closeUpgradesBtn = document.getElementById('close-upgrades');

// --- Utility ---
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// --- Player Join ---
playBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (name.length < 2) {
    alert('Please enter a valid name (at least 2 characters)');
    return;
  }
  playerName = name;
  socket.emit('playerJoined', { name: playerName });
  menuDiv.classList.add('hidden');
});

// --- Receive Initial Game Data ---
socket.on('init', (data) => {
  players = data.players;
  bots = data.bots;
  coins = data.coins;
  projectiles = data.projectiles;
  playerId = socket.id;

  // Initialize smooth positions
  if (players[playerId]) {
    smoothX = players[playerId].x;
    smoothY = players[playerId].y;
    smoothAngle = players[playerId].angle;
  }
});

// --- Update players, bots, projectiles, coins ---
socket.on('updatePlayers', (data) => {
  players = data;
});

socket.on('updateBots', (data) => {
  bots = data;
});

socket.on('updateProjectiles', (data) => {
  projectiles = data;
});

socket.on('updateCoins', (data) => {
  coins = data;
});

// --- Leaderboard update ---
socket.on('leaderboard', (data) => {
  leaderboard = data;
  updateLeaderboardUI();
});

// --- Chat messages ---
socket.on('chatMessage', ({ name, message }) => {
  addChatMessage(name, message);
});

// --- UI updates ---
function updateLeaderboardUI() {
  leaderboardList.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${p.id === playerId ? 'You' : p.id}</span>
                    <span class="score">${p.score}</span>`;
    leaderboardList.appendChild(li);
  });
}

function addChatMessage(name, message) {
  const msgDiv = document.createElement('div');
  msgDiv.innerHTML = `<span class="name">${name}:</span> <span class="message">${message}</span>`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- Handle Input ---
window.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;

  if (e.key === 'w' || e.key === 'ArrowUp') inputState.up = true;
  if (e.key === 'a' || e.key === 'ArrowLeft') inputState.left = true;
  if (e.key === 's' || e.key === 'ArrowDown') inputState.down = true;
  if (e.key === 'd' || e.key === 'ArrowRight') inputState.right = true;
  if (e.key === ' ') inputState.shoot = true;
  if (e.key.toLowerCase() === 'e') inputState.autoShoot = !inputState.autoShoot;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'ArrowUp') inputState.up = false;
  if (e.key === 'a' || e.key === 'ArrowLeft') inputState.left = false;
  if (e.key === 's' || e.key === 'ArrowDown') inputState.down = false;
  if (e.key === 'd' || e.key === 'ArrowRight') inputState.right = false;
  if (e.key === ' ') inputState.shoot = false;
});

// Mouse to get angle
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  inputState.mouseX = e.clientX - rect.left;
  inputState.mouseY = e.clientY - rect.top;
});

// Send chat messages
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    socket.emit('chatMessage', { message: chatInput.value.trim() });
    chatInput.value = '';
  }
});

// --- Game Loop & Rendering ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Smooth player movement interpolation
  const player = players[playerId];
  if (player) {
    smoothX = lerp(smoothX, player.x * (canvas.width / 900), 0.15);
    smoothY = lerp(smoothY, player.y * (canvas.height / 700), 0.15);

    // Calculate aiming angle
    const dx = inputState.mouseX - smoothX;
    const dy = inputState.mouseY - smoothY;
    smoothAngle = Math.atan2(dy, dx);

    // Send movement updates
    let newX = player.x;
    let newY = player.y;
    if (inputState.up) newY -= player.speed;
    if (inputState.down) newY += player.speed;
    if (inputState.left) newX -= player.speed;
    if (inputState.right) newX += player.speed;

    // Clamp position inside map
    newX = clamp(newX, player.size, 900 - player.size);
    newY = clamp(newY, player.size, 700 - player.size);

    if (newX !== player.x || newY !== player.y || smoothAngle !== player.angle) {
      socket.emit('playerMovement', { x: newX, y: newY, angle: smoothAngle });
    }

    // Shoot if space pressed or autofire enabled
    if (inputState.shoot || inputState.autoShoot) {
      socket.emit('shoot');
    }
  }

  // Draw coins
  Object.values(coins).forEach((coin) => {
    const cx = coin.x * (canvas.width / 900);
    const cy = coin.y * (canvas.height / 700);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(cx, cy, coin.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'gold';
    ctx.shadowBlur = 10;
  });

  // Draw bots
  Object.values(bots).forEach((bot) => {
    const bx = bot.x * (canvas.width / 900);
    const by = bot.y * (canvas.height / 700);
    const radius = bot.size * (canvas.width / 900);

    // Bot body
    ctx.fillStyle = bot.color1;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bot health bar above
    ctx.fillStyle = '#333';
    ctx.fillRect(bx - radius, by - radius - 15, radius * 2, 6);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(bx - radius, by - radius - 15, (bot.health / bot.maxHealth) * radius * 2, 6);
  });

  // Draw projectiles
  Object.values(projectiles).forEach((p) => {
    const px = p.x * (canvas.width / 900);
    const py = p.y * (canvas.height / 700);
    ctx.fillStyle = '#00ccff';
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw player
  if (player) {
    const px = smoothX;
    const py = smoothY;
    const radius = player.size * (canvas.width / 900);

    // Player base
    ctx.fillStyle = player.color1;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    // Player turret
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(smoothAngle);
    ctx.fillStyle = player.color2;
    ctx.fillRect(0, -radius / 4, radius * 1.5, radius / 2);
    ctx.restore();

    // Player health bar
    healthFill.style.width = `${(player.health / player.maxHealth) * 100}%`;

    // Player score and coins
    scoreCoins.textContent = `Score: ${player.score} | Coins: ${player.coins}`;
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
// --- Upgrades Panel Logic ---

// Upgrade states and prices
const upgrades = {
  damage: { level: 0, maxLevel: 5, basePrice: 20 },
  bulletSpeed: { level: 0, maxLevel: 5, basePrice: 30 },
  health: { level: 0, maxLevel: 5, basePrice: 25 },
  healthRegen: { level: 0, maxLevel: 5, basePrice: 40 },
  reloadSpeed: { level: 0, maxLevel: 5, basePrice: 35 },
};

function calculatePrice(upgrade) {
  const base = upgrades[upgrade].basePrice;
  const level = upgrades[upgrade].level;
  return base + level * base * 1.5; // price scales exponentially
}

// Render upgrades UI
function renderUpgrades() {
  upgradesPanel.innerHTML = ''; // clear

  Object.keys(upgrades).forEach((key) => {
    const up = upgrades[key];
    const price = Math.floor(calculatePrice(key));
    const disabled = up.level >= up.maxLevel || (players[playerId]?.coins ?? 0) < price;

    const upDiv = document.createElement('div');
    upDiv.className = 'upgrade-item';

    upDiv.innerHTML = `
      <h4>${key.charAt(0).toUpperCase() + key.slice(1)} (Level ${up.level}/${up.maxLevel})</h4>
      <button ${disabled ? 'disabled' : ''} data-upgrade="${key}">
        Buy Upgrade (${price} coins)
      </button>
    `;

    upgradesPanel.appendChild(upDiv);
  });
}

// Buy upgrade handler
upgradesPanel.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    const upKey = e.target.getAttribute('data-upgrade');
    const player = players[playerId];
    if (!player) return;

    const price = Math.floor(calculatePrice(upKey));
    if (player.coins >= price && upgrades[upKey].level < upgrades[upKey].maxLevel) {
      // Deduct coins
      player.coins -= price;
      upgrades[upKey].level++;

      // Send upgrade purchase event to server
      socket.emit('buyUpgrade', { upgrade: upKey, level: upgrades[upKey].level });

      // Update UI
      renderUpgrades();
      scoreCoins.textContent = `Score: ${player.score} | Coins: ${player.coins}`;
    }
  }
});

// Open/close upgrades panel buttons
openUpgradesBtn.addEventListener('click', () => {
  upgradesPanel.style.display = 'block';
  openUpgradesBtn.style.display = 'none';
});
closeUpgradesBtn.addEventListener('click', () => {
  upgradesPanel.style.display = 'none';
  openUpgradesBtn.style.display = 'inline-block';
});

// Initial upgrades UI render
renderUpgrades();

// --- Chat toggle ---

const chatToggleBtn = document.getElementById('chat-toggle-btn');
chatToggleBtn.addEventListener('click', () => {
  if (chatPanel.style.display === 'none' || !chatPanel.style.display) {
    chatPanel.style.display = 'block';
  } else {
    chatPanel.style.display = 'none';
  }
});

// --- Animations & polish ---

// Simple fade-in for menu and UI elements on load
function fadeIn(element, duration = 500) {
  element.style.opacity = 0;
  element.style.display = 'block';
  let last = performance.now();

  function tick(now) {
    const elapsed = now - last;
    last = now;
    let opacity = parseFloat(element.style.opacity);
    opacity += elapsed / duration;
    if (opacity > 1) opacity = 1;
    element.style.opacity = opacity;
    if (opacity < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Fade menu in on page load
fadeIn(menuDiv);

// --- Additional game loop polish ---

function drawRoundedRect(ctx, x, y, width, height, radius, fillColor, strokeColor) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }
}

// Replace health bar drawing with rounded bar
// (Add this inside the gameLoop function replacing previous health bar draw for bots and player)

