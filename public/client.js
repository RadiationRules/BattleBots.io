(() => {
  const socket = io();

  // --- Canvas setup ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const MAP_WIDTH = 2200;
  const MAP_HEIGHT = 1600;

  // Entities
  let players = {};
  let bots = {};
  let projectiles = {};
  let coins = {};

  // Local player
  let playerId = null;
  let player = null;

  // Camera offset
  let cameraX = 0;
  let cameraY = 0;

  // Input state
  let keys = {};
  let mousePos = { x: WIDTH / 2, y: HEIGHT / 2 };
  let mouseDown = false;
  let autofire = false;

  // Game running flag
  let gameRunning = false;

  // Elements
  const mainMenu = document.getElementById('mainMenu');
  const playerNameInput = document.getElementById('playerNameInput');
  const startGameBtn = document.getElementById('startGameBtn');

  const leaderboardList = document.querySelector('#leaderboard ul');
  const coinsDisplay = document.getElementById('coinsDisplay');
  const autofireToggle = document.getElementById('autofireToggle');
  const popupMessage = document.getElementById('popupMessage');
  const popupText = document.getElementById('popupText');
  const popupCloseBtn = popupMessage.querySelector('.closeBtn');
  const debugOverlay = document.getElementById('debugOverlay');
  const upgradesPanel = document.getElementById('upgradesPanel');

  // --- Utility ---
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lerp(a,b,t) {
    return a + (b - a) * t;
  }

  function angleBetween(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // --- Draw functions ---
  function drawPlayer(p, isLocal = false) {
    const screenX = p.x - cameraX;
    const screenY = p.y - cameraY;

    // Draw shadow/glow
    ctx.shadowColor = isLocal ? '#00ffff' : '#0055ff';
    ctx.shadowBlur = 14;

    // Body circle with gradient (3D style)
    let grad = ctx.createRadialGradient(screenX, screenY, p.radius * 0.3, screenX, screenY, p.radius);
    grad.addColorStop(0, isLocal ? '#00ffff' : '#3399ff');
    grad.addColorStop(1, isLocal ? '#004455' : '#002244');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(screenX, screenY, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Health bar
    const hpWidth = p.radius * 2;
    const hpHeight = 6;
    const hpX = screenX - p.radius;
    const hpY = screenY - p.radius - 16;

    ctx.fillStyle = 'rgba(255,0,0,0.7)';
    ctx.fillRect(hpX, hpY, hpWidth, hpHeight);
    ctx.fillStyle = 'limegreen';
    ctx.fillRect(hpX, hpY, hpWidth * (p.health / p.maxHealth), hpHeight);
    ctx.strokeStyle = '#0008';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpWidth, hpHeight);

    // Draw turret direction line
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + Math.cos(p.angle) * p.radius * 1.4, screenY + Math.sin(p.angle) * p.radius * 1.4);
    ctx.stroke();

    // Draw name above
    ctx.font = 'bold 18px Segoe UI';
    ctx.fillStyle = '#00ffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000a';
    ctx.shadowBlur = 4;
    ctx.fillText(p.name, screenX, hpY - 8);

    ctx.shadowBlur = 0;
  }

  function drawBot(bot) {
    const screenX = bot.x - cameraX;
    const screenY = bot.y - cameraY;

    // Draw shadow/glow
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 14;

    // Body circle with gradient (3D style)
    let grad = ctx.createRadialGradient(screenX, screenY, bot.radius * 0.3, screenX, screenY, bot.radius);
    grad.addColorStop(0, '#ff6600');
    grad.addColorStop(1, '#662200');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(screenX, screenY, bot.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Saw blade rotating
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(bot.sawAngle);
    ctx.strokeStyle = '#ffbb44';
    ctx.lineWidth = 4;
    for(let i=0; i<6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bot.radius * 1.4, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 3);
    }
    ctx.restore();

    // Health bar
    const hpWidth = bot.radius * 2;
    const hpHeight = 6;
    const hpX = screenX - bot.radius;
    const hpY = screenY - bot.radius - 16;

    ctx.fillStyle = 'rgba(255,0,0,0.7)';
    ctx.fillRect(hpX, hpY, hpWidth, hpHeight);
    ctx.fillStyle = 'limegreen';
    ctx.fillRect(hpX, hpY, hpWidth * (bot.health / bot.maxHealth), hpHeight);
    ctx.strokeStyle = '#0008';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpWidth, hpHeight);

    // Name above
    ctx.font = 'bold 16px Segoe UI';
    ctx.fillStyle = '#ffbb00';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000a';
    ctx.shadowBlur = 4;
    ctx.fillText(bot.name, screenX, hpY - 8);

    ctx.shadowBlur = 0;
  }

  function drawProjectile(p) {
    const screenX = p.x - cameraX;
    const screenY = p.y - cameraY;

    ctx.fillStyle = 'cyan';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  }

  function drawCoin(c) {
    const screenX = c.x - cameraX;
    const screenY = c.y - cameraY;

    ctx.shadowColor = '#ffd500';
    ctx.shadowBlur = 16;

    ctx.fillStyle = c.isChest ? 'orange' : 'gold';
    ctx.beginPath();
    ctx.arc(screenX, screenY, c.radius, 0, Math.PI * 2);
    ctx.fill();

    // Coin shine
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX - c.radius / 2, screenY - c.radius / 3);
    ctx.lineTo(screenX + c.radius / 3, screenY + c.radius / 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  function drawMinimap() {
    const miniMap = document.getElementById('minimap');
    const mmCtx = miniMap.getContext ? miniMap.getContext('2d') : null;

    if(!mmCtx) {
      // Create canvas inside minimap div on first call
      miniMap.innerHTML = '<canvas width="200" height="140" style="border-radius:14px;"></canvas>';
      return;
    }

    mmCtx.clearRect(0,0,miniMap.width, miniMap.height);

    const scaleX = miniMap.width / MAP_WIDTH;
    const scaleY = miniMap.height / MAP_HEIGHT;

    // Background transparent rect
    mmCtx.fillStyle = 'rgba(10,30,70,0.8)';
    mmCtx.fillRect(0, 0, miniMap.width, miniMap.height);

    // Draw coins
    for(let cid in coins) {
      const c = coins[cid];
      mmCtx.fillStyle = c.isChest ? 'orange' : 'gold';
      mmCtx.beginPath();
      mmCtx.arc(c.x * scaleX, c.y * scaleY, 4, 0, Math.PI*2);
      mmCtx.fill();
    }

    // Draw bots
    for(let bid in bots) {
      const b = bots[bid];
      mmCtx.fillStyle = '#ff5500';
      mmCtx.beginPath();
      mmCtx.arc(b.x * scaleX, b.y * scaleY, 6, 0, Math.PI*2);
      mmCtx.fill();
    }

    // Draw players
    for(let pid in players) {
      const pl = players[pid];
      mmCtx.fillStyle = pid === playerId ? '#00ffff' : '#3399ff';
      mmCtx.beginPath();
      mmCtx.arc(pl.x * scaleX, pl.y * scaleY, 6, 0, Math.PI*2);
      mmCtx.fill();
    }

    // Draw player viewport rectangle
    const viewWidth = WIDTH * scaleX;
    const viewHeight = HEIGHT * scaleY;

    const viewX = clamp(cameraX * scaleX, 0, miniMap.width - viewWidth);
    const viewY = clamp(cameraY * scaleY, 0, miniMap.height - viewHeight);

    mmCtx.strokeStyle = '#00ffff';
    mmCtx.lineWidth = 2;
    mmCtx.strokeRect(viewX, viewY, viewWidth, viewHeight);
  }

  // --- Game update ---
  function update(deltaTime) {
    if(!player) return;

    // Move player with WASD keys
    let dx = 0, dy = 0;
    if(keys['w']) dy -= 1;
    if(keys['s']) dy += 1;
    if(keys['a']) dx -= 1;
    if(keys['d']) dx += 1;

    if(dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      player.x = clamp(player.x + dx * player.speed, player.radius, MAP_WIDTH - player.radius);
      player.y = clamp(player.y + dy * player.speed, player.radius, MAP_HEIGHT - player.radius);
    }

    // Update player angle toward mouse on screen
    const targetAngle = Math.atan2(mousePos.y - HEIGHT / 2, mousePos.x - WIDTH / 2);
    player.angle = targetAngle;

    // Shooting
    const now = Date.now();
    if((mouseDown || autofire) && now - player.lastShot >= player.shootCooldown) {
      socket.emit('shoot');
      player.lastShot = now;
    }

    // Health regen
    player.health = Math.min(player.health + player.regen * deltaTime, player.maxHealth);

    // Send player position and angle to server
    socket.emit('playerMovement', {x: player.x, y: player.y, angle: player.angle});

    // Camera follows player smoothly
    cameraX += (player.x - cameraX - WIDTH / 2) * 0.15;
    cameraY += (player.y - cameraY - HEIGHT / 2) * 0.15;

    // Draw everything
    draw();

    // Update debug info
    updateDebug();

    // Update minimap
    drawMinimap();
  }

  // --- Draw all ---
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw background grid for map
    ctx.fillStyle = '#081020';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = '#1a2b4a';
    ctx.lineWidth = 1;
    for(let x = -cameraX % 80; x < WIDTH; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for(let y = -cameraY % 80; y < HEIGHT; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    // Draw coins
    for(const cid in coins) drawCoin(coins[cid]);
    // Draw bots
    for(const bid in bots) drawBot(bots[bid]);
    // Draw players
    for(const pid in players) drawPlayer(players[pid], pid === playerId);
    // Draw projectiles
    for(const pid in projectiles) drawProjectile(projectiles[pid]);
  }

  // --- Update debug overlay ---
  function updateDebug() {
    if(!player) {
      debugOverlay.textContent = 'Waiting for game start...';
      return;
    }
    debugOverlay.textContent = [
      `Player ID: ${playerId}`,
      `Name: ${player.name}`,
      `Pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`,
      `Health: ${player.health.toFixed(1)} / ${player.maxHealth}`,
      `Coins: ${player.coins}`,
      `Score: ${player.score}`,
      `Autofire: ${autofire ? 'ON' : 'OFF'}`,
      `Upgrades: Damage ${player.upgrades.damage}, BulletSpeed ${player.upgrades.bulletSpeed}, Health ${player.upgrades.health}, Regen ${player.upgrades.regen.toFixed(3)}, ReloadSpeed ${player.upgrades.reloadSpeed}`
    ].join('\n');
  }

  // --- Popup Message ---
  function showPopup(msg) {
    popupText.textContent = msg;
    popupMessage.classList.add('show');
  }
  function hidePopup() {
    popupMessage.classList.remove('show');
  }
  popupCloseBtn.onclick = hidePopup;

  // --- UI Handlers ---
  startGameBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if(name.length < 3) {
      showPopup('Please enter a name with at least 3 characters.');
      return;
    }
    playerId = socket.id; // We'll update this properly once we get id
    socket.emit('playerJoined', name);
    mainMenu.style.display = 'none';
    gameRunning = true;
  });

  playerNameInput.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
      startGameBtn.click();
      e.preventDefault(); // Prevent form submission or scrolling
    }
  });

  // Upgrade buy buttons
  upgradesPanel.querySelectorAll('.buyBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const upgradeType = btn.parentElement.getAttribute('data-upgrade');
      socket.emit('buyUpgrade', upgradeType);
    });
  });

  // Autofire toggle by pressing E
  window.addEventListener('keydown', e => {
    if(e.key.toLowerCase() === 'e') {
      autofire = !autofire;
      socket.emit('toggleAutofire');
      autofireToggle.textContent = `Autofire: ${autofire ? 'ON' : 'OFF'} (Press E)`;
    }
    keys[e.key.toLowerCase()] = true;
  });

  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // Track mouse
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', e => {
    mouseDown = true;
  });
  canvas.addEventListener('mouseup', e => {
    mouseDown = false;
  });

  // --- Socket listeners ---
  socket.on('init', data => {
    players = data.players;
    bots = data.bots;
    coins = data.coins;
    projectiles = data.projectiles;
    playerId = socket.id;
    player = players[playerId];
  });

  socket.on('newPlayer', p => {
    players[p.id] = p;
  });

  socket.on('removePlayer', id => {
    delete players[id];
  });

  socket.on('updatePlayers', data => {
    players = data;
    player = players[playerId];
  });

  socket.on('updateBots', data => {
    bots = data;
  });

  socket.on('updateProjectiles', data => {
    projectiles = data;
  });

  socket.on('newProjectile', p => {
    projectiles[p.id] = p;
  });

  socket.on('removeProjectile', id => {
    delete projectiles[id];
  });

  socket.on('updateCoins', data => {
    coins = data;
  });

  socket.on('removeCoin', id => {
    delete coins[id];
  });

  socket.on('leaderboard', topPlayers => {
    leaderboardList.innerHTML = '';
    topPlayers.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.name} - Score: ${p.score} - Coins: ${p.coins}`;
      leaderboardList.appendChild(li);
    });
  });

  socket.on('upgradeSuccess', upgrades => {
    if(player) {
      player.upgrades = upgrades;
      // Update upgrade UI values
      upgradesPanel.querySelectorAll('.upgrade').forEach(div => {
        const key = div.getAttribute('data-upgrade');
        const valSpan = div.querySelector('.value');
        switch(key) {
          case 'damage':
            valSpan.textContent = 1 + upgrades.damage * 3;
            break;
          case 'bulletSpeed':
            valSpan.textContent = 1 + upgrades.bulletSpeed * 1.5;
            break;
          case 'health':
            valSpan.textContent = 100 + upgrades.health * 20;
            break;
          case 'regen':
            valSpan.textContent = (0.01 + upgrades.regen * 0.005).toFixed(3);
            break;
          case 'reloadSpeed':
            valSpan.textContent = (300 - upgrades.reloadSpeed * 40) + ' ms';
            break;
        }
      });
    }
  });

  socket.on('playerDied', () => {
    showPopup('You have died and respawned!');
    setTimeout(hidePopup, 4000);
  });

  socket.on('autofireStatus', status => {
    autofire = status;
    autofireToggle.textContent = `Autofire: ${autofire ? 'ON' : 'OFF'} (Press E)`;
  });

  // --- Main loop ---
  let lastTime = 0;
  function gameLoop(timestamp=0) {
    if(!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 16.666;
    lastTime = timestamp;

    if(gameRunning) update(deltaTime);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
