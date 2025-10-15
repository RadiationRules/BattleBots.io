// --- Particle System ---
function updateParticles() {
    particles = particles.filter(p=>p.life>0);
    particles.forEach(p=>{
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
    });
}

// --- Modern HUD ---
function drawHUD() {
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(24,24,40,0.98)';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(24, 24, 320, 180, 24);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 28px Orbitron, Arial, sans-serif';
    ctx.fillStyle = '#0ff';
    ctx.textAlign = 'left';
    ctx.fillText('PLAYER HUD', 48, 60);
    ctx.font = 'bold 22px Orbitron, Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Health: ${Math.round(health)}`, 48, 100);
    ctx.fillText(`Ammo: ${ammo}`, 48, 130);
    ctx.fillText(`Cooldown: ${(cooldown/30).toFixed(1)}s`, 48, 160);
    ctx.fillText(`Score: ${score}`, 48, 190);
    ctx.fillText(`Coins: ${myPlayer && myPlayer.coins ? myPlayer.coins : 0}`, 48, 220);
    clearGlow();
    ctx.restore();
}

// --- Modern Leaderboard ---
function drawLeaderboard() {
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.translate(canvas.width-360, 40);
    ctx.fillStyle = 'rgba(20,30,40,0.98)';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(0,0,320,leaderboard.length*36+64,24);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 28px Orbitron, Arial, sans-serif';
    ctx.fillStyle = '#0ff';
    ctx.fillText('LEADERBOARD', 24, 48);
    ctx.font = 'bold 22px Orbitron, Arial, sans-serif';
    leaderboard.forEach((e,i)=>{
        ctx.fillStyle = '#fff';
        ctx.fillText(`${e.name}: ${e.score} | ${e.coins||0}c`, 24, 88+i*32);
    });
    ctx.restore();
}

// --- Modern Upgrades Menu ---
function drawUpgradesMenu() {
    if (!myPlayer) return;
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(24,24,40,0.98)';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(canvas.width/2-320, canvas.height-220, 640, 180, 32);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 32px Orbitron, Arial, sans-serif';
    ctx.fillStyle = '#0ff';
    ctx.textAlign = 'center';
    ctx.fillText('UPGRADES', canvas.width/2, canvas.height-180);
    ctx.font = 'bold 22px Orbitron, Arial, sans-serif';
    let upgrades = myPlayer.upgrades || {speed:0,damage:0,health:0};
    let coinCount = myPlayer.coins || 0;
    let upgradeList = [
        {name:'Speed', key:'speed', cost:10},
        {name:'Damage', key:'damage', cost:15},
        {name:'Health', key:'health', cost:12}
    ];
    upgradeList.forEach((upg,i)=>{
        let x = canvas.width/2-200 + i*200;
        ctx.fillStyle = '#fff';
        ctx.fillText(`${upg.name}: ${upgrades[upg.key]}`, x+80, canvas.height-120);
        ctx.fillStyle = coinCount>=upg.cost ? '#0ff' : '#888';
        ctx.fillText(`Upgrade (${upg.cost}c)`, x+80, canvas.height-80);
    });
    ctx.restore();
}

function drawPowerups() {
    if (!window.powerups) return;
    powerups.forEach(pw => {
        ctx.save();
        ctx.translate(pw.x-camera.x+canvas.width/2, pw.y-camera.y+canvas.height/2);
        neonGlow('#ff0',12);
        if (pw.type==='coin') {
            ctx.beginPath(); ctx.arc(0,0,16,0,2*Math.PI); ctx.fillStyle='#ff0'; ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
        } else if (pw.type==='health') {
            ctx.fillStyle='#0f0'; ctx.fillRect(-12,-12,24,24);
            ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.strokeRect(-12,-12,24,24);
        } else if (pw.type==='shield') {
            ctx.beginPath(); ctx.arc(0,0,18,0,2*Math.PI); ctx.strokeStyle='#0ff'; ctx.lineWidth=4; ctx.stroke();
        } else if (pw.type==='speed') {
            ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,0); ctx.strokeStyle='#f0f'; ctx.lineWidth=6; ctx.stroke();
        }
        clearGlow();
        ctx.restore();
    });
}
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();
let myId = null, myPlayer = null, players = [], bullets = [], bots = [], leaderboard = [], camera = { x: 0, y: 0 }, health = 100, score = 0, cooldown = 0, ammo = 10, particles = [], keys = {}, mouseAngle = 0;

// --- Main Menu State ---
let gameState = 'playing'; // Start directly in gameplay
let playerName = '';
let selectedTank = 'tank';
function lerp(a, b, t) { return a + (b - a) * t; }
function neonGlow(color, blur = 16) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function clearGlow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

function drawMainMenu() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // --- Arena ---
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2-camera.x, canvas.height/2-camera.y);
    ctx.fillStyle='#181828';
    ctx.fillRect(-1200,-1200,2400,2400);
    neonGlow('#0ff',40);
    ctx.strokeStyle='#0ff';
    ctx.lineWidth=8;
    ctx.strokeRect(-1000,-1000,2000,2000);
    clearGlow();

    // --- Powerups ---
    drawPowerups();

    // --- Bullets ---
    bullets.forEach(bullet => {
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        neonGlow('#0ff',12);
        ctx.rotate(bullet.angle);
        ctx.fillStyle='#0ff';
        ctx.globalAlpha=0.8;
        ctx.fillRect(-4,-2,16,4);
        ctx.globalAlpha=1;
        clearGlow();
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(-16,0);
        ctx.strokeStyle='#0ff8';
        ctx.lineWidth=2;
        ctx.stroke();
        ctx.restore();
    });

    // --- Particles ---
    particles.forEach(p=>{
        ctx.save();
        ctx.globalAlpha = p.life/30;
        neonGlow(p.color,8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 2*Math.PI);
        ctx.fillStyle = p.color;
        ctx.fill();
        clearGlow();
        ctx.restore();
    });

    // --- Tanks (players & bots) ---
    [...players,...bots].forEach(tank => {
        ctx.save();
        ctx.translate(tank.x, tank.y);
        neonGlow('#0ff',16);
        if (tank.type==='tank') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,22,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            if (tank.shield) {
                neonGlow('#0ff',32);
                ctx.beginPath(); ctx.arc(0,0,28,0,2*Math.PI); ctx.strokeStyle='#0ff'; ctx.lineWidth=6; ctx.stroke();
            }
            ctx.fillStyle='#0ff'; ctx.fillRect(-8,-28,16,16);
        } else if (tank.type==='rammer') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.ellipse(0,0,16,26,0,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-6,-32,12,18);
        } else if (tank.type==='sniper') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,18,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-4,-28,8,24);
        }
        ctx.rotate(tank.angle);
        neonGlow('#0ff',8);
        ctx.fillStyle='#0ff';
        ctx.fillRect(-4,-28,8,24);
        clearGlow();
        ctx.restore();
        ctx.save();
        ctx.translate(tank.x, tank.y-38);
        ctx.font='bold 18px Verdana, Arial, sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='bottom';
        neonGlow('#0ff',8);
        ctx.fillStyle='#fff';
        ctx.fillText(tank.name,0,0);
        clearGlow();
        ctx.translate(0,8);
        let hp = Math.max(0,tank.health)/100;
        ctx.fillStyle='#222'; ctx.fillRect(-32,0,64,10);
        let grad = ctx.createLinearGradient(-32,0,32,0);
        grad.addColorStop(0,'#f00'); grad.addColorStop(0.5,'#ff0'); grad.addColorStop(1,'#0f0');
        ctx.fillStyle=grad; ctx.fillRect(-32,0,64*hp,10);
        ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.strokeRect(-32,0,64,10);
        ctx.restore();
    });
    ctx.restore();

    // --- HUD ---
    drawHUD();

    // --- Leaderboard ---
    drawLeaderboard();

    // --- Upgrades Menu ---
    drawUpgradesMenu();
    if (gameState==='playing' && myPlayer) {
        if (keys['w']) socket.emit('move','up');
        if (keys['s']) socket.emit('move','down');
        if (keys['a']) socket.emit('move','left');
        if (keys['d']) socket.emit('move','right');
    }
    updateParticles();
}

function render() {
    // Only render gameplay, no main menu
    // ...existing render code for gameplay...
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2-camera.x, canvas.height/2-camera.y);
    ctx.fillStyle='#181828';
    ctx.fillRect(-1200,-1200,2400,2400);
    neonGlow('#0ff',40);
    ctx.strokeStyle='#0ff';
    ctx.lineWidth=8;
    ctx.strokeRect(-1000,-1000,2000,2000);
    clearGlow();
    bullets.forEach(bullet => {
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        neonGlow('#0ff',12);
        ctx.rotate(bullet.angle);
        ctx.fillStyle='#0ff';
        ctx.globalAlpha=0.8;
        ctx.fillRect(-4,-2,16,4);
        ctx.globalAlpha=1;
        clearGlow();
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(-16,0);
        ctx.strokeStyle='#0ff8';
        ctx.lineWidth=2;
        ctx.stroke();
        ctx.restore();
    });
    particles.forEach(p=>{
        ctx.save();
        ctx.globalAlpha = p.life/30;
        neonGlow(p.color,8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 2*Math.PI);
        ctx.fillStyle = p.color;
        ctx.fill();
        clearGlow();
        ctx.restore();
    });
    [...players,...bots].forEach(tank => {
        ctx.save();
        ctx.translate(tank.x, tank.y);
        neonGlow('#0ff',16);
        if (tank.type==='tank') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,22,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            if (tank.shield) {
                neonGlow('#0ff',32);
                ctx.beginPath(); ctx.arc(0,0,28,0,2*Math.PI); ctx.strokeStyle='#0ff'; ctx.lineWidth=6; ctx.stroke();
            }
            ctx.fillStyle='#0ff'; ctx.fillRect(-8,-28,16,16);
        } else if (tank.type==='rammer') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.ellipse(0,0,16,26,0,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-6,-32,12,18);
        } else if (tank.type==='sniper') {
            ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(0,0,18,0,2*Math.PI); ctx.fill();
            ctx.strokeStyle='#0ff'; ctx.lineWidth=5; ctx.stroke();
            ctx.fillStyle='#0ff'; ctx.fillRect(-4,-28,8,24);
        }
        ctx.rotate(tank.angle);
        neonGlow('#0ff',8);
        ctx.fillStyle='#0ff';
        ctx.fillRect(-4,-28,8,24);
        clearGlow();
        ctx.restore();
        ctx.save();
        ctx.translate(tank.x, tank.y-38);
        ctx.font='bold 18px Arial';
        ctx.textAlign='center';
        ctx.textBaseline='bottom';
        neonGlow('#0ff',8);
        ctx.fillStyle='#fff';
        ctx.fillText(tank.name,0,0);
        clearGlow();
        ctx.translate(0,8);
        let hp = Math.max(0,tank.health)/100;
        ctx.fillStyle='#222'; ctx.fillRect(-32,0,64,10);
        let grad = ctx.createLinearGradient(-32,0,32,0);
        grad.addColorStop(0,'#f00'); grad.addColorStop(0.5,'#ff0'); grad.addColorStop(1,'#0f0');
        ctx.fillStyle=grad; ctx.fillRect(-32,0,64*hp,10);
        ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.strokeRect(-32,0,64,10);
        ctx.restore();
    });
    ctx.restore();
    ctx.save();
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#fff';
    neonGlow('#0ff',8);
    ctx.fillText(`Health: ${Math.round(health)}`, 32, 48);
    ctx.fillText(`Ammo: ${ammo}`, 32, 80);
    ctx.fillText(`Cooldown: ${(cooldown/30).toFixed(1)}s`, 32, 112);
    ctx.fillText(`Score: ${score}`, 32, 144);
    clearGlow();
    ctx.save();
    ctx.translate(canvas.width-260, 40);
    ctx.fillStyle = 'rgba(20,30,40,0.7)';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // ...existing code for HUD and leaderboard (already present above, no need to duplicate)...
}
socket.on('gameState', state => {
    state.players.concat(state.bots).forEach(tank=>{
        if (tank.health<=0) {
            for (let i=0;i<24;i++) {
                particles.push({
                    x:tank.x,y:tank.y,
                    vx:Math.cos(i/24*2*Math.PI)*Math.random()*8,
                    vy:Math.sin(i/24*2*Math.PI)*Math.random()*8,
                    life:30+Math.random()*20,
                    size:6+Math.random()*4,
                    color:'#0ff'
                });
            }
        }
    });
    state.bullets.forEach(b=>{
        if (b.life<5) {
            for (let i=0;i<8;i++) {
                particles.push({
                    x:b.x,y:b.y,
                    vx:Math.cos(i/8*2*Math.PI)*Math.random()*4,
                    vy:Math.sin(i/8*2*Math.PI)*Math.random()*4,
                    life:18+Math.random()*8,
                    size:3+Math.random()*2,
                    color:'#0ff'
                });
            }
        }
    });
});
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function init() {
    resizeCanvas();
    requestAnimationFrame(gameLoop);
}
function update() {
    // Update all game state here
    updateParticles();
    // Add other update logic as needed (e.g., player, bots, powerups)
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}
window.onload = init;
window.addEventListener('resize',resizeCanvas);

// Ensure main menu does not reappear after starting game
window.startGame = function(name, tankType) {
    // Set up player, tank selection, etc. as needed
    gameState = 'playing';
    // ...additional setup logic if needed...
};
