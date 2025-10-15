let players = {};
let bullets = [];
let bots = [];
let leaderboard = [];
let powerups = [];
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
app.use(express.static(path.join(__dirname, '../frontend')));
// ...existing code...
function createBot(id) {
    return {id,name:'Bot_'+id,type:['tank','rammer','sniper'][Math.floor(Math.random()*3)],x:Math.random()*1600-800,y:Math.random()*1600-800,angle:Math.random()*Math.PI*2,health:100,score:0,isBot:true,cooldown:0};
}

    setInterval(() => {
        // Powerup spawn
        if (powerups.length < 5 && Math.random() < 0.02) {
            const types = ['coin','health','shield','speed'];
            powerups.push({
                id: Math.random(),
                type: types[Math.floor(Math.random()*types.length)],
                x: Math.random()*1600-800,
                y: Math.random()*1600-800,
            });
        }

        bots.forEach(bot => {
            // Pick a random target: player or another bot (not self)
            let allTargets = Object.values(players).concat(bots.filter(b=>b.id!==bot.id));
            let target = allTargets[Math.floor(Math.random()*allTargets.length)];
            if (!target) return;
            let dx = target.x-bot.x, dy = target.y-bot.y;
            let dist = Math.sqrt(dx*dx+dy*dy);
            if (bot.health < 30) {
                bot.x += (bot.x-target.x)/dist*4;
                bot.y += (bot.y-target.y)/dist*4;
            } else {
                bot.x += dx/dist*2;
                bot.y += dy/dist*2;
                bot.angle = Math.atan2(dy,dx);
                if (bot.cooldown <= 0) {
                    bullets.push({
                        id: Math.random(),
                        owner: bot.id,
                        x: bot.x,
                        y: bot.y,
                        angle: bot.angle,
                        type: bot.type,
                        pierce: bot.type==='sniper'?2:0,
                        life: 60,
                    });
                    bot.cooldown = 40;
                }
            }
            if (bot.cooldown > 0) bot.cooldown--;
        });

        // Powerup collection
        Object.values(players).forEach(p => {
            powerups.forEach((pw, idx) => {
                const dx = pw.x-p.x, dy = pw.y-p.y;
                if (dx*dx+dy*dy < 900) {
                    if (!p.coins) p.coins = 0;
                    if (!p.upgrades) p.upgrades = {speed:0,damage:0,health:0};
                    if (pw.type==='coin') p.coins += 5;
                    if (pw.type==='health') p.health = Math.min(100, p.health+30);
                    if (pw.type==='shield') p.shield = true;
                    if (pw.type==='speed') p.upgrades.speed += 1;
                    powerups.splice(idx,1);
                }
            });
        });

        // Coin earning for kills
        bullets.forEach(bullet => {
            for (const pid in players) {
                const p = players[pid];
                if (bullet.owner !== pid) {
                    const dx = bullet.x-p.x, dy = bullet.y-p.y;
                    if (dx*dx+dy*dy < 900) {
                        let dmg = bullet.type==='sniper'?40:bullet.type==='rammer'?20:30;
                        if (p.shield) dmg = Math.max(0,dmg-30);
                        p.health -= dmg;
                        if (bullet.pierce) bullet.pierce--; else bullet.life=0;
                        if (p.health<=0) {
                            p.health=100; p.x=Math.random()*1600-800; p.y=Math.random()*1600-800;
                            players[bullet.owner] && (players[bullet.owner].score+=100);
                            players[bullet.owner] && (players[bullet.owner].coins = (players[bullet.owner].coins||0)+10);
                        }
                    }
                }
            }
            bots.forEach(bot => {
                if (bullet.owner !== bot.id) {
                    const dx = bullet.x-bot.x, dy = bullet.y-bot.y;
                    if (dx*dx+dy*dy < 900) {
                        let dmg = bullet.type==='sniper'?40:bullet.type==='rammer'?20:30;
                        bot.health -= dmg;
                        if (bullet.pierce) bullet.pierce--; else bullet.life=0;
                        if (bot.health<=0) {
                            bot.health=100; bot.x=Math.random()*1600-800; bot.y=Math.random()*1600-800;
                            players[bullet.owner] && (players[bullet.owner].score+=50);
                            players[bullet.owner] && (players[bullet.owner].coins = (players[bullet.owner].coins||0)+5);
                        }
                    }
                }
            });
        });

        leaderboard=Object.values(players).sort((a,b)=>b.score-a.score).slice(0,10).map(p=>({name:p.name,score:p.score,coins:p.coins||0}));
        io.emit('gameState',{players:Object.values(players),bullets,bots,leaderboard,powerups});
    },1000/30);

    setInterval(() => {
        // Powerup spawn
        if (powerups.length < 5 && Math.random() < 0.02) {
            const types = ['coin','health','shield','speed'];
            powerups.push({
                id: Math.random(),
                type: types[Math.floor(Math.random()*types.length)],
                x: Math.random()*1600-800,
                y: Math.random()*1600-800,
            });
        }

        bots.forEach(bot => {
            // ...existing bot AI code...
            let allTargets = Object.values(players).concat(bots.filter(b=>b.id!==bot.id));
            let target = allTargets[Math.floor(Math.random()*allTargets.length)];
            if (!target) return;
            let dx = target.x-bot.x, dy = target.y-bot.y;
            let dist = Math.sqrt(dx*dx+dy*dy);
            if (bot.health < 30) {
                bot.x += (bot.x-target.x)/dist*4;
                bot.y += (bot.y-target.y)/dist*4;
            } else {
                bot.x += dx/dist*2;
                bot.y += dy/dist*2;
                bot.angle = Math.atan2(dy,dx);
                if (bot.cooldown <= 0) {
                    bullets.push({
                        id: Math.random(),
                        owner: bot.id,
                        x: bot.x,
                        y: bot.y,
                        angle: bot.angle,
                        type: bot.type,
                        pierce: bot.type==='sniper'?2:0,
                        life: 60,
                    });
                    bot.cooldown = 40;
                }
            }
            if (bot.cooldown > 0) bot.cooldown--;
        });

        // Powerup collection
        Object.values(players).forEach(p => {
            powerups.forEach((pw, idx) => {
                const dx = pw.x-p.x, dy = pw.y-p.y;
                if (dx*dx+dy*dy < 900) {
                    if (!p.coins) p.coins = 0;
                    if (!p.upgrades) p.upgrades = {speed:0,damage:0,health:0};
                    if (pw.type==='coin') p.coins += 5;
                    if (pw.type==='health') p.health = Math.min(100, p.health+30);
                    if (pw.type==='shield') p.shield = true;
                    if (pw.type==='speed') p.upgrades.speed += 1;
                    powerups.splice(idx,1);
                }
            });
        });

        // Coin earning for kills
        bullets.forEach(bullet => {
            for (const pid in players) {
                const p = players[pid];
                if (bullet.owner !== pid) {
                    const dx = bullet.x-p.x, dy = bullet.y-p.y;
                    if (dx*dx+dy*dy < 900) {
                        let dmg = bullet.type==='sniper'?40:bullet.type==='rammer'?20:30;
                        if (p.shield) dmg = Math.max(0,dmg-30);
                        p.health -= dmg;
                        if (bullet.pierce) bullet.pierce--; else bullet.life=0;
                        if (p.health<=0) {
                            p.health=100; p.x=Math.random()*1600-800; p.y=Math.random()*1600-800;
                            players[bullet.owner] && (players[bullet.owner].score+=100);
                            players[bullet.owner] && (players[bullet.owner].coins = (players[bullet.owner].coins||0)+10);
                        }
                    }
                }
            }
            bots.forEach(bot => {
                if (bullet.owner !== bot.id) {
                    const dx = bullet.x-bot.x, dy = bullet.y-bot.y;
                    if (dx*dx+dy*dy < 900) {
                        let dmg = bullet.type==='sniper'?40:bullet.type==='rammer'?20:30;
                        bot.health -= dmg;
                        if (bullet.pierce) bullet.pierce--; else bullet.life=0;
                        if (bot.health<=0) {
                            bot.health=100; bot.x=Math.random()*1600-800; bot.y=Math.random()*1600-800;
                            players[bullet.owner] && (players[bullet.owner].score+=50);
                            players[bullet.owner] && (players[bullet.owner].coins = (players[bullet.owner].coins||0)+5);
                        }
                    }
                }
            });
        });

        leaderboard=Object.values(players).sort((a,b)=>b.score-a.score).slice(0,10).map(p=>({name:p.name,score:p.score,coins:p.coins||0}));
        io.emit('gameState',{players:Object.values(players),bullets,bots,leaderboard,powerups});
    },1000/30);
io.on('connection',socket=>{
    let player={id:socket.id,name:'Player'+(Math.floor(Math.random()*1000)),type:'tank',x:Math.random()*1600-800,y:Math.random()*1600-800,angle:0,health:100,score:0,shield:false,cooldown:0};
    players[socket.id]=player;
    socket.on('setType',type=>{player.type=type;});
    socket.on('move',dir=>{const speed=player.type==='rammer'?7:player.type==='tank'?4:3;if(dir==='up')player.y-=speed;if(dir==='down')player.y+=speed;if(dir==='left')player.x-=speed;if(dir==='right')player.x+=speed;});
    socket.on('aim',angle=>{player.angle=angle;});
    socket.on('shoot',()=>{if(player.cooldown<=0){bullets.push({id:Math.random(),owner:player.id,x:player.x,y:player.y,angle:player.angle,type:player.type,pierce:player.type==='sniper'?2:0,life:60});player.cooldown=player.type==='tank'?30:player.type==='rammer'?15:40;}});
    socket.on('ability',()=>{if(player.type==='tank'&&!player.shield){player.shield=true;setTimeout(()=>player.shield=false,2000);}if(player.type==='rammer'){player.x+=Math.cos(player.angle)*40;player.y+=Math.sin(player.angle)*40;}});
    socket.on('disconnect',()=>{delete players[socket.id];});
});
server.listen(PORT,()=>console.log(`BattleBots.io server running on port ${PORT}`));
