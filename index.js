const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static('public'));

// Game constants
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;
const PLAYER_SIZE = 30;
const BOT_SIZE = 30;
const COIN_SIZE = 12;
const PROJECTILE_SIZE = 6;
const SHOOT_COOLDOWN = 300; // ms
const PLAYER_SPEED = 4;
const BOT_SPEED = 2;
const BOT_SHOOT_COOLDOWN = 1500;

// Game state
const players = {};
const bots = {};
const projectiles = {};
const coins = {};

let botIdCounter = 1;
let projectileIdCounter = 1;
let coinIdCounter = 1;

// Utility random position inside map with padding
function randomPosition(size) {
  return {
    x: Math.random() * (MAP_WIDTH - size * 2) + size,
    y: Math.random() * (MAP_HEIGHT - size * 2) + size,
  };
}

// Bot names pool
const botNames = [
  "Sliker",
  "Tung Sahur",
  "YourMom",
  "BigBot",
  "Crusher",
  "Zapper",
  "Mechano",
  "Steeljaw",
  "Ironclad",
  "Blaze",
];

// Create bot
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
    color2: team === 'red' ? '#c0392b' : team === 'blue' ? '#2980b9' : '#e67e22',
    team,
    name: botNames[Math.floor(Math.random() * botNames.length)],
    lastShot: 0,
    shootCooldown: BOT_SHOOT_COOLDOWN,
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

// Spawn initial bots (3 red, 3 blue)
for (let i = 0; i < 3; i++) {
  bots['botR' + i] = createBot('red');
  bots['botB' + i] = createBot('blue');
}

// Broadcast leaderboard
function broadcastLeaderboard() {
  const topPlayers = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      coins: p.coins || 0,
      team: p.team,
    }));
  io.emit('leaderboard', topPlayers);
}

// Broadcast team scores
function broadcastTeamScores() {
  const redScore = Object.values(players)
    .filter(p => p.team === 'red')
    .reduce((a,b) => a + b.score, 0);
  const blueScore = Object.values(players)
    .filter(p => p.team === 'blue')
    .reduce((a,b) => a + b.score, 0);
  io.emit('teamScores', { red: redScore, blue: blueScore });
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  socket.on('playerJoin', ({ name, mode }) => {
    if (!name) name = "Player";
    if (mode !== 'teams') mode = 'free';

    const pos = randomPosition(PLAYER_SIZE);

    let team = null;
    if (mode === 'teams') {
      // Assign team balancing
      const redCount = Object.values(players).filter(p => p.team === 'red').length;
      const blueCount = Object.values(players).filter(p => p.team === 'blue').length;
      team = redCount <= blueCount ? 'red' : 'blue';
    }

    players[socket.id] = {
      id: socket.id,
      name,
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
      team,
      lastShot: 0,
      speed: PLAYER_SPEED,
      damage: 20,
      mode,
      upgrades: {
        damage: 1,
        bulletSpeed: 1,
        health: 1,
        regen: 1,
        reload: 1,
      }
    };

    // Send initial game state
    socket.emit('init', { players, bots, coins, projectiles: {} });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Send team scores and leaderboard to new player
    socket.emit('teamScores', {
      red: Object.values(players).filter(p => p.team === 'red').reduce((a,b) => a+b.score, 0),
      blue: Object.values(players).filter(p => p.team === 'blue').reduce((a,b) => a+b.score, 0),
    });
    broadcastLeaderboard();
  });

  socket.on('playerMovement', data => {
    const player = players[socket.id];
    if (!player) return;
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

    if (now - player.lastShot < cooldown) return;

    player.lastShot = now;

    const bulletOffset = player.size + 8;

    const projectile = {
      id: 'p' + projectileIdCounter++,
      x: player.x + Math.cos(player.angle) * bulletOffset,
      y: player.y + Math.sin(player.angle) * bulletOffset,
      angle: player.angle,
      speed: PROJECTILE_SPEED * player.upgrades.bulletSpeed,
      owner: socket.id,
      size: PROJECTILE_SIZE,
      damage: player.damage * player.upgrades.damage,
    };

    projectiles[projectile.id] = projectile;
    io.emit('newProjectile', projectile);
  });

  socket.on('chatMessage', msg => {
    const player = players[socket.id];
    if (!player) return;
    if (typeof msg !== 'string' || msg.trim().length === 0) return;
    if (msg.length > 100) return;

    io.emit('chatMessage', { id: socket.id, name: player.name, message: msg.trim(), team: player.team });
  });

  socket.on('upgrade', upgradeType => {
    const player = players[socket.id];
    if (!player) return;

    const cost = player.upgrades[upgradeType] * 5; // example cost scaling
    if (player.coins >= cost && player.upgrades[upgradeType] < 10) {
      player.coins -= cost;
      player.upgrades[upgradeType]++;
      if (upgradeType === 'health') {
        player.maxHealth = 100 + player.upgrades.health * 10;
        player.health = Math.min(player.health + 10, player.maxHealth);
      }
      io.emit('updatePlayers', players);
      socket.emit('upgradeSuccess', player.upgrades);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
    broadcastLeaderboard();
    broadcastTeamScores();
  });
});

// Game loop
setInterval(() => {
  // Move bots
  for (const id in bots) {
    const bot = bots[id];
    bot.x += Math.cos(bot.angle) * bot.speed;
    bot.y += Math.sin(bot.angle) * bot.speed;

    // Bounce off walls
    if (bot.x < bot.size || bot.x > MAP_WIDTH - bot.size) bot.angle = Math.PI - bot.angle;
    if (bot.y < bot.size || bot.y > MAP_HEIGHT - bot.size) bot.angle = -bot.angle;

    bot.sawAngle += 0.15;
    bot.health = Math.min(bot.health + 0.02 * bot.speed, bot.maxHealth);
    bot.angle += (Math.random() - 0.5) * 0.2;

    // Bots shoot but nerfed 50%
    const now = Date.now();
    if (now - bot.lastShot > bot.shootCooldown) {
      bot.lastShot = now;

      const bulletOffset = bot.size + 8;
      const projectile = {
        id: 'p' + projectileIdCounter++,
        x: bot.x + Math.cos(bot.angle) * bulletOffset,
        y: bot.y + Math.sin(bot.angle) * bulletOffset,
        angle: bot.angle,
        speed: PROJECTILE_SPEED * 0.5,
        owner: bot.id,
        size: PROJECTILE_SIZE,
        damage: 10,
      };
      projectiles[projectile.id] = projectile;
      io.emit('newProjectile', projectile);
    }
  }

  // Move projectiles & check collisions
  for (const id in projectiles) {
    const p = projectiles[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    // Remove projectiles outside map
    if (p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT) {
      delete projectiles[id];
      io.emit('removeProjectile', id);
      continue;
    }

    // Check collisions with players & bots
    // Players can't hit themselves
    if (players[p.owner]) {
      // Check bots
      for (const botId in bots) {
        const bot = bots[botId];
        if (bot.team === players[p.owner].team) continue; // no friendly fire

        const dist = Math.hypot(bot.x - p.x, bot.y - p.y);
        if (dist < bot.size + p.size) {
          bot.health -= p.damage;
          if (players[p.owner]) players[p.owner].score += 1;

          if (bot.health <= 0) {
            const coin = createCoin(bot.x, bot.y, 10);
            coins[coin.id] = coin;
            io.emit('spawnCoin', coin);

            bots[botId] = createBot(bot.team);

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

      // Check other players (enemy team)
      for (const playerId in players) {
        if (playerId === p.owner) continue;
        const target = players[playerId];
        if (target.team === players[p.owner].team) continue;

        const dist = Math.hypot(target.x - p.x, target.y - p.y);
        if (dist < target.size + p.size) {
          target.health -= p.damage;
          if (players[p.owner]) players[p.owner].score += 1;

          if (target.health <= 0) {
            // Respawn player
            const pos = randomPosition(PLAYER_SIZE);
            target.x = pos.x;
            target.y = pos.y;
            target.health = target.maxHealth;
            target.score = 0;
            target.coins = 0;
          }
          delete projectiles[id];
          io.emit('removeProjectile', id);
          io.emit('updatePlayers', players);
          break;
        }
      }
    }
  }

  // Check coin pickups
  for (const playerId in players) {
    const player = players[playerId];
    for (const coinId in coins) {
      const coin = coins[coinId];
      const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
      if (dist < player.size + coin.size) {
        player.coins += coin.value;
        player.score += coin.value * 5;

        io.emit('removeCoin', coin.id);
        delete coins[coinId];

        io.emit('updatePlayers', players);
      }
    }
  }

  // Broadcast updated states
  io.emit('updateBots', bots);
  io.emit('updateProjectiles', projectiles);
  io.emit('updateCoins', coins);

  broadcastLeaderboard();
  broadcastTeamScores();

}, 50);

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
