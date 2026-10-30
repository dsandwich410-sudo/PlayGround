/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — DOM interface, HUD, deployment sheet and overlays
   ──────────────────────────────────────────────────────────────────────── */

import { UNIT_TYPES } from './game.js';

const pad = (n) => String(n).padStart(2, '0');
const $ = (id) => document.getElementById(id);

const ICONS = {
  inf: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 25c0-7 4.5-12 10-12s10 5 10 12" fill="currentColor" fill-opacity=".14"/><path d="M14 25h20M17 29h14"/><path d="M12 35l7-7M36 35l-7-7"/><circle cx="24" cy="16" r="2.2" fill="currentColor" stroke="none"/></svg>`,
  tank: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 28h28l-3 7H13Z" fill="currentColor" fill-opacity=".14"/><rect x="17" y="21" width="15" height="7" rx="2" fill="currentColor" fill-opacity=".2"/><circle cx="24" cy="21" r="4.5" fill="currentColor" fill-opacity=".24"/><path d="M28 21h10"/><circle cx="15" cy="35" r="2.2" fill="currentColor" stroke="none"/><circle cx="33" cy="35" r="2.2" fill="currentColor" stroke="none"/></svg>`,
  arty: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 31h24l-2 6H14Z" fill="currentColor" fill-opacity=".14"/><circle cx="16" cy="36" r="3" fill="currentColor" fill-opacity=".2"/><circle cx="32" cy="36" r="3" fill="currentColor" fill-opacity=".2"/><path d="M19 29l15-15"/><path d="M31 13l5-5 4 4-5 5Z" fill="currentColor" fill-opacity=".22"/><path d="M15 28l8 2"/></svg>`,
  scout: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M28 8 14 27h8l-3 13 15-20h-8Z" fill="currentColor" fill-opacity=".2"/><path d="M10 38h28" opacity=".45"/></svg>`,
};

export class UI {
  constructor(game, renderer, sound) {
    this.game = game;
    this.renderer = renderer;
    this.sound = sound;
    this.el = {
      gold: $('goldValue'),
      city: $('cityValue'),
      turnChip: $('turnChip'),
      turnLabel: $('turnLabel'),
      turnNumber: $('turnNumber'),
      objective: $('objectiveText'),
      toastStack: $('toastStack'),
      unitPanel: $('unitPanel'),
      unitEmblem: $('unitEmblem'),
      unitFaction: $('unitFaction'),
      unitName: $('unitName'),
      unitState: $('unitState'),
      unitHint: $('unitHint'),
      unitMeters: $('unitMeters'),
      hpBar: $('hpBar'),
      hpValue: $('hpValue'),
      statAtk: $('statAtk'),
      statDef: $('statDef'),
      statMove: $('statMove'),
      statRange: $('statRange'),
      hold: $('holdBtn'),
      endTurn: $('endTurnBtn'),
      endTurnLabel: $('endTurnLabel'),
      endTurnSub: $('endTurnSub'),
      endTurnArrow: $('endTurnArrow'),
      banner: $('turnBanner'),
      citySheet: $('citySheet'),
      cityScrim: $('sheetScrim'),
      cityKicker: $('cityKicker'),
      cityName: $('cityName'),
      cityMeta: $('cityMeta'),
      cityClose: $('cityClose'),
      buildGrid: $('buildGrid'),
      sheetGold: $('sheetGold'),
      intro: $('intro'),
      start: $('startBtn'),
      manual: $('manual'),
      manualScrim: $('manualScrim'),
      manualClose: $('manualClose'),
      manualDone: $('manualDone'),
      newGame: $('newGameBtn'),
      help: $('helpBtn'),
      sound: $('soundBtn'),
      gameOver: $('gameOver'),
      gameOverTitle: $('gameOverTitle'),
      gameOverKicker: $('gameOverKicker'),
      gameOverText: $('gameOverText'),
      gameOverStats: $('gameOverStats'),
      redeploy: $('redeployBtn'),
      tilt: $('tiltBtn'),
      minimap: $('minimapShell'),
    };
    this.bannerTimer = null;
    this.bind();
    this.syncSound();
    this.update();
    if (!game.started) this.el.intro.hidden = false;
    game.addEventListener('change', () => this.update());
    game.addEventListener('toast', (e) => this.toast(e.detail.text, e.detail.kind));
    game.addEventListener('banner', (e) => this.banner(e.detail));
    game.addEventListener('city', (e) => this.openCity(e.detail.city));
    game.addEventListener('cityclose', () => this.closeCity());
    game.addEventListener('gameover', (e) => this.gameOver(e.detail));
    game.addEventListener('upkeep', (e) => { if (!e.detail.initial) this.pulseMoney(); });
    game.addEventListener('newgame', (e) => this.newGame(e.detail));
  }

  bind() {
    this.el.start.addEventListener('click', () => {
      this.sound.unlock();
      this.sound.click();
      this.el.intro.hidden = true;
      this.game.begin();
    });
    this.el.endTurn.addEventListener('click', () => {
      if (this.game.side !== 'player' || this.game.busy || this.game.over) return;
      this.sound.click();
      this.game.endPlayerTurn();
    });
    this.el.hold.addEventListener('click', () => {
      this.sound.click();
      this.game.holdUnit();
    });
    this.el.help.addEventListener('click', () => this.openManual());
    this.el.manualClose.addEventListener('click', () => this.closeManual());
    this.el.manualDone.addEventListener('click', () => this.closeManual());
    this.el.manualScrim.addEventListener('click', () => this.closeManual());
    this.el.newGame.addEventListener('click', () => {
      this.sound.click();
      this.closeManual();
      this.el.gameOver.hidden = true;
      this.game.newGame(undefined, { intro: false });
      this.sound.turn();
      setTimeout(() => this.game.banner('NEW OPERATION', 'ROUND 01 · FRESH ORDERS', 'player'), 120);
    });
    this.el.cityClose.addEventListener('click', () => this.game.closeBuild());
    this.el.cityScrim.addEventListener('click', () => this.game.closeBuild());
    this.el.buildGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.build-card');
      if (!card || card.disabled) return;
      const city = this.game.buildCity;
      if (!city) return;
      const type = card.dataset.type;
      this.sound.click();
      const ok = this.game.buildUnit(city.id, type);
      if (ok) setTimeout(() => this.sound.fx({ kind: 'spawn' }), 60);
    });
    this.el.sound.addEventListener('click', () => {
      this.sound.toggle();
      this.syncSound();
    });
    this.el.redeploy.addEventListener('click', () => {
      this.sound.click();
      this.el.gameOver.hidden = true;
      this.game.newGame(undefined, { intro: false });
      this.sound.turn();
      setTimeout(() => this.game.banner('REDEPLOYED', 'ROUND 01 · FRESH ORDERS', 'player'), 120);
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) this.sound.unlock();
    }, { passive: true });
  }

  syncSound() {
    this.el.sound.classList.toggle('muted', !this.sound.enabled);
    this.el.sound.setAttribute('aria-pressed', String(this.sound.enabled));
    this.el.sound.setAttribute('aria-label', this.sound.enabled ? 'Mute sound' : 'Enable sound');
  }

  update() {
    const g = this.game;
    const playerCities = g.citiesOf('player').length;
    this.el.gold.textContent = g.gold.player;
    this.el.city.textContent = `${playerCities}/${g.map.cities.length}`;
    this.el.turnNumber.textContent = pad(g.turn);

    const enemy = g.side === 'enemy';
    this.el.turnChip.classList.toggle('enemy', enemy);
    this.el.turnLabel.textContent = g.over ? 'CEASEFIRE' : enemy ? 'ENEMY TURN' : 'YOUR TURN';

    const enemyHQ = g.enemyHQ();
    this.el.objective.textContent = g.over
      ? (g.selectedId ? 'Field command' : 'Operation concluded')
      : enemyHQ ? `Seize ${enemyHQ.name}` : 'Seize the enemy HQ';

    const canEnd = g.started && !g.over && !g.busy && g.side === 'player';
    this.el.endTurn.disabled = !canEnd;
    this.el.endTurn.classList.toggle('enemy-phase', enemy && !g.over);
    this.el.endTurnLabel.textContent = g.over ? 'Operation Over' : enemy ? 'Enemy Phase' : 'End Turn';
    this.el.endTurnSub.textContent = g.over ? 'SECTOR COMPLETE'
      : enemy ? 'AI COMMAND' : `ROUND ${pad(g.turn)} · PASS`;
    this.el.endTurnArrow.textContent = enemy && !g.over ? '◌' : '▸';

    const focus = g.selected || g.inspected;
    this.updateUnit(focus);

    this.el.hold.disabled = !g.selected || !g.canAct(g.selected);
    if (g.buildCityId !== null) this.updateCity();
  }

  updateUnit(u) {
    const g = this.game;
    const panel = this.el.unitPanel;
    panel.classList.toggle('has-unit', !!u);
    panel.classList.toggle('enemy', !!u && u.side === 'enemy');

    if (!u) {
      this.el.unitFaction.textContent = g.side === 'enemy' ? 'ENEMY MANOEUVRE' : 'NO UNIT SELECTED';
      this.el.unitName.textContent = g.side === 'enemy' ? 'Hold the line' : 'Field Command';
      this.el.unitState.textContent = g.side === 'enemy' ? 'IN CONTACT' : '';
      this.el.unitState.className = 'unit-state';
      this.el.unitHint.textContent = g.side === 'enemy'
        ? 'Enemy is moving. Watch the field and prepare.'
        : g.over ? 'The operation is complete. Redeploy for a new sector.'
          : 'Tap one of your units, then tap a highlighted tile to move.';
      this.el.unitEmblem.innerHTML = '<span class="emblem-placeholder">◎</span>';
      this.el.unitMeters.hidden = true;
      return;
    }

    const T = UNIT_TYPES[u.type];
    const enemy = u.side === 'enemy';
    this.el.unitFaction.textContent = enemy ? `ENEMY CONTACT · ${T.category}` : `YOUR FORCES · ${T.category}`;
    this.el.unitName.textContent = T.name;
    this.el.unitState.textContent = g.unitState(u);
    this.el.unitState.className = `unit-state ${g.unitState(u).toLowerCase()}`;
    this.el.unitEmblem.innerHTML = ICONS[u.type];

    let hint;
    if (enemy) {
      hint = 'Enemy unit. Hit it before it closes on your line.';
    } else if (!g.selected) {
      hint = 'Tap a highlighted tile to move this unit.';
    } else if (u.done) {
      hint = 'Spent for this turn. It will be ready next round.';
    } else if (u.hasMoved && g.attackTiles.size) {
      hint = 'In position — tap a red target to fire.';
    } else if (u.hasMoved) {
      hint = 'Movement spent. No targets in range.';
    } else if (g.attackTiles.size) {
      hint = 'Target in range. Tap red to fire, or move first.';
    } else {
      hint = `Tap a teal tile — up to ${T.move} spaces of movement.`;
    }
    this.el.unitHint.textContent = hint;
    this.el.unitMeters.hidden = false;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    this.el.hpBar.style.width = `${pct * 100}%`;
    this.el.hpBar.parentElement.classList.toggle('low', pct <= 0.3);
    this.el.hpValue.textContent = u.hp;
    this.el.statAtk.textContent = T.atk;
    this.el.statDef.textContent = T.def;
    this.el.statMove.textContent = T.move;
    this.el.statRange.textContent = T.range;
  }

  openCity(city) {
    if (!city) return;
    this.el.cityKicker.textContent = city.type === 'hq' ? 'HEADQUARTERS · DEPLOYMENT' : 'CITY · DEPLOYMENT';
    this.el.cityName.textContent = city.name;
    this.el.cityMeta.textContent = `Income ◈${city.income} · ${this.game.unitAt(city.x, city.y) ? 'Garrison present' : 'Garrison empty'}`;
    this.el.cityScrim.hidden = false;
    this.el.citySheet.hidden = false;
    this.renderBuildCards();
    this.sound.click();
  }

  renderBuildCards() {
    const g = this.game;
    const order = ['inf', 'tank', 'arty', 'scout'];
    this.el.buildGrid.innerHTML = order.map(k => {
      const T = UNIT_TYPES[k];
      const affordable = g.gold.player >= T.cost;
      return `<button class="build-card" data-type="${k}" ${affordable ? '' : 'disabled'}>
        <span class="build-tag">${T.category}</span>
        <div class="build-icon">${ICONS[k]}</div>
        <b>${T.name}</b>
        <p>${T.blurb}</p>
        <div class="build-price">${T.cost}</div>
      </button>`;
    }).join('');
    this.el.sheetGold.textContent = g.gold.player;
  }

  updateCity() {
    const city = this.game.buildCity;
    if (!city) return;
    this.el.sheetGold.textContent = this.game.gold.player;
    for (const card of this.el.buildGrid.querySelectorAll('.build-card')) {
      const T = UNIT_TYPES[card.dataset.type];
      card.disabled = this.game.gold.player < T.cost;
    }
  }

  closeCity() {
    this.el.citySheet.hidden = true;
    this.el.cityScrim.hidden = true;
  }

  openManual() {
    this.sound.click();
    this.el.manualScrim.hidden = false;
    this.el.manual.hidden = false;
  }

  closeManual() {
    this.el.manualScrim.hidden = true;
    this.el.manual.hidden = true;
  }

  toast(text, kind = '') {
    if (!text) return;
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    this.el.toastStack.appendChild(node);
    while (this.el.toastStack.children.length > 3) this.el.toastStack.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 320);
    }, 2500);
  }

  banner({ title, subtitle, side }) {
    const b = this.el.banner;
    b.hidden = false;
    b.classList.remove('show', 'enemy');
    if (side === 'enemy') b.classList.add('enemy');
    b.querySelector('span').style.display = '';
    b.querySelector('b').textContent = title;
    b.querySelector('small').textContent = subtitle || '';
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.classList.remove('show'); b.hidden = true; }, 1750);
    if (side === 'enemy') this.sound.enemyTurn();
    else this.sound.turn();
  }

  pulseMoney() {
    this.el.gold.classList.remove('pulse-money');
    void this.el.gold.offsetWidth;
    this.el.gold.classList.add('pulse-money');
  }

  gameOver(detail) {
    const { result, reason, turns, score, kills, lost, captures, units } = detail;
    const win = result === 'win';
    this.el.gameOver.hidden = false;
    this.el.gameOver.classList.toggle('lost', !win);
    this.el.gameOverKicker.textContent = win ? 'OPERATION COMPLETE' : 'OPERATION FAILED';
    this.el.gameOverTitle.textContent = win ? 'SECTOR SECURED' : 'SECTOR LOST';
    this.el.gameOverText.textContent = win
      ? `${reason || 'The enemy HQ is ours.'} The river valley is under your flag.`
      : `${reason || 'Your HQ has fallen.'} Regroup, refit and take the valley back.`;
    this.el.gameOverStats.innerHTML = `
      <span>Rounds <b>${turns}</b></span>
      <span>Captures <b>${captures}</b></span>
      <span>Kills <b>${kills}</b></span>
      <span>Units left <b>${units}</b></span>
      <span>Score <b>${score.toLocaleString()}</b></span>`;
    this.el.citySheet.hidden = true;
    this.el.cityScrim.hidden = true;
    this.el.manual.hidden = true;
    this.el.manualScrim.hidden = true;
    if (win) this.sound.victory();
    else this.sound.defeat();
  }

  newGame(detail) {
    this.el.gameOver.hidden = true;
    this.el.citySheet.hidden = true;
    this.el.cityScrim.hidden = true;
    this.el.manual.hidden = true;
    this.el.manualScrim.hidden = true;
    if (detail?.intro) this.el.intro.hidden = false;
    else this.el.intro.hidden = true;
    this.update();
  }
}
