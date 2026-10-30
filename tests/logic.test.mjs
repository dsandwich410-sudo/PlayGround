import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The browser build ships plain .js ES modules (no package.json / bundler).
// Node would treat .js as CommonJS, so evaluate the same source as a data module.
const source = readFileSync(new URL('../logic.js', import.meta.url), 'utf8');
const logic = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const {
  CFG,
  UPGRADES,
  freshSave,
  sanitizeSave,
  curseMaxHp,
  curseInfo,
  killReward,
  upgradeCost,
  tapDamage,
  autoDps,
  critChance,
  critMultiplier,
  comboMultiplier,
  blackFlashChance,
  formatNumber,
  domainReady,
} = logic;

test('number formatting stays compact and readable', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(9.4), '9.4');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1500), '1.5K');
  assert.equal(formatNumber(12500), '12.5K');
  assert.equal(formatNumber(999999), '1M');
  assert.equal(formatNumber(4_200_000_000), '4.2B');
  assert.equal(formatNumber(1e30), '1No');
});

test('curse difficulty scales monotonically', () => {
  let previous = 0;
  for (let level = 1; level <= 80; level++) {
    const hp = curseMaxHp(level);
    assert.ok(hp > previous, `HP should grow at level ${level}`);
    previous = hp;
  }
  assert.ok(killReward(10) > killReward(5));
  assert.equal(curseInfo(1).grade, 'GRADE 4');
  assert.equal(curseInfo(60).grade, 'SPECIAL');
  assert.equal(curseInfo(5).boss, true);
  assert.equal(curseInfo(6).boss, false);
});

test('upgrade costs and effects rise with level', () => {
  for (const def of UPGRADES) {
    assert.ok(upgradeCost(def.id, 1) > upgradeCost(def.id, 0));
    assert.ok(upgradeCost(def.id, 10) > upgradeCost(def.id, 9));
  }
  assert.ok(tapDamage({ power: 5 }) > tapDamage({ power: 4 }));
  assert.ok(autoDps({ power: 3, flow: 4 }) > autoDps({ power: 3, flow: 3 }));
  assert.ok(critChance({ focus: 10 }) <= 0.65);
  assert.ok(critMultiplier({ focus: 4 }) > critMultiplier({ focus: 0 }));
});

test('combo, black flash and domain respect caps', () => {
  assert.equal(comboMultiplier(0, { chain: 0 }), 1);
  assert.ok(comboMultiplier(40, { chain: 4 }) > comboMultiplier(40, { chain: 0 }));
  assert.equal(comboMultiplier(1000, { chain: 15 }), comboMultiplier(CFG.comboCap, { chain: 15 }));
  assert.ok(blackFlashChance(30) > blackFlashChance(0));
  assert.ok(blackFlashChance(9999) <= CFG.blackFlashMax);
  assert.equal(domainReady(99.9), false);
  assert.equal(domainReady(100), true);
});

test('saved games are sanitized and clamped', () => {
  const fresh = freshSave();
  assert.equal(fresh.level, 1);
  assert.equal(fresh.upgrades.power, 0);

  const cleaned = sanitizeSave(
    {
      level: 12,
      hp: 999999999,
      energy: -50,
      exorcised: 7.8,
      bestCombo: '30',
      upgrades: { power: 9999, focus: -4, flow: 3, chain: 2 },
      sound: false,
      tiltPreferred: true,
      domainCharge: 250,
    },
    freshSave,
  );
  assert.equal(cleaned.level, 12);
  assert.equal(cleaned.hp, curseMaxHp(12));
  assert.equal(cleaned.energy, 0);
  assert.equal(cleaned.exorcised, 7);
  assert.equal(cleaned.upgrades.power, 80);
  assert.equal(cleaned.upgrades.focus, 0);
  assert.equal(cleaned.upgrades.flow, 3);
  assert.equal(cleaned.sound, false);
  assert.equal(cleaned.tiltPreferred, true);
  assert.equal(cleaned.domainCharge, 100);

  const garbage = sanitizeSave('not-a-save', freshSave);
  assert.equal(garbage.level, 1);
  assert.equal(garbage.hp, curseMaxHp(1));
});

test('a 30 second tap simulation makes progress', () => {
  const save = freshSave();
  let hp = curseMaxHp(1);
  let level = 1;
  let energy = 0;
  let taps = 0;
  for (let i = 0; i < 96; i++) {
    energy += tapDamage(save.upgrades) * CFG.energyPerDamage;
    hp -= tapDamage(save.upgrades);
    taps++;
    if (hp <= 0) {
      energy += killReward(level);
      level++;
      hp = curseMaxHp(level);
    }
    if (energy >= upgradeCost('power', save.upgrades.power)) {
      energy -= upgradeCost('power', save.upgrades.power);
      save.upgrades.power++;
    }
  }
  assert.ok(taps > 0);
  assert.ok(level >= 5, `expected several exorcisms, got ${level}`);
  assert.ok(save.upgrades.power >= 2, 'should afford early upgrades');
});
