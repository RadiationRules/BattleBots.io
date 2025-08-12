const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

app.use(express.static('public'));

// Constants
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 15;
const PROJECTILE_SIZE = 6;
const PROJECTILE_SPEED = 14;
const PLAYER_SPEED = 4.5;
const BOT_SPEED = 2.0;
const SHOOT_COOLDOWN = 300;

const MAX_UPGRADE_LEVEL = 10;

// Game state containers
const players = {};
const bots = {};
const projectiles = {};
const coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

const BOT_NAMES = [
  'Sliker', 'Tung Sahur', 'YourMom', 'TurboBot', 'Xenon', 'Nexus',
  'Crusher', 'Viper', 'Omega', 'Blaze', 'Titan', 'Neon', 'Rex', 'Zeta',
];

// Utility functions
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

function createBot(team = null) {
  const pos = randomPosition(BOT_SIZE);
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
    color1: team === 'red' ? '#e74c3c' : team === 'blue' ? '#3498db' : '#f39c12',
    color2: team === 'red' ? '#c0392b' : team === 'blue' ? '#2980b9' : '#d35400',
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    team,
    lastShot: 0,
    shootCooldown: 1800 + Math.random() * 1500, // Bots shoot between 1.8s to 3.3s cooldown
  };
}

function createCoin(x, y, value = 10) {
  return {
    id: 'coin' + coinIdCounter++,
    x,
    y,
    size: COIN_SIZE,
    value,
  };
}

// Initialize bots for Teams mode
function initBotsForTeams() {
  const half = BOT_NAMES.length / 2;
  for (let i = 0; i < BOT_NAMES.length; i++) {
    const team = i < half ? 'red' : 'blue';
    bots['bot' + i] = createBot(team);
  }
}

// Initialize bots for Free mode
function initBotsFree() {
  for (let i = 0; i < 12; i++) {
    bots['bot' + i] = createBot();
  }
}

// Upgrade cost formula
function upgradeCost(level) {
  return 5 + level * 5;
}

// Broadcast leaderboard
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, score: p.score, coins: p.coins, team: p.team }));
  io.emit('leaderboard', topPlayers);
}

// Broadcast team scores
function broadcastTeamScores() {
  let redScore = 0;
  let blueScore = 0;
  for (const p of Object.values(players)) {
    if (p.team === 'red') redScore += p.score;
    else if (p.team === 'blue') blueScore += p.score;
  }
  io.emit('teamScores', { red: redScore, blue: blueScore });
}

// Game main logic
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoin', ({ name, mode }) => {
    // Assign team if teams mode
    let team = null;
    if (mode === 'teams') {
      const redCount = Object.values(players).filter(p => p.team === 'red').length;
      const blueCount = Object.values(players).filter(p => p.team === 'blue').length;
      team = redCount <= blueCount ? 'red' : 'blue';
    }

    const pos = randomPosition(PLAYER_SIZE);
    players[socket.id] = {
      id: socket.id,
      name: name || 'Player',
      x: pos.x,
      y: pos.y,
      size: PLAYER_SIZE,
      health: 100,
      maxHealth: 100,
      score: 0,
      coins: 0,
      angle: 0,
      color1: team === 'red' ? '#e74c3c' : team === 'blue' ? '#3498db' : '#3498db',
      color2: team === 'red' ? '#c0392b' : team === 'blue' ? '#2980b9' : '#2980b9',
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
      team,
      upgrades: {
        damage: 1,
        reload: 1,
        health: 1,
        regen: 1,
        coinBonus: 0,
      },
      mode,
    };

    // Initialize bots depending on mode
    if (Object.keys(bots).length === 0) {
      if (mode === 'teams') initBotsForTeams();
      else initBotsFree();
    }

    socket.emit('init', { players, bots, projectiles, coins });

    socket.broadcast.emit('newPlayer', players[socket.id]);

    broadcastLeaderboard();
    broadcastTeamScores();
  });

  socket.on('playerMovement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    // Clamp position inside map boundaries
    player.x = Math.max(player.size, Math.min(data.x, MAP_WIDTH - player.size));
    player.y = Math.max(player.size, Math.min(data.y, MAP_HEIGHT - player.size));
    player.angle = data.angle;

    io.emit('updatePlayers', players);
  });

  socket.on('shoot', () => {
    const player = players[socket.id];
    if (!player) return;

    const now = Date.now();
    const cooldown = SHOOT_COOLDOWN / player.upgrades.reload;
    if (now - player.lastShot < cooldown) return; // enforce cooldown

    player.lastShot = now;

    const bulletOffset = player.size + 8;
    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: PROJECTILE_SPEED + player.upgrades.reload * 2,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage * player.upgrades.damage,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  socket.on('chatMessage', (msg) => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof msg !== 'string' || msg.trim().length === 0) return;
    const message = {
      id: socket.id,
      name: player.name,
      message: msg.trim(),
      team: player.team,
    };
    io.emit('chatMessage', message);
  });

  socket.on('upgrade', (upgrade) => {
    const player = players[socket.id];
    if (!player) return;
    const lvl = player.upgrades[upgrade];
    if (lvl >= MAX_UPGRADE_LEVEL) return;

    const cost = upgradeCost(lvl);
    if (player.coins < cost) return;

    player.coins -= cost;
    player.upgrades[upgrade] = lvl + 1;

    // Upgrade effects
    switch (upgrade) {
      case 'damage':
        player.damage += 4;
        break;
      case 'reload':
        // reload speed affects cooldown handled in shoot event
        break;
      case 'health':
        player.maxHealth += 15;
        player.health = player.maxHealth;
        break;
      case 'regen':
        // regen affects passive regen in game loop
        break;
      case 'coinBonus':
        // coin bonus is stored for coin pickup multiplier
        break;
    }

    socket.emit('upgradeSuccess', player.upgrades);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
    broadcastLeaderboard();
    broadcastTeamScores();
  });
});

// Game loop: 20 FPS
setInterval(() => {
  // Bots AI move
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.03, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.25;

    // Bots shooting nerfed by 50%
    const now = Date.now();
    if (now - bot.lastShot > bot.shootCooldown) {
      bot.lastShot = now;

      const bulletOffset = bot.size + 8;
      const projectile = {
        id: 'p' + projectileIdCounter++,
        x: bot.x + Math.cos(bot.angle) * bulletOffset,
        y: bot.y + Math.sin(bot.angle) * bulletOffset,
        angle: bot.angle,
        speed: PROJECTILE_SPEED * 0.6,
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: 10,
      };
      projectiles[projectile.id] = projectile;
      io.emit('newProjectile', projectile);
    }
  }

  // Move projectiles, check collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove projectile if outside map
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check collision with players
    for (const pid in players) {
      const player = players[pid];
      if (p.owner === pid) continue; // skip self-hit

      const dist = Math.hypot(player.x - p.x, player.y - p.y);
      if (dist < player.size + p.size) {
        player.health -= p.damage;

        // Owner gains score if player hit
        if (players[p.owner]) players[p.owner].score += 2;

        // Death handling
        if (player.health <= 0) {
          // Spawn coin chest on death
          const coinVal = 25 + (players[player.id].upgrades.coinBonus * 5 || 0);
          const coin = createCoin(player.x, player.y, coinVal);
          coins[coin.id] = coin;

          io.emit('spawnCoin', coin);

          // Respawn player at random position
          const pos = randomPosition(PLAYER_SIZE);
          player.x = pos.x;
          player.y = pos.y;
          player.health = player.maxHealth;
          player.score = Math.max(0, player.score - 5);
          player.coins = Math.max(0, player.coins - 10);
        }

        delete projectiles[id];
        io.emit('removeProjectile', id);
        io.emit('updatePlayers', players);
        break;
      }
    }

    // Check collision with bots
    for (const bid in bots) {
      const bot = bots[bid];
      const dist = Math.hypot(bot.x - p.x, bot.y - p.y);

      if (dist < bot.size + p.size) {
        bot.health -= p.damage;

        if (players[p.owner]) players[p.owner].score += 1;

        if (bot.health <= 0) {
          const coin = createCoin(bot.x, bot.y, 10);
          coins[coin.id] = coin;
          io.emit('spawnCoin', coin);

          bots[bid] = createBot(bot.team);

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

  // Coin pickups
  for (const pid in players) {
    const player = players[pid];
    for (const cid in coins) {
      const coin = coins[cid];
      const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
      if (dist < player.size + coin.size) {
        const bonus = player.upgrades.coinBonus * 5 || 0;
        player.coins += coin.value + bonus;
        player.score += (coin.value + bonus) * 5;

        io.emit('removeCoin', coin.id);
        delete coins[cid];

        io.emit('updatePlayers', players);
      }
    }
  }

  // Passive health regen per tick
  for (const pid in players) {
    const player = players[pid];
    const regenAmount = 0.03 * (player.upgrades.regen || 1);
    if (player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + regenAmount);
    }
  }

  // Broadcast updates
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);
  io.emit('updatePlayers', players);

  broadcastLeaderboard();
  broadcastTeamScores();
}, 50);

http.listen(PORT, () => {
  console.log(`BattleBots server running on port ${PORT}`);
});
