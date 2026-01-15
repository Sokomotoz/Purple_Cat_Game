(() => {
  const game = document.getElementById('game');
  const catWrap = document.getElementById('catWrap');
  const shieldArm = document.getElementById('shieldArm');

  const scoreEl = document.getElementById('score');
 // const adminScoreBtn = document.getElementById('adminScoreBtn');

  const hpText = document.getElementById('hpText');
  const hpFill = document.getElementById('hpFill');

  const bossHud = document.getElementById('bossHud');
  const bossText = document.getElementById('bossText');
  const bossFill = document.getElementById('bossFill');

  const bgm = document.getElementById('bgm');
  const musicVol = document.getElementById('musicVol');
  const musicBtn = document.getElementById('musicBtn');

  const winOverlay = document.getElementById('winOverlay');
  const restartBtn = document.getElementById('restartBtn');

  const loseOverlay = document.getElementById('loseOverlay');
  const loseRestartBtn = document.getElementById('loseRestartBtn');

  const CFG = {
    skeletonSpawnMs: 700,
    skeletonSpeed: 120,
    maxSkeletons: 14,

    catSize: 130,
    catRadius: 38,
    skeletonRadius: 38,

    shieldRadius: 86,
    shieldHitRadius: 55,
    shieldDegPerSec: 220,

    maxHP: 100,
    contactCooldownMs: 220,

    dragonScore: 100,
    dragonHP: 75,
    snakeScore: 200,
    snakeHP: 60,
    bossSpeed: 250,
    bossKnockbackPx: 70,
    bossKnockbackDamp: 9.0,
    dragonSpeed: 2800,
    snakeSpeed: 1200,

    projEveryMs: 300,
    projSpeed: 260,
    projRadius: 10,

    beetleScore: 300,
    beetleHP: 50,
    bombEveryMs: 250,
    bombFuseMs: 2000,
    bombDamage: 10,
    bombRadius: 28,

    batScore: 400,
    batHP: 35,
    batJumpEveryMs: 800,
    batJumpRadius: 170,
    batSide: 160,
    batProjectileEveryMs: 400,
    batProjectileSpreadDeg: 12,
    batMinDistFromCat: 220,

    carScore: 500,
    carHP: 100,
    carPhase2AtHP: 50,

    carOrbitRadius: 210,
    carOrbitDegPerSec: 90,

    carShotEveryMs: 420,
    carSingleShotsCount: 5,
    carBurstCooldownMs: 650,

    carOrbitRadiusMin: 120,
    carOrbitRadiusMax: 260,
    carEngageDist: 210,
    carOrbitRadiusLerp: 6.5,

    carDashSpeed: 1600,
    carDashCooldownMs: 700,
    carDashMinDist: 260,

    // оставлено, но не используется (отпрыгивание отключено)
    carFleeDist: 170,
    carFleeJumpPx: 220,
    carFleeCooldownMs: 650,

    carCloseChargeDist: 170,

    winScore: 520
  };

  let score = 0;
  let hp = CFG.maxHP;
  let gameOver = false;

  let mode = "SKELETONS";

  const skeletons = new Set();
  let spawnTimer = null;

  let catPos = { x: innerWidth/2, y: innerHeight/2 };
  let dragging = false;
  let activePointerId = null;
  let dragOffset = { x: 0, y: 0 };

  let shieldAngle = 0;
  let shieldPos = { x: catPos.x + CFG.shieldRadius, y: catPos.y };

  let boss = null;
  let bossPhase = 0;

  const projectiles = new Set();
  let projTimer = null;

  const bombs = new Set();
  let bombTimer = null;

  let batJumpTimer = null;
  let batCorner = 0;

  let carAttackTimer = null;

//  adminScoreBtn.addEventListener('click', () => {
//    if (gameOver) return;
//    score += 20;
//    scoreEl.textContent = score;
//    checkMilestones();
//  });

  let musicEnabled = true;
  bgm.volume = Number(musicVol.value);
  musicVol.addEventListener('input', () => bgm.volume = Number(musicVol.value));

  function syncMusicButton() { musicBtn.textContent = musicEnabled ? 'Выкл' : 'Вкл'; }
  async function applyMusicState() {
    if (!musicEnabled) { bgm.pause(); return; }
    try { await bgm.play(); } catch(e) {}
  }
  musicBtn.addEventListener('click', async () => {
    musicEnabled = !musicEnabled;
    syncMusicButton();
    await applyMusicState();
  });
  window.addEventListener('pointerdown', async () => { await applyMusicState(); }, { once: true });
  syncMusicButton();

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const sfxCtx = new AudioCtx();
  let sfxUnlocked = false;

  function unlockSfx(){ if (sfxUnlocked) return; sfxCtx.resume().then(()=>sfxUnlocked=true).catch(()=>{}); }

  function swordHitSound(){
    if (!sfxUnlocked) return;
    const now = sfxCtx.currentTime;
    const gain = sfxCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    const bufferSize = Math.floor(sfxCtx.sampleRate * 0.12);
    const buffer = sfxCtx.createBuffer(1, bufferSize, sfxCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const noise = sfxCtx.createBufferSource();
    noise.buffer = buffer;

    const band = sfxCtx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(2200, now);
    band.Q.setValueAtTime(3.5, now);

    const osc = sfxCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.09);

    noise.connect(band).connect(gain).connect(sfxCtx.destination);
    osc.connect(gain).connect(sfxCtx.destination);

    noise.start(now); osc.start(now);
    noise.stop(now + 0.13); osc.stop(now + 0.13);
  }

  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const circlesHit = (a,ar,b,br)=> dist(a,b) < (ar+br);

  function setCatPos(x,y){
    const pad = CFG.catSize/2;
    catPos.x = clamp(x, pad, innerWidth - pad);
    catPos.y = clamp(y, pad, innerHeight - pad);
    catWrap.style.left = catPos.x + 'px';
    catWrap.style.top  = catPos.y + 'px';
  }

  function updateHPUI(){
    hpText.textContent = `${hp}/${CFG.maxHP}`;
    const k = hp / CFG.maxHP;
    hpFill.style.width = (k*100)+'%';
    hpFill.style.background = k < 0.35
      ? `linear-gradient(90deg, var(--danger), #ff9fb0)`
      : `linear-gradient(90deg, var(--ok), #b6ffea)`;
  }

  function showBossUI(show, cur=0, max=0){
    bossHud.style.display = show ? 'inline-flex' : 'none';
    if (!show) return;
    bossText.textContent = `${cur}/${max}`;
    bossFill.style.width = ((cur/max)*100)+'%';
  }

  function loseGame(){
    if (gameOver) return;
    gameOver = true;
    loseOverlay.style.display = 'flex';

    stopSkeletonSpawns();
    clearSkeletons();
    clearProjectiles();
    clearBombs();
    clearBatJump();
    clearCarTimer();

    if (boss) { boss.el.remove(); boss = null; showBossUI(false); }
  }

  function clearSkeletons(){
    for (const sk of skeletons) sk.el.remove();
    skeletons.clear();
  }

  function spawnSkeleton(){
    if (gameOver) return;
    if (mode !== "SKELETONS") return;
    if (skeletons.size >= CFG.maxSkeletons) return;

    const el = document.createElement('div');
    el.className = 'entity skeleton';

    const isGreen = Math.random() < 0.10;
    if (isGreen) {
      el.classList.add('green');
      el.textContent = '💚';
    } else {
      el.textContent = '💀';
    }

    game.appendChild(el);

    const side = Math.floor(Math.random()*4);
    const margin = 40;
    let x,y;
    if (side===0){ x=Math.random()*innerWidth; y=-margin; }
    if (side===1){ x=innerWidth+margin; y=Math.random()*innerHeight; }
    if (side===2){ x=Math.random()*innerWidth; y=innerHeight+margin; }
    if (side===3){ x=-margin; y=Math.random()*innerHeight; }

    const sk = { el, pos:{x,y}, dead:false, lastDamageAt:0, isGreen };
    el.style.left = x+'px';
    el.style.top  = y+'px';
    skeletons.add(sk);
  }

  function killSkeleton(sk){
    if (sk.dead) return;
    sk.dead = true;

    sk.el.classList.add('hit');
    swordHitSound();

    score += 1;
    scoreEl.textContent = score;

    if (sk.isGreen) {
      hp = Math.min(CFG.maxHP, hp + 5);
      updateHPUI();
    }

    setTimeout(()=>{ sk.el.remove(); skeletons.delete(sk); }, 160);
    checkMilestones();
  }

  function damageCatFromContact(lastDamageAtObj, nowMs){
    if (nowMs - lastDamageAtObj.lastDamageAt < CFG.contactCooldownMs) return;
    lastDamageAtObj.lastDamageAt = nowMs;

    hp = Math.max(0, hp-1);
    updateHPUI();
    if (hp<=0) loseGame();
  }

  function stopSkeletonSpawns(){
    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = null;
  }
  function startSkeletonSpawns(){
    stopSkeletonSpawns();
    spawnTimer = setInterval(spawnSkeleton, CFG.skeletonSpawnMs);
  }

  function clearProjectiles(){
    for (const p of projectiles) p.el.remove();
    projectiles.clear();
    if (projTimer) { clearInterval(projTimer); projTimer = null; }
  }

  function clearBombs(){
    for (const b of bombs) {
      if (b.timeoutId) clearTimeout(b.timeoutId);
      b.el.remove();
    }
    bombs.clear();
    if (bombTimer) { clearInterval(bombTimer); bombTimer = null; }
  }

  function clearBatJump(){
    if (batJumpTimer) { clearInterval(batJumpTimer); batJumpTimer = null; }
  }

  function clearCarTimer(){
    if (carAttackTimer) { clearInterval(carAttackTimer); carAttackTimer = null; }
  }

  function spawnBoss(type){
    mode = "BOSS";
    stopSkeletonSpawns();
    clearSkeletons();

    clearProjectiles();
    clearBombs();
    clearBatJump();
    clearCarTimer();

    const el = document.createElement('div');
    el.className = 'entity boss';
    el.textContent =
      (type === 'dragon') ? '🐲' :
      (type === 'snake')  ? '🐍' :
      (type === 'beetle') ? '🐞' :
      (type === 'bat')    ? '🦇' : '🐿';
    if (type === 'car') el.classList.add('car');
    game.appendChild(el);

    const maxHP =
      (type === 'dragon') ? CFG.dragonHP :
      (type === 'snake')  ? CFG.snakeHP  :
      (type === 'beetle') ? CFG.beetleHP :
      (type === 'bat')    ? CFG.batHP    : CFG.carHP;

    boss = {
      type,
      el,
      pos: (type === 'bat')
        ? { x: innerWidth*0.75, y: innerHeight*0.35 }
        : { x: innerWidth*0.78, y: innerHeight*0.5 },
      hp: maxHP,
      maxHP,
      vel: { x: 0, y: 0 },
      lastHitAt: 0,
      lastDamageAt: 0,

      orbitAngle: 0,
      carPhase: 1,
      carSingleLeft: 0,
      carBurstLeft: 0,
      carBurstStage: 0,
      orbitRadius: CFG.carOrbitRadius,
      carCenter: { x: catPos.x, y: catPos.y },
      dash: { active:false, vx:0, vy:0, cooldown:0 }
    };

    if (type === 'car') {
      boss.carCenter = { x: catPos.x, y: catPos.y };
      boss.orbitRadius = CFG.carOrbitRadius;
      boss.orbitAngle = Math.random() * Math.PI * 2;

      boss.pos = { x: boss.carCenter.x + boss.orbitRadius, y: boss.carCenter.y };
      boss.el.style.left = boss.pos.x + 'px';
      boss.el.style.top  = boss.pos.y + 'px';

      boss.carPhase = 1;
      boss.carBurstStage = 0;
      boss.carSingleLeft = CFG.carSingleShotsCount;
      boss.carBurstLeft = 0;
      boss.dash = { active:false, vx:0, vy:0, cooldown:0 };

      carAttackTimer = setInterval(() => {
        if (!boss || boss.type !== 'car' || gameOver) return;
        carAttackStep();
      }, CFG.carShotEveryMs);
    }

    el.style.left = boss.pos.x + 'px';
    el.style.top  = boss.pos.y + 'px';
    showBossUI(true, boss.hp, boss.maxHP);

    if (type === 'snake') {
      projTimer = setInterval(() => {
        if (!boss || boss.type !== 'snake' || gameOver) return;
        fireProjectileFromBoss();
      }, CFG.projEveryMs);
    }

    if (type === 'beetle') {
      bombTimer = setInterval(() => {
        if (!boss || boss.type !== 'beetle' || gameOver) return;
        spawnBombUnderCat();
      }, CFG.bombEveryMs);
    }

    if (type === 'bat') {
      batCorner = 0;
      batJumpTimer = setInterval(() => {
        if (!boss || boss.type !== 'bat' || gameOver) return;
        batJumpNearCat();
      }, CFG.batJumpEveryMs);

      projTimer = setInterval(() => {
        if (!boss || boss.type !== 'bat' || gameOver) return;
        fireTripleProjectilesFromBoss();
      }, CFG.batProjectileEveryMs);
    }
  }

  function bossTakeHitFromShield(){
    if (!boss) return false;

    const now = performance.now();
    if (now - boss.lastHitAt < 120) return false;
    boss.lastHitAt = now;

    boss.hp = Math.max(0, boss.hp - 1);
    showBossUI(true, boss.hp, boss.maxHP);

    const dx = boss.pos.x - catPos.x;
    const dy = boss.pos.y - catPos.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = CFG.bossKnockbackPx * 6;
    boss.vel.x += (dx/len) * k;
    boss.vel.y += (dy/len) * k;

    swordHitSound();

    if (boss.hp <= 0) {
      boss.el.remove();
      boss = null;
      showBossUI(false);

      mode = "SKELETONS";
      clearProjectiles();
      clearBombs();
      clearBatJump();
      clearCarTimer();
      startSkeletonSpawns();
      return true;
    }
    return false;
  }

  function spawnProjectile(x,y,vx,vy){
    const el = document.createElement('div');
    el.className = 'entity proj';
    game.appendChild(el);

    const p = { el, pos:{x,y}, v:{x:vx, y:vy}, dead:false };
    el.style.left = x+'px';
    el.style.top  = y+'px';
    projectiles.add(p);
  }

  function fireProjectileFromBoss(){
    const dx = catPos.x - boss.pos.x;
    const dy = catPos.y - boss.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx/len) * CFG.projSpeed;
    const vy = (dy/len) * CFG.projSpeed;
    spawnProjectile(boss.pos.x, boss.pos.y, vx, vy);
  }

  function rotateVec(vx, vy, angRad){
    const c = Math.cos(angRad), s = Math.sin(angRad);
    return { x: vx*c - vy*s, y: vx*s + vy*c };
  }

  function fireTripleProjectilesFromBoss(){
    const dx = catPos.x - boss.pos.x;
    const dy = catPos.y - boss.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx/len, uy = dy/len;

    const baseV = { x: ux*CFG.projSpeed, y: uy*CFG.projSpeed };
    const deg = CFG.batProjectileSpreadDeg;
    const angles = [ -deg, 0, +deg ].map(d => d * Math.PI / 180);

    for (const a of angles) {
      const vv = rotateVec(baseV.x, baseV.y, a);
      spawnProjectile(boss.pos.x, boss.pos.y, vv.x, vv.y);
    }
  }

  function damageCatFromProjectile(p){
    if (p.dead) return;
    p.dead = true;

    p.el.classList.add('hit');
    hp = Math.max(0, hp - 1);
    updateHPUI();

    setTimeout(()=>{ p.el.remove(); projectiles.delete(p); }, 160);
    if (hp <= 0) loseGame();
  }

  function spawnBombUnderCat(){
    const el = document.createElement('div');
    el.className = 'entity bomb';
    el.textContent = '💣';
    game.appendChild(el);

    const b = {
      el,
      pos: { x: catPos.x, y: catPos.y },
      dead: false,
      timeoutId: null
    };

    el.style.left = b.pos.x + 'px';
    el.style.top  = b.pos.y + 'px';

    b.timeoutId = setTimeout(() => explodeBomb(b), CFG.bombFuseMs);
    bombs.add(b);
  }

  function explodeBomb(b){
    if (b.dead) return;
    b.dead = true;

    if (circlesHit(b.pos, CFG.bombRadius, catPos, CFG.catRadius)) {
      hp = Math.max(0, hp - CFG.bombDamage);
      updateHPUI();
      if (hp <= 0) { loseGame(); return; }
    }

    b.el.classList.add('exploding');
    setTimeout(()=>{ b.el.remove(); bombs.delete(b); }, 220);
  }

  function batJumpNearCat(){
    if (!boss || boss.type !== 'bat') return;

    const s = CFG.batSide;
    const r = CFG.batJumpRadius;
    const minD = CFG.batMinDistFromCat;

    let cx, cy;
    for (let i = 0; i < 12; i++) {
      cx = clamp(catPos.x + (Math.random()*2-1)*r, 90, innerWidth - 90);
      cy = clamp(catPos.y + (Math.random()*2-1)*r, 90, innerHeight - 90);
      if (Math.hypot(cx - catPos.x, cy - catPos.y) >= minD) break;
    }

    const corners = [
      { x: cx - s/2, y: cy - s/2 },
      { x: cx + s/2, y: cy - s/2 },
      { x: cx + s/2, y: cy + s/2 },
      { x: cx - s/2, y: cy + s/2 }
    ];

    const p = corners[batCorner % 4];
    batCorner++;

    boss.pos.x = clamp(p.x, 60, innerWidth - 60);
    boss.pos.y = clamp(p.y, 80, innerHeight - 60);

    boss.el.style.left = boss.pos.x + 'px';
    boss.el.style.top  = boss.pos.y + 'px';
  }

  function carAttackStep(){
    if (!boss || boss.type !== 'car') return;
    if (boss.carPhase !== 1) return;

    fireProjectileFromBoss();
    boss.carSingleLeft--;

    if (boss.carSingleLeft <= 0) {
      boss.carBurstStage = 1;
      boss.carBurstLeft = 3;
      startCarBurstLoop();
    }
  }

  function carBurstStep(){
    if (!boss || boss.type !== 'car') return;
    if (boss.carPhase !== 1) return;

    fireTripleProjectilesFromBoss();
    boss.carBurstLeft--;

    if (boss.carBurstLeft <= 0) {
      boss.carBurstStage = 0;
      boss.carSingleLeft = CFG.carSingleShotsCount;
      startCarSingleLoop();
    }
  }

  function startCarSingleLoop(){
    clearCarTimer();
    carAttackTimer = setInterval(() => {
      if (!boss || boss.type !== 'car' || gameOver) return;
      carAttackStep();
    }, CFG.carShotEveryMs);
  }

  function startCarBurstLoop(){
    clearCarTimer();
    carAttackTimer = setInterval(() => {
      if (!boss || boss.type !== 'car' || gameOver) return;
      carBurstStep();
    }, CFG.carBurstCooldownMs);
  }

  function checkMilestones(){
    if (score >= CFG.dragonScore && bossPhase < 1) { bossPhase = 1; spawnBoss('dragon'); return; }
    if (score >= CFG.snakeScore  && bossPhase < 2) { bossPhase = 2; spawnBoss('snake');  return; }
    if (score >= CFG.beetleScore && bossPhase < 3) { bossPhase = 3; spawnBoss('beetle'); return; }
    if (score >= CFG.batScore    && bossPhase < 4) { bossPhase = 4; spawnBoss('bat');    return; }
    if (score >= CFG.carScore    && bossPhase < 5) { bossPhase = 5; spawnBoss('car');    return; }

    if (score >= CFG.winScore && !gameOver) {
      gameOver = true;
      winOverlay.style.display = 'flex';
      stopSkeletonSpawns();
      clearSkeletons();
      clearProjectiles();
      clearBombs();
      clearBatJump();
      clearCarTimer();
      if (boss) { boss.el.remove(); boss = null; showBossUI(false); }
    }
  }

  catWrap.addEventListener('dragstart', e => e.preventDefault());

  function pointerDown(e){
    if (gameOver) return;
    unlockSfx();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    dragging = true;
    activePointerId = e.pointerId;

    const rect = catWrap.getBoundingClientRect();
    dragOffset.x = e.clientX - (rect.left + rect.width/2);
    dragOffset.y = e.clientY - (rect.top  + rect.height/2);

    catWrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function pointerMove(e){
    if (!dragging || gameOver) return;
    if (e.pointerId !== activePointerId) return;

    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      dragging = false; activePointerId = null; return;
    }
    setCatPos(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
  }

  function pointerUp(e){
    if (e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    try { catWrap.releasePointerCapture(e.pointerId); } catch(_){}
  }

  catWrap.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);

  let lastT = performance.now();

  function tick(t){
    const dt = (t - lastT) / 1000;
    lastT = t;

    shieldAngle += (CFG.shieldDegPerSec * Math.PI / 180) * dt;
    shieldArm.style.transform = `rotate(${shieldAngle}rad)`;
    shieldPos.x = catPos.x + Math.cos(shieldAngle) * CFG.shieldRadius;
    shieldPos.y = catPos.y + Math.sin(shieldAngle) * CFG.shieldRadius;

    const nowMs = performance.now();

    if (!gameOver) {
      if (mode === "SKELETONS") {
        for (const sk of skeletons) {
          if (sk.dead) continue;

          const dx = catPos.x - sk.pos.x;
          const dy = catPos.y - sk.pos.y;
          const len = Math.hypot(dx, dy) || 1;

          sk.pos.x += (dx/len) * CFG.skeletonSpeed * dt;
          sk.pos.y += (dy/len) * CFG.skeletonSpeed * dt;

          sk.el.style.left = sk.pos.x + 'px';
          sk.el.style.top  = sk.pos.y + 'px';

          if (circlesHit(sk.pos, CFG.skeletonRadius, shieldPos, CFG.shieldHitRadius)) {
            killSkeleton(sk);
            continue;
          }

          if (circlesHit(sk.pos, CFG.skeletonRadius, catPos, CFG.catRadius)) {
            damageCatFromContact(sk, nowMs);
          }
        }
      }

      if (mode === "BOSS" && boss) {
        if (boss.type === 'car') {
          if (boss.carPhase === 1 && boss.hp <= CFG.carPhase2AtHP) {
            boss.carPhase = 2;
            clearCarTimer();
          }

          if (boss.carPhase === 1) {
            boss.orbitAngle += (CFG.carOrbitDegPerSec * Math.PI / 180) * dt;

            const pull = 0.9;
            boss.carCenter.x += (catPos.x - boss.carCenter.x) * pull * dt;
            boss.carCenter.y += (catPos.y - boss.carCenter.y) * pull * dt;

            boss.carCenter.x = clamp(boss.carCenter.x, 120, innerWidth - 120);
            boss.carCenter.y = clamp(boss.carCenter.y, 120, innerHeight - 120);

            boss.pos.x = boss.carCenter.x + Math.cos(boss.orbitAngle) * boss.orbitRadius;
            boss.pos.y = boss.carCenter.y + Math.sin(boss.orbitAngle) * boss.orbitRadius;

            boss.el.style.left = boss.pos.x + 'px';
            boss.el.style.top  = boss.pos.y + 'px';
          } else {
            if (!boss.dash.active) {
              const dx0 = catPos.x - boss.pos.x;
              const dy0 = catPos.y - boss.pos.y;
              const d0 = Math.hypot(dx0, dy0) || 1;

              if (d0 < CFG.carCloseChargeDist) {
                boss.dash.active = true;
                boss.dash.vx = (dx0 / d0) * CFG.carDashSpeed;
                boss.dash.vy = (dy0 / d0) * CFG.carDashSpeed;
                boss.dash.cooldown = 0;
              }
            }

            boss.dash.cooldown = Math.max(0, boss.dash.cooldown - dt*1000);

            if (!boss.dash.active && boss.dash.cooldown <= 0) {
              const dx = catPos.x - boss.pos.x;
              const dy = catPos.y - boss.pos.y;
              const d = Math.hypot(dx, dy) || 1;

              if (d < CFG.carDashMinDist) {
                boss.dash.cooldown = CFG.carDashCooldownMs;
              } else {
                boss.dash.active = true;
                boss.dash.vx = (dx / d) * CFG.carDashSpeed;
                boss.dash.vy = (dy / d) * CFG.carDashSpeed;
              }
            }

            if (boss.dash.active) {
              boss.pos.x += boss.dash.vx * dt;
              boss.pos.y += boss.dash.vy * dt;

              const out =
                (boss.pos.x < -80 || boss.pos.x > innerWidth + 80 ||
                 boss.pos.y < -80 || boss.pos.y > innerHeight + 80);

              if (out) {
                boss.pos.x = clamp(boss.pos.x, 60, innerWidth - 60);
                boss.pos.y = clamp(boss.pos.y, 80, innerHeight - 60);
                boss.dash.active = false;
                boss.dash.cooldown = CFG.carDashCooldownMs;
              }

              boss.el.style.left = boss.pos.x + 'px';
              boss.el.style.top  = boss.pos.y + 'px';
            }
          }
        }

        if (boss && boss.type !== 'bat' && boss.type !== 'car') {
          const dx = catPos.x - boss.pos.x;
          const dy = catPos.y - boss.pos.y;
          const len = Math.hypot(dx, dy) || 1;

          const targetSpeed =
            (boss.type === 'dragon') ? CFG.dragonSpeed :
            (boss.type === 'snake')  ? CFG.snakeSpeed  :
            (boss.type === 'beetle') ? CFG.bossSpeed   : CFG.bossSpeed;

          const ax = (dx/len) * targetSpeed;
          const ay = (dy/len) * targetSpeed;

          boss.vel.x += ax * dt;
          boss.vel.y += ay * dt;

          boss.vel.x *= Math.exp(-CFG.bossKnockbackDamp * dt);
          boss.vel.y *= Math.exp(-CFG.bossKnockbackDamp * dt);

          boss.pos.x += boss.vel.x * dt;
          boss.pos.y += boss.vel.y * dt;

          boss.pos.x = clamp(boss.pos.x, 60, innerWidth - 60);
          boss.pos.y = clamp(boss.pos.y, 80, innerHeight - 60);

          boss.el.style.left = boss.pos.x + 'px';
          boss.el.style.top  = boss.pos.y + 'px';
        }

        if (boss && circlesHit(boss.pos, 54, shieldPos, CFG.shieldHitRadius)) {
          const died = bossTakeHitFromShield();
          if (died) { requestAnimationFrame(tick); return; }
        }

        if (boss && circlesHit(boss.pos, 54, catPos, CFG.catRadius)) {
          if (boss.type === 'car' && boss.carPhase === 2 && boss.dash && boss.dash.active) {
            if (nowMs - boss.lastDamageAt >= CFG.contactCooldownMs) {
              boss.lastDamageAt = nowMs;

              hp = Math.max(0, hp - 50);
              updateHPUI();

              boss.dash.active = false;
              boss.dash.cooldown = CFG.carDashCooldownMs;

              if (hp <= 0) loseGame();
            }
          } else {
            damageCatFromContact(boss, nowMs);
          }
        }
      }

      for (const p of projectiles) {
        if (p.dead) continue;

        p.pos.x += p.v.x * dt;
        p.pos.y += p.v.y * dt;
        p.el.style.left = p.pos.x + 'px';
        p.el.style.top  = p.pos.y + 'px';

        if (circlesHit(p.pos, CFG.projRadius, catPos, CFG.catRadius)) {
          damageCatFromProjectile(p);
          continue;
        }

        if (p.pos.x < -60 || p.pos.x > innerWidth + 60 || p.pos.y < -60 || p.pos.y > innerHeight + 60) {
          p.dead = true;
          p.el.remove();
          projectiles.delete(p);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  function resetGame(){
    gameOver = false;
    winOverlay.style.display = 'none';
    loseOverlay.style.display = 'none';

    clearSkeletons();
    clearProjectiles();
    clearBombs();
    clearBatJump();
    clearCarTimer();
    if (boss) { boss.el.remove(); boss = null; showBossUI(false); }

    score = 0; scoreEl.textContent = score;
    hp = CFG.maxHP; updateHPUI();

    bossPhase = 0;
    mode = "SKELETONS";

    setCatPos(innerWidth/2, innerHeight/2);
    startSkeletonSpawns();
  }

  restartBtn.addEventListener('click', resetGame);
  loseRestartBtn.addEventListener('click', resetGame);
  window.addEventListener('resize', () => setCatPos(catPos.x, catPos.y));

  setCatPos(innerWidth/2, innerHeight/2);
  updateHPUI();
  startSkeletonSpawns();
  requestAnimationFrame(tick);
})();
