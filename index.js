const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve static files from public folder
app.use(express.static('public'));

// Constants
const MAP_WIDTH = 1800;
const MAP_HEIGHT = 1200;
const PLAYER_SIZE = 35;
const BOT_SIZE = 35;
const COIN_SIZE = 15;
const CHEST_SIZE = 25;
const PROJECTILE_SIZE = 8;
const PROJECTILE_SPEED = 15;
const PLAYER_SPEED = 5;
const BOT_SPEED = 2;
const SHOOT_COOLDOWN = 300;

const TEAM_COLORS = {
  red: ['#e74c3c', '#c0392b'],
  blue: ['#3498db', '#2980b9'],
  neutral: ['#7f8c8d', '#95a5a6']
};

const BOT_NAMES = [
  "Sliker", "Tung Sahur", "YourMom", "Zaptron", "Vexx", "Crusher", "Steelix", "Grinder", "Bolt", "Ironclad"
];

let players = {};
let bots = {};
let projectiles = {};
let coins = {};
let chests = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;
let chestIdCounter = 1;

// Util function: random position with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Create Bot
function createBot() {
  const pos = randomPosition(BOT_SIZE);
  const team = Math.random() < 0.5 ? 'red' : 'blue';
  return {
    id: 'bot' + botIdCounter++,
    x: pos.x,
    y: pos.y,
    size: BOT_SIZE,
    health: 100,
    maxHealth: 100,
    speed: BOT_SPEED,
    angle: Math.random() * Math.PI * 2,
    sawAngle: 0,
    color1: TEAM_COLORS[team][0],
    color2: TEAM_COLORS[team][1],
    team: team,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    lastShot: 0
  };
}

// Create Coin
function createCoin(x, y, value=1) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value
  };
}

// Create Chest
function createChest(x, y, value=10) {
  return {
    id: 'chest' + chestIdCounter++,
    x,
    y,
    size: CHEST_SIZE,
    value
  };
}

// Spawn initial bots
for(let i = 0; i < 10; i++) {
  bots['bot' + i] = createBot();
}

// Spawn some chests randomly every 30 seconds
setInterval(() => {
  if(Object.keys(chests).length < 5){
    const pos = randomPosition(CHEST_SIZE);
    const chest = createChest(pos.x, pos.y, 25);
    chests[chest.id] = chest;
    io.emit('spawnChest', chest);
  }
}, 30000);

// Broadcast leaderboard every second
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a,b) => b.score - a.score)
    .slice(0,5)
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      coins: p.coins || 0,
      team: p.team || 'neutral'
    }));
  io.emit('leaderboard', topPlayers);
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  // Player joins with data: {name, team}
  socket.on('playerJoin', (data) => {
    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: data.name.substring(0, 12) || 'Player',
      x: pos.x,
      y: pos.y,
      size: PLAYER_SIZE,
      health: 100,
      maxHealth: 100,
      score: 0,
      coins: 0,
      angle: 0,
      color1: TEAM_COLORS[data.team][0] || TEAM_COLORS.neutral[0],
      color2: TEAM_COLORS[data.team][1] || TEAM_COLORS.neutral[1],
      team: data.team || 'neutral',
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
      reloadSpeed: SHOOT_COOLDOWN,
      healthRegen: 0.05,
      bulletSpeed: PROJECTILE_SPEED,
      upgrades: {
        damage: 1,
        bulletSpeed: 1,
        health: 1,
        healthRegen: 1,
        reloadSpeed: 1
      },
      autoFire: false,
      keysPressed: {}
    };
    socket.emit('init', {players, bots, coins, chests, projectiles});
    socket.broadcast.emit('newPlayer', players[socket.id]);
  });

  // Movement input
  socket.on('keyDown', (key) => {
    const player = players[socket.id];
    if (!player) return;
    player.keysPressed[key] = true;
  });

  socket.on('keyUp', (key) => {
    const player = players[socket.id];
    if (!player) return;
    player.keysPressed[key] = false;
  });

  // Mouse angle update
  socket.on('updateAngle', (angle) => {
    const player = players[socket.id];
    if (!player) return;
    player.angle = angle;
  });

  // Toggle autofire (E key)
  socket.on('toggleAutoFire', () => {
    const player = players[socket.id];
    if (!player) return;
    player.autoFire = !player.autoFire;
  });

  // Shoot event
  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;
    shootProjectile(player);
  });

  // Chest pickup
  socket.on('pickupChest', (chestId) => {
    const player = players[socket.id];
    if (!player || !chests[chestId]) return;
    const chest = chests[chestId];
    const dist = Math.hypot(player.x - chest.x, player.y - chest.y);
    if (dist < player.size + chest.size) {
      player.coins += chest.value;
      player.score += chest.value * 5;
      io.emit('removeChest', chestId);
      delete chests[chestId];
      io.emit('updatePlayers', players);
    }
  });

  // Chat messages
  socket.on('chatMessage', (msg) => {
    const player = players[socket.id];
    if (!player) return;
    const sanitizedMsg = msg.toString().substring(0, 150);
    io.emit('chatMessage', {id: player.id, name: player.name, message: sanitizedMsg});
  });

  // Player disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

// Game loop at 30 FPS
setInterval(() => {
  // Move players based on keys pressed
  Object.values(players).forEach(player => {
    if (!player) return;

    // WASD controls
    if(player.keysPressed['w']) player.y -= player.speed;
    if(player.keysPressed['s']) player.y += player.speed;
    if(player.keysPressed['a']) player.x -= player.speed;
    if(player.keysPressed['d']) player.x += player.speed;

    // Clamp position
    player.x = Math.min(Math.max(player.size, player.x), MAP_WIDTH - player.size);
    player.y = Math.min(Math.max(player.size, player.y), MAP_HEIGHT - player.size);

    // Health regen
    player.health = Math.min(player.maxHealth, player.health + player.healthRegen);

    // Autofire
    if(player.autoFire) {
      shootProjectile(player);
    }
  });

  // Move bots & simple AI shooting
  Object.values(bots).forEach(bot => {
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    if(bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if(bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.maxHealth, bot.health + 0.02);
    bot.angle += (Math.random() - 0.5) * 0.2;

    // Bot shooting every 1.5s (nerfed 50%)
    if(Date.now() - bot.lastShot > 1500) {
      bot.lastShot = Date.now();
      const target = findClosestPlayer(bot);
      if(target) {
        shootProjectile(bot, target, 0.5);
      }
    }
  });

  // Move projectiles and detect collisions
  for(const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove out-of-map projectiles
    if(p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Collision check
    if(p.owner && players[p.owner]) {
      // Check bots collision
      for(const botId in bots) {
        const bot = bots[botId];
        if(bot.team === (players[p.owner].team)) continue; // friendly fire off for teams
        const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
        if(dist < bot.size + p.size) {
          bot.health -= p.damage;
          if(players[p.owner]) players[p.owner].score++;
          if(bot.health <= 0) {
            // Spawn coin at death
            const coin = createCoin(bot.x, bot.y, 5);
            coins[coin.id] = coin;
            io.emit('spawnCoin', coin);
            bots[botId] = createBot();
            if(players[p.owner]){
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

      // Check players collision (no friendly fire)
      for(const playerId in players) {
        const player = players[playerId];
        if(player.id === p.owner) continue; // no self damage
        if(player.team === players[p.owner].team) continue;
        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if(dist < player.size + p.size) {
          player.health -= p.damage;
          if(players[p.owner]) players[p.owner].score++;
          if(player.health <= 0) {
            // Respawn player
            player.x = MAP_WIDTH/2 + (Math.random()*200 - 100);
            player.y = MAP_HEIGHT/2 + (Math.random()*200 - 100);
            player.health = player.maxHealth;
            player.score = Math.max(0, player.score - 10);
          }
          delete projectiles[id];
          io.emit('removeProjectile', id);
          io.emit('updatePlayers', players);
          break;
        }
      }
    }
  }

  // Coin pickup
  for(const playerId in players) {
    const player = players[playerId];
    for(const coinId in coins) {
      const coin = coins[coinId];
      const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
      if(dist < player.size + coin.size) {
        player.coins += coin.value;
        player.score += coin.value * 5;
        io.emit('removeCoin', coin.id);
        delete coins[coinId];
        io.emit('updatePlayers', players);
      }
    }
  }

  // Emit all updates
  io.emit('updatePlayers', players);
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
  io.emit('updateChests', chests);

}, 33);

// Find closest player for bot AI targeting
function findClosestPlayer(bot) {
  let closest = null;
  let minDist = Infinity;
  Object.values(players).forEach(p => {
    if(p.team === bot.team) return; // no friendly fire
    const dist = Math.hypot(p.x - bot.x, p.y - bot.y);
    if(dist < minDist) {
      minDist = dist;
      closest = p;
    }
  });
  return closest;
}

// Shoot projectile helper
function shootProjectile(shooter, target=null, nerf=1) {
  const now = Date.now();
  if(now - shooter.lastShot < shooter.reloadSpeed * shooter.upgrades.reloadSpeed) return;
  shooter.lastShot = now;

  let angle = shooter.angle;
  if(target){
    angle = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  }

  const bulletOffset = shooter.size + 10;
  const projectile = {
    id: 'p' + projectileIdCounter++,
    x: shooter.x + Math.cos(angle) * bulletOffset,
    y: shooter.y + Math.sin(angle) * bulletOffset,
    angle,
    speed: PROJECTILE_SPEED * shooter.upgrades.bulletSpeed * nerf,
    owner: shooter.id,
    size: PROJECTILE_SIZE,
    damage: shooter.damage * shooter.upgrades.damage * nerf
  };

  projectiles[projectile.id] = projectile;
  io.emit('newProjectile', projectile);
}

http.listen(PORT, () => {
  console.log(`BattleBots.io server running on port ${PORT}`);
});
socket.on('buyUpgrade', ({ upgrade, level }) => {
  const player = players[socket.id];
  if (!player) return;

  // Simple validation: level must be one higher than current
  if (!player.upgrades) player.upgrades = {};
  const currentLevel = player.upgrades[upgrade] || 0;
  if (level === currentLevel + 1) {
    player.upgrades[upgrade] = level;
    io.emit('updatePlayers', players);
  }
});
