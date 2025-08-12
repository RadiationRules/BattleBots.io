(() => {
  const socket = io();

  // Canvas setup
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W, H;

  // Resize canvas full window
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener('resize', resize);
  resize();

  // UI Elements
  const mainMenu = document.getElementById('main-menu');
  const playBtn = document.getElementById('play-btn');
  const playerNameInput = document.getElementById('player-name');
  const gameModeSelect = document.getElementById('game-mode');
  const ui = document.getElementById('ui');
  const healthSpan = document.getElementById('health');
  const coinsSpan = document.getElementById('coins');
  const leaderboardList = document.getElementById('leaderboard-list');
  const upgradesPanel = document.getElementById('upgrades-panel');
  const upgradeButtons = upgradesPanel.querySelectorAll('button.upgrade');
  const closeUpgradesBtn = document.getElementById('close-upgrades');
  const upgradeMsg = document.getElementById('upgrade-message');
  const upgradeBtn = document.getElementById('upgrade-btn');

  // Game state
  let playerId = null;
  let players = {};
  let bots = {};
  let projectiles = {};
  let coins = {};
  let chests = {};
  let leaderboard = [];

  let keys = {};
  let mousePos = { x: 0, y: 0 };
  let mouseDown = false;
  let inGame = false;

  let lastShootTime = 0;

  // Controls
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'e') {
      shoot();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', () => { mouseDown = true; });
  canvas.addEventListener('mouseup', () => { mouseDown = false; });

  // Enter game
  playBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Anonymous';
    const mode = gameModeSelect.value;
    if (name.length === 0) {
      alert('Please enter your name.');
      return;
    }
    startGame(name, mode);
  });

  function startGame(name, mode) {
    mainMenu.style.display = 'none';
    canvas.style.display = 'block';
    ui.classList.remove('hidden');
    playerId = socket.id;
    socket.emit('joinGame', { name, mode });
    inGame = true;
  }

  // Receive initial game state
  socket.on('init', (data) => {
    players = data.players;
    bots = data.bots;
    coins = data.coins;
    chests = data.chests;
    projectiles = data.projectiles;
    playerId = socket.id;
  });

  socket.on('newPlayer', (player) => {
    players[player.id] = player;
  });

  socket.on('removePlayer', (id) => {
    delete players[id];
  });

  socket.on('updatePlayers', (data) => {
    players = data;
  });

  socket.on('updateBots', (data) => {
    bots = data;
  });

  socket.on('updateProjectiles', (data) => {
    projectiles = data;
  });

  socket.on('newProjectile', (proj) => {
    projectiles[proj.id] = proj;
  });

  socket.on('removeProjectile', (id) => {
    delete projectiles[id];
  });

  socket.on('spawnCoin', (coin) => {
    coins[coin.id] = coin;
  });

  socket.on('removeCoin', (id) => {
    delete coins[id];
  });

  socket.on('removeChest', (id) => {
    delete chests[id];
  });

  socket.on('updateCoins', (data) => {
    coins = data;
  });

  socket.on('updateChests', (data) => {
    chests = data;
  });

  socket.on('leaderboard', (list) => {
    leaderboard = list;
    renderLeaderboard();
  });

  socket.on('upgradeFailed', (msg) => {
    showUpgradeMessage(msg, true);
  });

  socket.on('upgradeSuccess', (type) => {
    showUpgradeMessage(`${type} upgraded!`, false);
  });

  // Upgrade panel toggle
  upgradeBtn.addEventListener('click', () => {
    upgradesPanel.classList.remove('hidden');
  });
  closeUpgradesBtn.addEventListener('click', () => {
    upgradesPanel.classList.add('hidden');
    upgradeMsg.textContent = '';
  });

  upgradeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.upgrade;
      socket.emit('buyUpgrade', type);
    });
  });

  // Show upgrade messages with fade
  let upgradeMsgTimeout;
  function showUpgradeMessage(msg, isError) {
    clearTimeout(upgradeMsgTimeout);
    upgradeMsg.textContent = msg;
    upgradeMsg.style.color = isError ? '#e74c3c' : '#2ecc71';
    upgradeMsgTimeout = setTimeout(() => {
      upgradeMsg.textContent = '';
    }, 2500);
  }

  // Game loop
  function gameLoop() {
    if (!inGame) {
      requestAnimationFrame(gameLoop);
      return;
    }

    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  function update() {
    const player = players[playerId];
    if (!player) return;

    // Movement
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= player.speed;
    if (keys['s'] || keys['arrowdown']) dy += player.speed;
    if (keys['a'] || keys['arrowleft']) dx -= player.speed;
    if (keys['d'] || keys['arrowright']) dx += player.speed;

    // Normalize diagonal speed
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    player.x = Math.min(Math.max(player.size, player.x + dx), 1600 - player.size);
    player.y = Math.min(Math.max(player.size, player.y + dy), 1200 - player.size);

    // Angle toward mouse
    player.angle = Math.atan2(mousePos.y - H / 2, mousePos.x - W / 2);

    // Autoshot with 'e' held down
    if (keys['e']) {
      shoot();
    }

    // Send movement to server
    socket.emit('playerMovement', { x: player.x, y: player.y, angle: player.angle });

    // Update UI health and coins
    healthSpan.textContent = Math.floor(player.health);
    coinsSpan.textContent = player.coins;
  }

  let canShoot = true;
  function shoot() {
    if (!canShoot) return;
    canShoot = false;
    socket.emit('shoot');
    setTimeout(() => { canShoot = true; }, 50); // Prevent spam (will be rate-limited server-side)
  }

  // Draw rotated rectangle helper
  function drawRotatedRect(x, y, w, h, angle, fillStyle, strokeStyle, lineWidth = 2) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Render the game
  function render() {
    // Clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#2c3e50');
    gradient.addColorStop(1, '#34495e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    const player = players[playerId];
    if (!player) return;

    // Calculate camera offset to center player
    const camX = player.x - W / 2;
    const camY = player.y - H / 2;

    // Draw coins
    Object.values(coins).forEach(c => {
      const screenX = c.x - camX;
      const screenY = c.y - camY;
      ctx.beginPath();
      ctx.fillStyle = '#f1c40f';
      ctx.shadowColor = '#f39c12';
      ctx.shadowBlur = 8;
      ctx.arc(screenX, screenY, c.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw chests
    Object.values(chests).forEach(ch => {
      const screenX = ch.x - camX;
      const screenY = ch.y - camY;
      ctx.fillStyle = '#d35400';
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 3;
      ctx.fillRect(screenX - ch.size / 2, screenY - ch.size / 2, ch.size, ch.size);
      ctx.strokeRect(screenX - ch.size / 2, screenY - ch.size / 2, ch.size, ch.size);
    });

    // Draw bots
    Object.values(bots).forEach(bot => {
      const screenX = bot.x - camX;
      const screenY = bot.y - camY;
      // Body
      ctx.fillStyle = bot.color1;
      ctx.strokeStyle = bot.color2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(screenX, screenY, bot.size, bot.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Saw blade animation (rotating circle on top)
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(bot.sawAngle || 0);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, bot.size * 0.8);
        ctx.rotate(Math.PI / 6);
      }
      ctx.stroke();
      ctx.restore();

      // Health bar above bot
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(screenX - bot.size, screenY - bot.size - 10, bot.size * 2, 5);
      ctx.fillStyle = '#2ecc71';
      const healthWidth = (bot.health / bot.maxHealth) * bot.size * 2;
      ctx.fillRect(screenX - bot.size, screenY - bot.size - 10, healthWidth, 5);

      // Bot name text
      ctx.fillStyle = '#f39c12';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(bot.name, screenX, screenY + bot.size + 15);
    });

    // Draw players
    Object.values(players).forEach(p => {
      if (!p) return;
      const screenX = p.x - camX;
      const screenY = p.y - camY;

      // Body with gradient fill for player
      const gradient = ctx.createRadialGradient(screenX, screenY, p.size * 0.1, screenX, screenY, p.size);
      gradient.addColorStop(0, '#2980b9');
      gradient.addColorStop(1, '#1c5980');
      ctx.fillStyle = gradient;
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(screenX, screenY, p.size, p.size * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Gun barrel rotated by angle
      drawRotatedRect(screenX, screenY, p.size * 1.2, p.size * 0.3, p.angle, '#3498db', '#2980b9');

      // Health bar
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(screenX - p.size, screenY - p.size - 12, p.size * 2, 6);
      ctx.fillStyle = '#2ecc71';
      const hpWidth = (p.health / p.maxHealth) * p.size * 2;
      ctx.fillRect(screenX - p.size, screenY - p.size - 12, hpWidth, 6);

      // Name text
      ctx.fillStyle = '#f39c12';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, screenX, screenY + p.size + 20);
    });

    // Draw projectiles
    Object.values(projectiles).forEach(proj => {
      const screenX = proj.x - camX;
      const screenY = proj.y - camY;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(proj.angle);
      ctx.fillStyle = '#f1c40f';
      ctx.shadowColor = '#f39c12';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.rect(-proj.size / 2, -proj.size / 2, proj.size * 2, proj.size);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }

  // Leaderboard render
  function renderLeaderboard() {
    leaderboardList.innerHTML = '';
    leaderboard.forEach(({ name, score, coins }) => {
      const li = document.createElement('li');
      li.textContent = `${name} — ${score} pts, ${coins} coins`;
      leaderboardList.appendChild(li);
    });
  }

  // Start main loop
  gameLoop();
})();
