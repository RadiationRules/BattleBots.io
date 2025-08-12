(() => {
  // --- Setup Canvas ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  // --- Game constants ---
  const MAP_WIDTH = 2000;
  const MAP_HEIGHT = 1400;

  // Player constants
  const PLAYER_RADIUS = 30;
  const PLAYER_MAX_HEALTH_BASE = 100;
  const PLAYER_REGEN_BASE = 0.01;
  const PLAYER_SPEED_BASE = 4;
  const PLAYER_DAMAGE_BASE = 20;
  const PROJECTILE_SPEED_BASE = 12;
  const SHOOT_COOLDOWN_BASE = 300; // ms

  // Bot constants
  const BOT_RADIUS = 30;
  const BOT_SPEED = 2;
  const BOT_SHOOT_COOLDOWN = 1200; // bots shoot slower than player (nerfed 50%)

  // Coin constants
  const COIN_RADIUS = 12;
  const CHEST_COINS = [10, 25];

  // Upgrade costs
  const UPGRADE_COSTS = {
    damage: 5,
    bulletSpeed: 5,
    health: 10,
    regen: 10,
    reloadSpeed: 10,
  };

  // Bot names
  const BOT_NAMES = [
    "Sliker", "Tung Sahur", "YourMom", "ZeroCool", "Botinator",
    "Alpha", "Glitch", "Nano", "Cypher", "MechX", "Shadow", "Vortex"
  ];

  // --- Game state ---
  let keys = {};
  let mousePos = { x: WIDTH / 2, y: HEIGHT / 2 };
  let mouseDown = false;
  let autofire = false;

  // Player object
  let player = {
    name: '',
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2,
    radius: PLAYER_RADIUS,
    health: PLAYER_MAX_HEALTH_BASE,
    maxHealth: PLAYER_MAX_HEALTH_BASE,
    speed: PLAYER_SPEED_BASE,
    damage: PLAYER_DAMAGE_BASE,
    bulletSpeed: PROJECTILE_SPEED_BASE,
    shootCooldown: SHOOT_COOLDOWN_BASE,
    lastShot: 0,
    regen: PLAYER_REGEN_BASE,
    score: 0,
    coins: 0,
    upgrades: {
      damage: 0,
      bulletSpeed: 0,
      health: 0,
      regen: 0,
      reloadSpeed: 0,
    }
  };

  // Entities
  let bots = [];
  let projectiles = [];
  let coins = [];

  // Camera position for scrolling
  let cameraX = 0;
  let cameraY = 0;

  // --- Utility functions ---
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function angleBetween(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // --- Create Bots ---
  function createBot() {
    return {
      id: crypto.randomUUID(),
      name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
      x: randomRange(BOT_RADIUS, MAP_WIDTH - BOT_RADIUS),
      y: randomRange(BOT_RADIUS, MAP_HEIGHT - BOT_RADIUS),
      radius: BOT_RADIUS,
      health: 100,
      maxHealth: 100,
      speed: BOT_SPEED,
      angle: Math.random() * Math.PI * 2,
      lastShot: 0,
      shootCooldown: BOT_SHOOT_COOLDOWN,
      damage: player.damage * 0.5, // Nerfed damage for bots
      bulletSpeed: player.bulletSpeed * 0.75,
      targetAngle: 0,
      isDead: false,
    };
  }

  // Spawn initial bots
  for (let i = 0; i < 10; i++) bots.push(createBot());

  // --- Create Coins ---
  function createCoin(x, y, value = 1) {
    return {
      id: crypto.randomUUID(),
      x,
      y,
      radius: COIN_RADIUS,
      value,
      isChest: value > 1,
    };
  }

  // Spawn some initial coins randomly
  for (let i = 0; i < 20; i++) {
    coins.push(createCoin(randomRange(COIN_RADIUS, MAP_WIDTH - COIN_RADIUS), randomRange(COIN_RADIUS, MAP_HEIGHT - COIN_RADIUS), 1));
  }

  // Spawn some chests (10 or 25 coins)
  for (let i = 0; i < 5; i++) {
    const chestValue = CHEST_COINS[Math.floor(Math.random() * CHEST_COINS.length)];
    coins.push(createCoin(randomRange(COIN_RADIUS, MAP_WIDTH - COIN_RADIUS), randomRange(COIN_RADIUS, MAP_HEIGHT - COIN_RADIUS), chestValue));
  }

  // --- Input handling ---
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if(e.key.toLowerCase() === 'e') autofire = !autofire;
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });
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

  // --- Game Logic ---
  function updatePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
    if (keys['a']) dx -= 1;
    if (keys['d']) dx += 1;

    // Normalize movement vector
    if(dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    player.x += dx * player.speed;
    player.y += dy * player.speed;

    // Clamp inside map
    player.x = clamp(player.x, player.radius, MAP_WIDTH - player.radius);
    player.y = clamp(player.y, player.radius, MAP_HEIGHT - player.radius);

    // Update angle toward mouse position relative to camera
    player.angle = angleBetween(player, {x: mousePos.x + cameraX, y: mousePos.y + cameraY});

    // Health regen
    player.health = Math.min(player.health + player.regen, player.maxHealth);
  }

  function shootProjectile(owner, x, y, angle, damage, speed) {
    projectiles.push({
      id: crypto.randomUUID(),
      owner,
      x,
      y,
      angle,
      damage,
      speed,
      radius: 6,
    });
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;

      // Remove if off map
      if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
        projectiles.splice(i,1);
        continue;
      }

      // Check collision with bots or player
      if (p.owner !== 'player') {
        // Bots shoot player only
        if (distance(p, player) < player.radius + p.radius) {
          player.health -= p.damage;
          projectiles.splice(i,1);
          continue;
        }
      } else {
        // Player shoots bots
        let hit = false;
        for (let j = 0; j < bots.length; j++) {
          const bot = bots[j];
          if (distance(p, bot) < bot.radius + p.radius) {
            bot.health -= p.damage;
            if(bot.health <= 0){
              player.score += 10;
              player.coins += bot.radius; // coins reward based on bot size
              // Spawn coins at bot position
              let chestValue = (Math.random() < 0.2) ? 25 : 1;
              coins.push(createCoin(bot.x, bot.y, chestValue));
              // Respawn bot
              bots[j] = createBot();
            }
            projectiles.splice(i,1);
            hit = true;
            break;
          }
        }
        if(hit) continue;
      }
    }
  }

  // Bot AI logic: move randomly & shoot player if close
  function updateBots(dt) {
    bots.forEach(bot => {
      if(bot.isDead) return;

      // Move bot in current angle
      bot.x += Math.cos(bot.angle) * bot.speed;
      bot.y += Math.sin(bot.angle) * bot.speed;

      // Bounce on edges
      if(bot.x < bot.radius) bot.angle = Math.PI - bot.angle;
      if(bot.x > MAP_WIDTH - bot.radius) bot.angle = Math.PI - bot.angle;
      if(bot.y < bot.radius) bot.angle = -bot.angle;
      if(bot.y > MAP_HEIGHT - bot.radius) bot.angle = -bot.angle;

      // Slowly rotate saw angle for fun
      bot.sawAngle = (bot.sawAngle || 0) + 0.15;

      // Slowly regen health
      bot.health = Math.min(bot.health + 0.02, bot.maxHealth);

      // Rotate randomly a bit
      bot.angle += (Math.random() - 0.5) * 0.2;

      // Shoot at player if in range & cooldown done
      const distToPlayer = distance(bot, player);
      if(distToPlayer < 500){
        const now = performance.now();
        if(!bot.lastShot) bot.lastShot = 0;
        if(now - bot.lastShot > bot.shootCooldown){
          bot.lastShot = now;
          const bulletX = bot.x + Math.cos(bot.angle) * (bot.radius + 8);
          const bulletY = bot.y + Math.sin(bot.angle) * (bot.radius + 8);
          shootProjectile('bot', bulletX, bulletY, bot.angle, bot.damage, bot.bulletSpeed);
        }
      }
    });
  }

  // Coins pickup
  function checkCoinPickups(){
    for(let i=coins.length-1; i>=0; i--){
      if(distance(coins[i], player) < player.radius + coins[i].radius){
        player.coins += coins[i].value;
        player.score += coins[i].value * 5;
        coins.splice(i,1);
      }
    }
  }

  // --- Upgrade system ---
  function updateUpgradesUI(){
    const panel = document.getElementById('upgradesPanel');
    for(let div of panel.querySelectorAll('.upgrade')){
      const type = div.dataset.upgrade;
      let valSpan = div.querySelector('.value');
      if(type === 'damage'){
        valSpan.textContent = (player.damage).toFixed(1);
      } else if(type === 'bulletSpeed'){
        valSpan.textContent = (player.bulletSpeed).toFixed(1);
      } else if(type === 'health'){
        valSpan.textContent = player.maxHealth.toFixed(0);
      } else if(type === 'regen'){
        valSpan.textContent = player.regen.toFixed(3);
      } else if(type === 'reloadSpeed'){
        valSpan.textContent = (player.shootCooldown).toFixed(0) + ' ms';
      }
    }
  }
  function buyUpgrade(type){
    const cost = UPGRADE_COSTS[type];
    if(player.coins < cost) return alert('Not enough coins!');
    player.coins -= cost;
    player.upgrades[type]++;
    if(type === 'damage') player.damage += 2;
    else if(type === 'bulletSpeed') player.bulletSpeed += 2;
    else if(type === 'health'){
      player.maxHealth += 20;
      player.health += 20;
    }
    else if(type === 'regen') player.regen += 0.005;
    else if(type === 'reloadSpeed') player.shootCooldown = Math.max(50, player.shootCooldown - 30);
    updateUpgradesUI();
    updateCoinsDisplay();
  }

  // --- Leaderboard ---
  function updateLeaderboard(){
    const lb = document.querySelector('#leaderboard ul');
    // Gather all players + bots sorted by score
    let entries = [{name: player.name || "You", score: player.score, coins: player.coins}];
    bots.forEach(bot => {
      entries.push({name: bot.name, score: bot.health < 1 ? 0 : Math.round(bot.health), coins: 0});
    });
    entries.sort((a,b)=>b.score - a.score);
    entries = entries.slice(0,5);

    lb.innerHTML = '';
    entries.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${entry.name}`;
      const spanScore = document.createElement('span');
      spanScore.textContent = `Score: ${entry.score} | Coins: ${entry.coins}`;
      li.appendChild(spanScore);
      lb.appendChild(li);
    });
  }

  // --- Camera handling ---
  function updateCamera(){
    cameraX = clamp(player.x - WIDTH/2, 0, MAP_WIDTH - WIDTH);
    cameraY = clamp(player.y - HEIGHT/2, 0, MAP_HEIGHT - HEIGHT);
  }

  // --- Draw functions ---
  function drawMap(){
    ctx.fillStyle = '#111133';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw grid lines every 100 px
    ctx.strokeStyle = '#223366';
    ctx.lineWidth = 1;
    for(let x= -cameraX % 100; x < WIDTH; x+=100){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for(let y= -cameraY % 100; y < HEIGHT; y+=100){
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
  }

  function drawPlayer(){
    const screenX = player.x - cameraX;
    const screenY = player.y - cameraY;

    // Body
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(player.angle);

    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI*2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(player.radius/3, -player.radius/3, player.radius/6, 0, Math.PI*2);
    ctx.arc(player.radius/3, player.radius/3, player.radius/6, 0, Math.PI*2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(player.radius/3 + 2, -player.radius/3, player.radius/10, 0, Math.PI*2);
    ctx.arc(player.radius/3 + 2, player.radius/3, player.radius/10, 0, Math.PI*2);
    ctx.fill();

    // Saw blade on top
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 8, 0, Math.PI*2);
    ctx.stroke();

    ctx.restore();

    // Health bar
    const barWidth = 60;
    const barHeight = 8;
    const healthRatio = player.health / player.maxHealth;
    ctx.fillStyle = 'black';
    ctx.fillRect(screenX - barWidth/2, screenY + player.radius + 10, barWidth, barHeight);
    ctx.fillStyle = `rgb(${255 - healthRatio*255},${healthRatio*255},0)`;
    ctx.fillRect(screenX - barWidth/2, screenY + player.radius + 10, barWidth * healthRatio, barHeight);
  }

  function drawBots(){
    bots.forEach(bot => {
      if(bot.health <= 0) return;

      const screenX = bot.x - cameraX;
      const screenY = bot.y - cameraY;

      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(bot.angle);

      // Body
      ctx.fillStyle = '#e67e22';
      ctx.beginPath();
      ctx.arc(0, 0, bot.radius, 0, Math.PI*2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(bot.radius/3, -bot.radius/3, bot.radius/6, 0, Math.PI*2);
      ctx.arc(bot.radius/3, bot.radius/3, bot.radius/6, 0, Math.PI*2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(bot.radius/3 + 2, -bot.radius/3, bot.radius/10, 0, Math.PI*2);
      ctx.arc(bot.radius/3 + 2, bot.radius/3, bot.radius/10, 0, Math.PI*2);
      ctx.fill();

      // Name label
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(bot.name, 0, -bot.radius - 12);

      // Saw blade rotating
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const sawRadius = bot.radius + 8;
      const sawCount = 12;
      for(let i=0; i < sawCount; i++){
        const angle = i * (Math.PI * 2 / sawCount) + (bot.sawAngle || 0);
        const x = Math.cos(angle) * sawRadius;
        const y = Math.sin(angle) * sawRadius;
        ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.restore();

      // Health bar
      const barWidth = 50;
      const barHeight = 6;
      const healthRatio = bot.health / bot.maxHealth;
      ctx.fillStyle = 'black';
      ctx.fillRect(screenX - barWidth/2, screenY + bot.radius + 8, barWidth, barHeight);
      ctx.fillStyle = `rgb(${255 - healthRatio*255},${healthRatio*255},0)`;
      ctx.fillRect(screenX - barWidth/2, screenY + bot.radius + 8, barWidth * healthRatio, barHeight);
    });
  }

  function drawProjectiles(){
    projectiles.forEach(p => {
      const screenX = p.x - cameraX;
      const screenY = p.y - cameraY;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.rect(-p.radius/2, -p.radius/2, p.radius*2, p.radius);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawCoins(){
    coins.forEach(c => {
      const screenX = c.x - cameraX;
      const screenY = c.y - cameraY;
      ctx.fillStyle = c.isChest ? '#ffcc00' : '#ffff55';
      ctx.beginPath();
      ctx.arc(screenX, screenY, c.radius, 0, Math.PI*2);
      ctx.fill();

      if(c.isChest){
        ctx.strokeStyle = '#aa8800';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
  }

  // --- Minimap ---
  const minimap = document.getElementById('minimap');
  const minimapWidth = minimap.clientWidth;
  const minimapHeight = minimap.clientHeight;
  function drawMinimap(){
    const mmCtx = minimap.getContext('2d');
    if(!mmCtx) return;
    mmCtx.clearRect(0,0,minimapWidth,minimapHeight);

    // Background
    mmCtx.fillStyle = 'rgba(0,0,0,0.7)';
    mmCtx.fillRect(0,0,minimapWidth,minimapHeight);

    // Scale ratios
    const scaleX = minimapWidth / MAP_WIDTH;
    const scaleY = minimapHeight / MAP_HEIGHT;

    // Draw coins
    coins.forEach(c => {
      mmCtx.fillStyle = c.isChest ? '#ffcc00' : '#ffff55';
      mmCtx.beginPath();
      mmCtx.arc(c.x * scaleX, c.y * scaleY, 3, 0, Math.PI*2);
      mmCtx.fill();
    });

    // Draw bots
    bots.forEach(bot => {
      mmCtx.fillStyle = 'orange';
      mmCtx.beginPath();
      mmCtx.arc(bot.x * scaleX, bot.y * scaleY, 4, 0, Math.PI*2);
      mmCtx.fill();
    });

    // Draw player
    mmCtx.fillStyle = '#3498db';
    mmCtx.beginPath();
    mmCtx.arc(player.x * scaleX, player.y * scaleY, 5, 0, Math.PI*2);
    mmCtx.fill();

    // Outline player radius
    mmCtx.strokeStyle = 'white';
    mmCtx.lineWidth = 1;
    mmCtx.beginPath();
    mmCtx.arc(player.x * scaleX, player.y * scaleY, 6, 0, Math.PI*2);
    mmCtx.stroke();
  }

  // --- UI updates ---
  const coinsDisplay = document.getElementById('coinsDisplay');
  const autofireToggle = document.getElementById('autofireToggle');

  function updateCoinsDisplay(){
    coinsDisplay.textContent = `Coins: ${player.coins}`;
  }

  function updateAutofireToggle(){
    autofireToggle.textContent = `Autofire: ${autofire ? 'ON' : 'OFF'} (Press E)`;
    autofireToggle.style.color = autofire ? '#55ff55' : '#ff5555';
  }

  // --- Main Loop ---
  let lastTime = 0;
  function gameLoop(timestamp){
    const dt = (timestamp - lastTime)/1000 || 0;
    lastTime = timestamp;

    // Update
    updatePlayer(dt);
    updateBots(dt);
    updateProjectiles(dt);
    checkCoinPickups();

    // Autofire
    if(autofire && (timestamp - player.lastShot) > player.shootCooldown){
      player.lastShot = timestamp;
      const bulletX = player.x + Math.cos(player.angle) * (player.radius + 8);
      const bulletY = player.y + Math.sin(player.angle) * (player.radius + 8);
      shootProjectile('player', bulletX, bulletY, player.angle, player.damage, player.bulletSpeed);
    }

    updateCamera();

    // Draw
    drawMap();
    drawCoins();
    drawBots();
    drawPlayer();
    drawProjectiles();

    updateLeaderboard();
    updateCoinsDisplay();
    updateAutofireToggle();
    drawMinimap();

    requestAnimationFrame(gameLoop);
  }

  // --- Leaderboard UI DOM ---
  const leaderboardUL = document.querySelector('#leaderboard ul');
  function updateLeaderboard(){
    // Sort by score descending
    const entries = [{name: player.name || 'You', score: player.score, coins: player.coins}];
    bots.forEach(bot => {
      entries.push({name: bot.name, score: Math.round(bot.health), coins: 0});
    });
    entries.sort((a,b) => b.score - a.score);
    const top = entries.slice(0,5);

    leaderboardUL.innerHTML = '';
    top.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = entry.name;
      const spanScore = document.createElement('span');
      spanScore.textContent = `Score: ${entry.score} | Coins: ${entry.coins}`;
      li.appendChild(spanScore);
      leaderboardUL.appendChild(li);
    });
  }

  // --- Handle upgrades buy buttons ---
  const buyButtons = document.querySelectorAll('#upgradesPanel .buyBtn');
  buyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.parentElement.dataset.upgrade;
      buyUpgrade(type);
    });
  });

  // --- Player name prompt ---
  function askPlayerName(){
    let name = prompt("Enter your BattleBot name:", "GlizzyBot");
    if(!name || name.trim().length < 2) name = "GlizzyBot";
    player.name = name.trim().slice(0,15);
  }

  // Initialize
  askPlayerName();
  updateUpgradesUI();

  // Start game loop
  requestAnimationFrame(gameLoop);
})();
