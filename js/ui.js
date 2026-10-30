import {
  SIDES, UNIT_TYPES, UNIT_ORDER, $, clamp, pad2,
} from './config.js';
import { game, cityCount, unitsOf } from './world.js';

export const els = {
  hud: $('hud'),
  turnNum: $('turnNum'),
  sideName: $('sideName'),
  cityCount: $('cityCount'),
  funds: $('funds'),
  endTurn: $('endTurn'),
  tiltChip: $('tiltChip'),
  banner: $('banner'),
  bannerText: $('bannerText'),
  toast: $('toast'),
  dock: $('dock'),
  hintPanel: $('hintPanel'),
  hintTitle: $('hintTitle'),
  hintText: $('hintText'),
  unitPanel: $('unitPanel'),
  unitSide: $('unitSide'),
  unitName: $('unitName'),
  unitStatus: $('unitStatus'),
  unitHp: $('unitHp'),
  unitHpBar: $('unitHpBar'),
  unitAtk: $('unitAtk'),
  unitMove: $('unitMove'),
  unitRange: $('unitRange'),
  waitBtn: $('waitBtn'),
  deselectBtn: $('deselectBtn'),
  recruit: $('recruit'),
  recruitTitle: $('recruitTitle'),
  recruitFunds: $('recruitFunds'),
  recruitList: $('recruitList'),
  intro: $('intro'),
  result: $('result'),
  resultKicker: $('resultKicker'),
  resultTitle: $('resultTitle'),
  resultText: $('resultText'),
  resultStats: $('resultStats'),
  pause: $('pause'),
  soundBtn: $('soundBtn'),
  pauseTiltBtn: $('pauseTiltBtn'),
  tiltToggle: $('tiltToggle'),
  tiltToggleLabel: $('tiltToggleLabel'),
  tiltBtn: $('tiltBtn'),
  field: $('field'),
  minimap: $('minimap'),
  minimapWrap: $('minimapWrap'),
  recruitClose: $('closeRecruit'),
};

let bannerTimer = 0;
let toastTimer = 0;

export function showBanner(text, kind = '', duration = 1600) {
  els.bannerText.textContent = text;
  els.banner.className = `show ${kind}`.trim();
  clearTimeout(bannerTimer);
  if (duration > 0) {
    bannerTimer = setTimeout(() => { els.banner.className = ''; }, duration);
  }
}

export function toast(text, duration = 2200) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  els.toast.classList.remove('show');
}

export function updateHUD() {
  els.turnNum.textContent = pad2(game.turn);
  const side = SIDES[game.side];
  els.sideName.innerHTML = `<i class="side-dot"></i>${side.name}`;
  els.sideName.classList.toggle('enemy', game.side === 1);
  els.cityCount.textContent = cityCount(0);
  els.funds.textContent = game.funds[0];

  const canEnd = game.phase === 'player' && !game.busy && !game.over;
  els.endTurn.disabled = !canEnd;
  const label = els.endTurn.querySelector('.btn-end-label');
  if (game.phase === 'enemy') label.textContent = 'ENEMY TURN';
  else if (game.over) label.textContent = 'COMPLETE';
  else label.textContent = 'END TURN';

  const mine = unitsOf(0);
  const spent = mine.length > 0 && mine.every((u) => u.moved && u.attacked);
  els.endTurn.classList.toggle('attention', canEnd && spent);

  if (game.recruitCity) els.recruitFunds.textContent = game.funds[0];
}

export function updateHint() {
  if (game.recruitCity) return;
  let title = 'COMMAND AWAITING';
  let text = 'Tap a blue unit to issue orders.';

  if (game.phase === 'enemy') {
    title = 'COALITION COMMAND';
    text = 'Enemy forces are moving. Stand by.';
  } else if (game.over) {
    title = 'OPERATION COMPLETE';
    text = 'The field has been decided.';
  } else if (game.inspect) {
    const u = game.inspect;
    title = 'ENEMY CONTACT';
    text = `${UNIT_TYPES[u.type].name} · ${u.hp} HP · ${u.moved ? 'has moved' : 'stationary'}`;
  } else if (game.sel) {
    const u = game.sel;
    if (game.attackTargets.length) {
      const target = game.attackTargets[0];
      title = 'FIRE SOLUTION READY';
      text = `Tap a marked enemy to fire${target ? ` · ${UNIT_TYPES[target.type].name}` : ''}.`;
    } else if (!u.moved) {
      title = 'AWAITING ORDERS';
      text = 'Tap a highlighted tile to move. Drag to survey the field.';
    } else if (!u.attacked) {
      title = 'POSITION HELD';
      text = 'No targets in range. Tap WAIT to finish this unit.';
    } else {
      title = 'UNIT SPENT';
      text = 'This unit has acted. Select another or end the turn.';
    }
  } else if (game.phase === 'player' && unitsOf(0).length && unitsOf(0).every((u) => u.moved && u.attacked)) {
    title = 'ALL ORDERS SPENT';
    text = 'End the turn to let the coalition move.';
  }

  els.hintTitle.textContent = title;
  els.hintText.textContent = text;
}

export function updateUnitPanel() {
  const u = game.sel || game.inspect;
  if (!u || !game.units.includes(u)) {
    els.unitPanel.classList.add('hidden');
    els.hintPanel.classList.remove('hidden');
    return;
  }

  const def = UNIT_TYPES[u.type];
  const mine = u.side === 0;
  els.hintPanel.classList.add('hidden');
  els.unitPanel.classList.remove('hidden');
  els.unitSide.textContent = mine ? SIDES[0].name : SIDES[1].name;
  els.unitSide.classList.toggle('enemy', !mine);
  els.unitName.textContent = def.name;
  els.unitHp.textContent = `${Math.max(0, Math.round(u.hp))}`;
  els.unitAtk.textContent = def.atk;
  els.unitMove.textContent = u.moved ? '0' : def.move;
  els.unitRange.textContent = def.minRange === def.maxRange ? def.maxRange : `${def.minRange}–${def.maxRange}`;

  const ratio = clamp(u.hp / u.maxHp, 0, 1);
  els.unitHpBar.style.width = `${ratio * 100}%`;
  els.unitHpBar.style.background = ratio > 0.6 ? '#66e3a3' : ratio > 0.3 ? '#ffc857' : '#ff5f4a';

  els.waitBtn.classList.toggle('hidden', !mine);
  els.deselectBtn.textContent = mine ? 'CLOSE' : 'CLEAR';

  let status = 'READY';
  let cls = '';
  if (!mine) {
    status = 'ENEMY';
    cls = 'spent';
  } else if (game.attackTargets.length && !u.attacked) {
    status = 'TARGETS';
    cls = 'danger';
  } else if (u.moved && u.attacked) {
    status = 'SPENT';
    cls = 'spent';
  } else if (u.moved) {
    status = 'MOVED';
    cls = 'spent';
  } else if (u.attacked) {
    status = 'FIRED';
    cls = 'spent';
  }
  els.unitStatus.textContent = status;
  els.unitStatus.className = `unit-status ${cls}`.trim();
  els.waitBtn.disabled = !mine || (u.moved && u.attacked);
  els.waitBtn.textContent = u.moved && u.attacked ? 'SPENT' : 'WAIT';
}

export function updateAll() {
  updateHUD();
  updateHint();
  updateUnitPanel();
  if (game.recruitCity) renderRecruit();
}

/* ------------------------------------------------------------------ */
/*  Reinforcement sheet                                                */
/* ------------------------------------------------------------------ */

export function renderRecruit() {
  const city = game.recruitCity;
  if (!city) return;
  els.recruitTitle.textContent = city.name;
  els.recruitFunds.textContent = game.funds[0];
  els.recruitList.innerHTML = UNIT_ORDER.map((key) => {
    const d = UNIT_TYPES[key];
    const disabled = game.funds[0] < d.cost;
    const range = d.minRange === d.maxRange ? d.maxRange : `${d.minRange}–${d.maxRange}`;
    return `<button class="recruit-card" data-type="${key}" type="button" ${disabled ? 'disabled' : ''}>
      <div class="rc-top">
        <span class="rc-glyph">${d.short}</span>
        <span class="rc-name">${d.name.toUpperCase()}</span>
        <span class="rc-cost">◈${d.cost}</span>
      </div>
      <div class="rc-stats">
        <span>HP <b>${d.hp}</b></span><span>ATK <b>${d.atk}</b></span><span>MV <b>${d.move}</b></span><span>RG <b>${range}</b></span>
      </div>
      <div class="rc-desc">${d.desc}</div>
    </button>`;
  }).join('');
}

export function openRecruit(city) {
  game.recruitCity = city;
  renderRecruit();
  els.recruit.classList.remove('hidden');
  els.dock.classList.add('hidden');
  updateUnitPanel();
}

export function closeRecruit() {
  game.recruitCity = null;
  els.recruit.classList.add('hidden');
  els.dock.classList.remove('hidden');
  updateAll();
}

/* ------------------------------------------------------------------ */
/*  Overlays                                                           */
/* ------------------------------------------------------------------ */

export function showResult(winner) {
  document.body.classList.add('modal-open');
  const win = winner === 0;
  els.resultKicker.innerHTML = `<span class="kicker-line"></span>${win ? 'OPERATION COMPLETE' : 'FIELD LOST'}<span class="kicker-line"></span>`;
  els.resultTitle.textContent = win ? 'VICTORY' : 'DEFEAT';
  els.resultTitle.classList.toggle('defeat', !win);
  els.resultText.textContent = win
    ? 'The coalition command post is flying alliance colours. The field is yours.'
    : 'The alliance command post has fallen. The coalition holds the field.';
  els.resultStats.innerHTML = `
    <div class="rs"><b>${pad2(game.turn)}</b><span>TURNS</span></div>
    <div class="rs"><b>${cityCount(0)}</b><span>CITIES</span></div>
    <div class="rs"><b>${unitsOf(0).length}</b><span>UNITS</span></div>`;
  els.result.classList.remove('hidden');
}

export function hideResult() {
  els.result.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

export function showPause() {
  document.body.classList.add('modal-open');
  els.pause.classList.remove('hidden');
}

export function hidePause() {
  els.pause.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

export function setTiltUI(enabled) {
  els.tiltChip.hidden = !enabled;
  els.tiltBtn.classList.toggle('active', enabled);
  els.tiltToggle.classList.toggle('active', enabled);
  els.tiltToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  els.tiltToggleLabel.textContent = `TILT CONTROLS · ${enabled ? 'ON' : 'OFF'}`;
  els.pauseTiltBtn.textContent = `TILT · ${enabled ? 'ON' : 'OFF'}`;
  els.pauseTiltBtn.classList.toggle('active', enabled);
}

export function setSoundUI(muted) {
  els.soundBtn.textContent = `SOUND · ${muted ? 'OFF' : 'ON'}`;
}
