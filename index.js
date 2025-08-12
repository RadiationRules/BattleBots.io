const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static('public'));

// Game Constants
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1200;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 12;
const CHEST_SIZE = 24;
const PROJECTILE_SIZE = 6;
const SHOOT_COOLDOWN_BASE = 300; // ms base reload cooldown

// Game state
const players = {};
const bots = {};
const projectiles = {};
const coins = {};
const chests = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;
let chestIdCounter = 1;

// Bot names pool
const botNames = [
  'Sliker', 'Tung Sahur', 'YourMom', 'Zaptron', 'Steelix', 'Crusher', 'Bolt', 'Echo', 'Titan', 'Nova'
];

// Utility: random position with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Create bot with random name
function createBot() {
  const pos = randomPosition(BOT_SIZE);
  const name = botNames[Math.floor(Math.random() * botNames.length)];
  return {
    id: 'bot' + botIdCounter++,
    name,
    x: pos.x,
    y: pos.y,
    size: BOT_SIZE,
    health: 100,
    maxHealth: 100,
    speed: 2,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: '#f39c12',
    color2: '#e67e22',
    lastShot: 0,
    shootCooldown: 600,  // Bots shoot slower by default (nerfed)
    damage: 10,
  };
}

// Create coin
function createCoin(x, y, value = 1) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value,
  };
}

// Create chest (coins bundle)
function createChest(x, y, value = 25) {
  return {
    id: 'chest' + chestIdCounter++,
    x,
    y,
    size: CHEST_SIZE,
    value,
  };
}

// Spawn initial bots
for (let i = 0; i < 8; i++) {
  bots['bot' + i] = createBot();
}

// Spawn some chests randomly
for (let i = 0; i < 5; i++) {
  const pos = randomPosition(CHEST_SIZE);
  chests['chest' + i] = createChest(pos.x, pos.y);
}

// Broadcast leaderboard every second
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map(p => ({ name: p.name || 'Anonymous', score: p.score, coins: p.coins || 0 }));
  io.emit('leaderboard', topPlayers);
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Wait for client to send 'joinGame' with player name and mode
  socket.on('joinGame', ({ name, mode }) => {
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: name?.substring(0, 15) || 'Anonymous',
      mode: mode || 'classic',
      x: pos.x,
      y: pos.y,
      size: PLAYER_SIZE,
      health: 100,
      maxHealth: 100,
      speed: 4,
      score: 0,
      coins: 0,
      angle: 0,
      damage: 20,
      reloadCooldown: SHOOT_COOLDOWN_BASE,
      lastShot: 0,
      bulletSpeed: 12,
      healthRegen: 0.1,
      upgrades: {
        damage: 0,
        reloadSpeed: 0,
        bulletSpeed: 0,
        health: 0,
        healthRegen: 0,
      },
    };

    // Send full initial game state
    socket.emit('init', { players, bots, coins, chests, projectiles });
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  // Player movement update
  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  // Player shoot
  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    if (now - player.lastShot < player.reloadCooldown) return;

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: player.bulletSpeed,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  // Player upgrade purchase
  socket.on('buyUpgrade', (upgradeType) => {
    const player = players[socket.id];
    if (!player) return;

    // Define upgrade costs & limits
    const costs = {
      damage: 10,
      reloadSpeed: 15,
      bulletSpeed: 10,
      health: 20,
      healthRegen: 15,
    };

    const maxLevels = {
      damage: 10,
      reloadSpeed: 10,
      bulletSpeed: 10,
      health: 10,
      healthRegen: 10,
    };

    if (!costs[upgradeType]) return;

    if (player.upgrades[upgradeType] >= maxLevels[upgradeType]) {
      socket.emit('upgradeFailed', 'Max level reached');
      return;
    }

    const cost = costs[upgradeType] * (player.upgrades[upgradeType] + 1);

    if (player.coins < cost) {
      socket.emit('upgradeFailed', 'Not enough coins');
      return;
    }

    player.coins -= cost;
    player.upgrades[upgradeType]++;

    // Apply upgrades to player stats
    switch (upgradeType) {
      case 'damage':
        player.damage = 20 + player.upgrades.damage * 5;
        break;
      case 'reloadSpeed':
        player.reloadCooldown = Math.max(50, SHOOT_COOLDOWN_BASE - player.upgrades.reloadSpeed * 20);
        break;
      case 'bulletSpeed':
        player.bulletSpeed = 12 + player.upgrades.bulletSpeed * 2;
        break;
      case 'health':
        player.maxHealth = 100 + player.upgrades.health * 15;
        player.health = Math.min(player.health, player.maxHealth);
        break;
      case 'healthRegen':
        player.healthRegen = 0.1 + player.upgrades.healthRegen * 0.05;
        break;
    }

    io.emit('updatePlayers', players);
    socket.emit('upgradeSuccess', upgradeType);
  });

  // Player collects coin
  socket.on('collectCoin', (coinId) => {
    const player = players[socket.id];
    if (!player) return;
    if (!coins[coinId]) return;

    player.coins += coins[coinId].value;
    player.score += coins[coinId].value * 5;

    delete coins[coinId];
    io.emit('removeCoin', coinId);
    io.emit('updatePlayers', players);
  });

  // Player collects chest
  socket.on('collectChest', (chestId) => {
    const player = players[socket.id];
    if (!player) return;
    if (!chests[chestId]) return;

    player.coins += chests[chestId].value;
    player.score += chests[chestId].value * 10;

    delete chests[chestId];
    io.emit('removeChest', chestId);
    io.emit('updatePlayers', players);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game loop 50ms tick (20 FPS)
setInterval(() => {
  // Move bots & make them shoot
  const now = Date.now();
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce walls
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle = (bot.sawAngle + 0.15) % (Math.PI * 2);
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.15;

    // Bot shooting logic (nerfed damage & slower)
    if (now - bot.lastShot > bot.shootCooldown) {
      bot.lastShot = now;

      const projectile = {
        id: 'p' + projectileIdCounter++,
        x: bot.x + Math.cos(bot.angle) * (bot.size + 8),
        y: bot.y + Math.sin(bot.angle) * (bot.size + 8),
        angle: bot.angle,
        speed: 8, // slower than player
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: 10, // half player damage
      };
      projectiles[projectile.id] = projectile;
      io.emit('newProjectile', projectile);
    }
  }

  // Move projectiles and collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove if out of bounds
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check hit bots (ignore if shooter is bot)
    if (!p.owner.startsWith('bot')) {
      for (const botId in bots) {
        const bot = bots[botId];
        if (Math.hypot(bot.x - p.x, bot.y - p.y) < bot.size + p.size) {
          bot.health -= p.damage;

          if (players[p.owner]) players[p.owner].score++;

          if (bot.health <= 0) {
            // Spawn coins on bot death
            const coin = createCoin(bot.x, bot.y);
            coins[coin.id] = coin;
            io.emit('spawnCoin', coin);

            bots[botId] = createBot();

            if (players[p.owner]) {
              players[p.owner].score += 10;
              players[p.owner].coins += coin.value;
            }
          }

          delete projectiles[id];
          io.emit('removeProjectile', id);
          io.emit('updateBots', bots);
          io.emit('updatePlayers', players);
          break;
        }
      }
    }

    // Check hit players (ignore own projectiles)
    for (const playerId in players) {
      if (p.owner === playerId) continue;

      const player = players[playerId];
      if (Math.hypot(player.x - p.x, player.y - p.y) < player.size + p.size) {
        player.health -= p.damage;
        if (player.health <= 0) {
          // Respawn player
          const pos = randomPosition(PLAYER_SIZE);
          player.x = pos.x;
          player.y = pos.y;
          player.health = player.maxHealth;
          player.coins = Math.max(0, player.coins - 10);
          player.score = Math.max(0, player.score - 5);
        }

        delete projectiles[id];
        io.emit('removeProjectile', id);
        io.emit('updatePlayers', players);
        break;
      }
    }
  }

  // Health regen per tick
  for (const playerId in players) {
    const player = players[playerId];
    player.health = Math.min(player.health + player.healthRegen, player.maxHealth);
  }

  // Auto collect coins & chests on player overlap (server-side safety)
  for (const playerId in players) {
    const player = players[playerId];

    // Coins
    for (const coinId in coins) {
      const coin = coins[coinId];
      if (Math.hypot(player.x - coin.x, player.y - coin.y) < player.size + coin.size) {
        player.coins += coin.value;
        player.score += coin.value * 5;
        delete coins[coinId];
        io.emit('removeCoin', coinId);
        io.emit('updatePlayers', players);
      }
    }

    // Chests
    for (const chestId in chests) {
      const chest = chests[chestId];
      if (Math.hypot(player.x - chest.x, player.y - chest.y) < player.size + chest.size) {
        player.coins += chest.value;
        player.score += chest.value * 10;
        delete chests[chestId];
        io.emit('removeChest', chestId);
        io.emit('updatePlayers', players);
      }
    }
  }

  // Broadcast updated states
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
  io.emit('updateChests', chests);
  io.emit('updatePlayers', players);

}, 50); // 20 FPS

// Leaderboard broadcast
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// Start server
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
