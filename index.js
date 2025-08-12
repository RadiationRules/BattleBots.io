const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve client files from public folder
app.use(express.static('public'));

const MAP_WIDTH = 2200;
const MAP_HEIGHT = 1600;

const PLAYER_RADIUS = 32;
const BOT_RADIUS = 32;
const COIN_RADIUS = 14;
const PROJECTILE_SIZE = 8;

const SHOOT_COOLDOWN_BASE = 300;

const BOT_NAMES = [
  "Sliker", "Tung Sahur", "YourMom", "ZeroCool", "Botinator",
  "Alpha", "Glitch", "Nano", "Cypher", "MechX", "Shadow", "Vortex"
];

let players = {};
let bots = {};
let projectiles = {};
let coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

// Utility
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function createBot() {
  return {
    id: 'bot' + botIdCounter++,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    x: randomRange(BOT_RADIUS, MAP_WIDTH - BOT_RADIUS),
    y: randomRange(BOT_RADIUS, MAP_HEIGHT - BOT_RADIUS),
    radius: BOT_RADIUS,
    health: 100,
    maxHealth: 100,
    speed: 2,
    angle: Math.random() * Math.PI * 2,
    lastShot: 0,
    shootCooldown: 1200,
    damage: 10, // Nerfed
    bulletSpeed: 9,
    sawAngle: 0,
  };
}

function createCoin(x, y, value = 1) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    radius: COIN_RADIUS,
    value,
    isChest: value > 1,
  };
}

for(let i=0; i<10; i++) {
  const bot = createBot();
  bots[bot.id] = bot;
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoined', (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name.slice(0, 15),
      x: randomRange(PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS),
      y: randomRange(PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS),
      radius: PLAYER_RADIUS,
      health: 100,
      maxHealth: 100,
      speed: 4,
      damage: 20,
      bulletSpeed: 12,
      shootCooldown: SHOOT_COOLDOWN_BASE,
      lastShot: 0,
      regen: 0.01,
      score: 0,
      coins: 0,
      upgrades: {
        damage: 0,
        bulletSpeed: 0,
        health: 0,
        regen: 0,
        reloadSpeed: 0,
      },
      angle: 0,
      autofire: false,
    };
    socket.emit('init', {players, bots, coins, projectiles});
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  socket.on('playerMovement', data => {
    let p = players[socket.id];
    if(!p) return;
    p.x = Math.max(p.radius, Math.min(data.x, MAP_WIDTH - p.radius));
    p.y = Math.max(p.radius, Math.min(data.y, MAP_HEIGHT - p.radius));
    p.angle = data.angle;
    io.emit('updatePlayers', players);
  });

  socket.on('shoot', () => {
    const p = players[socket.id];
    if(!p) return;

    let now = Date.now();
    if(now - p.lastShot < p.shootCooldown) return;
    p.lastShot = now;

    let bulletOffset = p.radius + 8;
    const projId = 'p' + projectileIdCounter++;

    projectiles[projId] = {
      id: projId,
      x: p.x + Math.cos(p.angle) * bulletOffset,
      y: p.y + Math.sin(p.angle) * bulletOffset,
      angle: p.angle,
      speed: p.bulletSpeed,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: p.damage,
    };

    io.emit('newProjectile', projectiles[projId]);
  });

  socket.on('toggleAutofire', () => {
    if(players[socket.id]) {
      players[socket.id].autofire = !players[socket.id].autofire;
      io.to(socket.id).emit('autofireStatus', players[socket.id].autofire);
    }
  });

  socket.on('buyUpgrade', (upgradeType) => {
    const p = players[socket.id];
    if(!p) return;
    const costMap = {
      damage: 5,
      bulletSpeed: 5,
      health: 10,
      regen: 10,
      reloadSpeed: 10,
    };
    if(!costMap[upgradeType]) return;
    const cost = costMap[upgradeType];
    if(p.coins < cost) return;

    p.coins -= cost;
    p.upgrades[upgradeType]++;
    switch(upgradeType) {
      case 'damage': p.damage += 3; break;
      case 'bulletSpeed': p.bulletSpeed += 1.5; break;
      case 'health': 
        p.maxHealth += 20; 
        p.health = p.maxHealth;
        break;
      case 'regen': p.regen += 0.005; break;
      case 'reloadSpeed': p.shootCooldown = Math.max(50, p.shootCooldown - 40); break;
    }
    io.to(socket.id).emit('upgradeSuccess', p.upgrades);
    io.emit('updatePlayers', players);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game loop every 50ms
setInterval(() => {
  // Move bots & shooting
  for(const botId in bots) {
    const bot = bots[botId];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    if(bot.x < bot.radius || bot.x > MAP_WIDTH - bot.radius) bot.angle = Math.PI - bot.angle;
    if(bot.y < bot.radius || bot.y > MAP_HEIGHT - bot.radius) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.15;

    // Bot shooting (50% nerf)
    if(Date.now() - bot.lastShot > bot.shootCooldown) {
      bot.lastShot = Date.now();
      const projId = 'p' + projectileIdCounter++;
      projectiles[projId] = {
        id: projId,
        x: bot.x + Math.cos(bot.angle) * (bot.radius + 8),
        y: bot.y + Math.sin(bot.angle) * (bot.radius + 8),
        angle: bot.angle,
        speed: bot.bulletSpeed,
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: bot.damage,
      };
      io.emit('newProjectile', projectiles[projId]);
    }
  }

  // Move projectiles & collisions
  for(const projId in projectiles) {
    const p = projectiles[projId];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    if(p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[projId];
      io.emit('removeProjectile', projId);
      continue;
    }

    // Check hits on bots (exclude own projectiles)
    for(const botId in bots) {
      const bot = bots[botId];
      if(p.owner === bot.id) continue;
      if(Math.hypot(bot.x - p.x, bot.y - p.y) < bot.radius + p.size) {
        bot.health -= p.damage;

        // Award player score for damage
        if(players[p.owner]) players[p.owner].score += 1;

        if(bot.health <= 0) {
          const coin = createCoin(bot.x, bot.y, Math.random() < 0.3 ? 25 : 10);
          coins[coin.id] = coin;

          bots[botId] = createBot();

          if(players[p.owner]) {
            players[p.owner].score += 10;
            players[p.owner].coins += coin.value;
          }
        }

        delete projectiles[projId];
        io.emit('removeProjectile', projId);
        io.emit('updateBots', bots);
        io.emit('updatePlayers', players);
        break;
      }
    }

    // Check hits on players (exclude own projectiles)
    for(const playerId in players) {
      const pl = players[playerId];
      if(p.owner === playerId) continue;
      if(Math.hypot(pl.x - p.x, pl.y - p.y) < pl.radius + p.size) {
        pl.health -= p.damage;
        if(players[p.owner]) players[p.owner].score += 1;

        if(pl.health <= 0) {
          // Respawn player randomly
          pl.x = randomRange(PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
          pl.y = randomRange(PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);
          pl.health = pl.maxHealth;
          pl.score = Math.max(0, pl.score - 10);
          pl.coins = Math.max(0, pl.coins - 10);
          io.to(pl.id).emit('playerDied');
        }
        delete projectiles[projId];
        io.emit('removeProjectile', projId);
        io.emit('updatePlayers', players);
        break;
      }
    }
  }

  // Coin pickup detection
  for(const playerId in players) {
    const pl = players[playerId];
    for(const coinId in coins) {
      const c = coins[coinId];
      if(Math.hypot(pl.x - c.x, pl.y - c.y) < pl.radius + c.radius) {
        pl.coins += c.value;
        pl.score += c.value * 5;
        io.emit('removeCoin', c.id);
        delete coins[coinId];
        io.emit('updatePlayers', players);
      }
    }
  }

  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);

  // Leaderboard every second
}, 50);

setInterval(() => {
  const topPlayers = Object.values(players)
    .sort((a,b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ name: p.name, score: p.score, coins: p.coins }));
  io.emit('leaderboard', topPlayers);
}, 1000);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
