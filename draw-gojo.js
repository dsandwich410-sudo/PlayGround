import { TAU, clamp, glow, rgba, roundRectPath, smoothClosed } from './draw-utils.js';

const DESIGN_HEIGHT = 420;
export const GOJO_HAND = { x: 96, y: -378 };
export const GOJO_HEAD = { x: 0, y: -322 };

function limb(ctx, points, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function torsoPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-51, -279);
  ctx.bezierCurveTo(-76, -271, -90, -260, -93, -238);
  ctx.lineTo(-67, -151);
  ctx.bezierCurveTo(-58, -130, -28, -122, 0, -122);
  ctx.bezierCurveTo(28, -122, 58, -130, 67, -151);
  ctx.lineTo(93, -238);
  ctx.bezierCurveTo(90, -260, 76, -271, 51, -279);
  ctx.bezierCurveTo(36, -267, 18, -263, 0, -263);
  ctx.bezierCurveTo(-18, -263, -36, -267, -51, -279);
  ctx.closePath();
}

function drawHair(ctx, time, domain) {
  const sway = Math.sin(time * 1.55) * 2.4 + Math.sin(time * 0.63) * 1.2;
  const lift = domain ? 5 : 0;
  ctx.save();
  ctx.translate(sway * 0.55, -lift);

  const g = ctx.createLinearGradient(-55, -425, 60, -290);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.48, '#f2f7ff');
  g.addColorStop(0.78, '#d4e0f2');
  g.addColorStop(1, '#aebfd8');

  ctx.beginPath();
  ctx.moveTo(-57, -286);
  ctx.lineTo(-68, -314);
  ctx.lineTo(-63, -342);
  ctx.lineTo(-77, -345);
  ctx.lineTo(-61, -363);
  ctx.lineTo(-74, -378);
  ctx.lineTo(-53, -377);
  ctx.lineTo(-58, -403);
  ctx.lineTo(-39, -389);
  ctx.lineTo(-34, -417);
  ctx.lineTo(-19, -395);
  ctx.lineTo(-8, -429);
  ctx.lineTo(1, -400);
  ctx.lineTo(15, -421);
  ctx.lineTo(22, -393);
  ctx.lineTo(41, -410);
  ctx.lineTo(39, -382);
  ctx.lineTo(57, -392);
  ctx.lineTo(47, -364);
  ctx.lineTo(67, -356);
  ctx.lineTo(50, -340);
  ctx.lineTo(59, -318);
  ctx.lineTo(43, -309);
  ctx.lineTo(48, -288);
  ctx.quadraticCurveTo(0, -268, -57, -286);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // soft shadow inside the silhouette
  const sh = ctx.createLinearGradient(0, -400, 0, -292);
  sh.addColorStop(0, 'rgba(130,155,195,0.0)');
  sh.addColorStop(1, 'rgba(86,108,150,0.42)');
  ctx.fillStyle = sh;
  ctx.fill();

  // strand lines
  ctx.strokeStyle = 'rgba(120,145,185,0.36)';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  const strands = [
    [[-36, -360], [-46, -386], [-39, -404]],
    [[-9, -374], [-15, -399], [-8, -414]],
    [[16, -368], [12, -390], [19, -406]],
    [[35, -350], [40, -372], [46, -383]],
  ];
  for (const s of strands) {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    ctx.quadraticCurveTo(s[1][0], s[1][1], s[2][0], s[2][1]);
    ctx.stroke();
  }

  // fringe
  ctx.fillStyle = 'rgba(248,252,255,0.97)';
  ctx.beginPath();
  ctx.moveTo(-42, -367);
  ctx.quadraticCurveTo(-32, -362, -27, -331);
  ctx.quadraticCurveTo(-24, -350, -16, -364);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4, -370);
  ctx.quadraticCurveTo(4, -362, 2, -336);
  ctx.quadraticCurveTo(12, -356, 18, -367);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(26, -366);
  ctx.quadraticCurveTo(34, -358, 32, -334);
  ctx.quadraticCurveTo(40, -350, 45, -362);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawEyes(ctx, time) {
  const pulse = 0.72 + Math.sin(time * 4) * 0.14;
  for (const sx of [-1, 1]) {
    const ex = sx * 15.5;
    const ey = -321;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, ex, ey, 20, '#7df9ff', 0.34 * pulse, 0);
    ctx.restore();

    // almond eye white, slightly angled toward the centre
    ctx.fillStyle = '#f6fdff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 9.4, 5.7, sx * 0.06, 0, TAU);
    ctx.fill();

    const iris = ctx.createRadialGradient(ex, ey - 0.6, 0, ex, ey, 5.6);
    iris.addColorStop(0, '#ffffff');
    iris.addColorStop(0.24, '#c6fdff');
    iris.addColorStop(0.58, '#49c4ff');
    iris.addColorStop(1, '#0b3a7d');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, ey, 5.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#03101f';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 1.5, 3.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.arc(ex - 1.4, ey - 2.1, 1.05, 0, TAU);
    ctx.fill();

    // upper lid + lash line gives the eye a sharper, less cartoonish shape
    ctx.strokeStyle = 'rgba(18,22,36,0.92)';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.4, 9.8, 6.1, sx * 0.06, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(18,22,36,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex + sx * 8.2, ey - 0.8);
    ctx.lineTo(ex + sx * 11.2, ey - 2.3);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,150,190,0.32)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.8, 9.2, 5.7, sx * 0.06, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
  }
}

function drawFace(ctx, time, domain) {
  // ears
  ctx.fillStyle = '#e3bfae';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 39, -320, 7, 12, sx * 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130,80,75,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sx * 40, -320, 4.6, Math.PI * 0.2, Math.PI * 1.4);
    ctx.stroke();
  }

  const skin = ctx.createLinearGradient(-36, -360, 34, -270);
  skin.addColorStop(0, '#fbe5d5');
  skin.addColorStop(0.56, '#f0cdbb');
  skin.addColorStop(1, '#d8a893');

  ctx.beginPath();
  ctx.moveTo(-39, -331);
  ctx.bezierCurveTo(-40, -294, -29, -271, 0, -270);
  ctx.bezierCurveTo(29, -271, 40, -294, 39, -331);
  ctx.bezierCurveTo(39, -352, 25, -366, 0, -366);
  ctx.bezierCurveTo(-25, -366, -39, -352, -39, -331);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();

  // cheek / jaw shading
  ctx.fillStyle = 'rgba(177,106,94,0.14)';
  ctx.beginPath();
  ctx.ellipse(0, -279, 21, 9, 0, 0, TAU);
  ctx.fill();

  // nose
  ctx.strokeStyle = 'rgba(128,74,70,0.4)';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3, -312);
  ctx.quadraticCurveTo(6, -302, -1, -300);
  ctx.stroke();

  // mouth, a small confident smirk
  ctx.strokeStyle = 'rgba(92,45,52,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -288);
  ctx.quadraticCurveTo(0, -281, 17, -290);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -287);
  ctx.quadraticCurveTo(0, -283, 12, -288);
  ctx.stroke();

  if (domain) {
    drawEyes(ctx, time);
    // lowered blindfold wrapped around the neck
    const cloth = ctx.createLinearGradient(0, -281, 0, -256);
    cloth.addColorStop(0, '#20202e');
    cloth.addColorStop(0.35, '#0b0b14');
    cloth.addColorStop(1, '#05050b');
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-38, -281);
    ctx.quadraticCurveTo(0, -272, 38, -281);
    ctx.lineTo(37, -266);
    ctx.quadraticCurveTo(0, -257, -37, -266);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(165,195,235,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-34, -277);
    ctx.quadraticCurveTo(0, -269, 34, -277);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(125,249,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(-30, -264);
    ctx.quadraticCurveTo(0, -258, 30, -264);
    ctx.stroke();

    // hanging band tail
    ctx.fillStyle = '#090910';
    ctx.beginPath();
    ctx.moveTo(33, -272);
    ctx.quadraticCurveTo(48, -266, 47, -247);
    ctx.quadraticCurveTo(40, -256, 31, -262);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(165,195,235,0.2)';
    ctx.beginPath();
    ctx.moveTo(36, -269);
    ctx.quadraticCurveTo(45, -261, 44, -252);
    ctx.stroke();
  } else {
    // blindfold band
    const band = ctx.createLinearGradient(0, -339, 0, -310);
    band.addColorStop(0, '#161a25');
    band.addColorStop(0.32, '#090a10');
    band.addColorStop(0.8, '#040409');
    band.addColorStop(1, '#11131b');
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(-42, -337);
    ctx.quadraticCurveTo(0, -344, 42, -336);
    ctx.lineTo(43, -316);
    ctx.quadraticCurveTo(0, -324, -42, -315);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(116,134,168,0.4)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-38, -335);
    ctx.quadraticCurveTo(0, -341, 38, -334);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(-35, -318);
    ctx.quadraticCurveTo(0, -325, 36, -319);
    ctx.stroke();

    // folded band tails to the right
    ctx.fillStyle = '#07070d';
    ctx.beginPath();
    ctx.moveTo(41, -330);
    ctx.quadraticCurveTo(57, -326, 59, -310);
    ctx.quadraticCurveTo(48, -313, 43, -319);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(42, -323);
    ctx.quadraticCurveTo(54, -316, 52, -302);
    ctx.quadraticCurveTo(44, -308, 40, -316);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCollar(ctx) {
  const col = ctx.createLinearGradient(-50, -306, 48, -250);
  col.addColorStop(0, '#152239');
  col.addColorStop(0.55, '#0b1424');
  col.addColorStop(1, '#060a12');
  ctx.fillStyle = col;

  ctx.beginPath();
  ctx.moveTo(-58, -262);
  ctx.lineTo(-48, -302);
  ctx.lineTo(-25, -295);
  ctx.lineTo(-17, -264);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(58, -262);
  ctx.lineTo(48, -302);
  ctx.lineTo(25, -295);
  ctx.lineTo(17, -264);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(125,249,255,0.26)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-48, -301);
  ctx.lineTo(-26, -294);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,61,154,0.2)';
  ctx.beginPath();
  ctx.moveTo(48, -301);
  ctx.lineTo(26, -294);
  ctx.stroke();
}

function drawArm(ctx, time, domain, attack) {
  const dx = attack * 2;
  const dy = -attack * 3;

  // left arm, hand tucked into the hip pocket
  limb(ctx, [[-76, -248], [-98, -208], [-87, -172]], 31, '#1b2d4a');
  ctx.strokeStyle = 'rgba(158,207,255,0.3)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-80, -242);
  ctx.quadraticCurveTo(-98, -206, -90, -177);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(4,8,15,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-70, -240);
  ctx.quadraticCurveTo(-86, -207, -79, -181);
  ctx.stroke();

  // cuff
  ctx.save();
  ctx.translate(-85, -172);
  ctx.rotate(0.3);
  ctx.fillStyle = '#070b13';
  roundRectPath(ctx, -14, -7.5, 28, 16, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,249,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -5.5);
  ctx.lineTo(12, -5);
  ctx.stroke();
  ctx.restore();

  // wrist and hand disappear into the jacket pocket
  ctx.strokeStyle = '#e9c7b4';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-79, -170);
  ctx.lineTo(-70, -165);
  ctx.stroke();
  ctx.fillStyle = '#edcdba';
  ctx.beginPath();
  ctx.ellipse(-68, -165, 9.5, 11, -0.38, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,88,84,0.24)';
  ctx.beginPath();
  ctx.ellipse(-65, -162, 5.5, 7, -0.38, 0, TAU);
  ctx.fill();

  // pocket flap over the hand anchors it to the body
  ctx.fillStyle = '#0a1422';
  ctx.beginPath();
  ctx.moveTo(-85, -165);
  ctx.lineTo(-64, -169);
  ctx.lineTo(-55, -151);
  ctx.lineTo(-78, -145);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(132,180,232,0.26)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-82, -162);
  ctx.lineTo(-66, -165);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125,249,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(-76, -147);
  ctx.lineTo(-58, -150);
  ctx.stroke();

  // raised right arm
  limb(ctx, [[78, -247], [108, -296], [98, -345]], 27, '#182943');
  ctx.strokeStyle = 'rgba(125,249,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(86, -252);
  ctx.quadraticCurveTo(108, -298, 103, -334);
  ctx.stroke();

  ctx.fillStyle = '#070a12';
  roundRectPath(ctx, 86, -352, 25, 13, 5);
  ctx.fill();

  // palm
  const handX = 96 + dx;
  const handY = -360 + dy;
  ctx.fillStyle = '#f2d2bf';
  ctx.beginPath();
  ctx.ellipse(handX, handY, 12, 15, -0.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(178,112,102,0.22)';
  ctx.beginPath();
  ctx.ellipse(handX + 3, handY + 3, 7, 10, -0.25, 0, TAU);
  ctx.fill();

  // two extended fingers
  const fingerG = ctx.createLinearGradient(handX, handY - 10, handX + 14, handY - 40);
  fingerG.addColorStop(0, '#f7dccd');
  fingerG.addColorStop(1, '#e9c0ac');
  ctx.fillStyle = fingerG;
  for (let i = 0; i < 2; i++) {
    const fx = handX + 2 - i * 7;
    const fy = handY - 6 - i * 1.5;
    roundRectPath(ctx, fx - 3.4, fy - 34, 6.8, 34, 3.4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,95,88,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx + 1.4, fy - 29);
    ctx.lineTo(fx + 1.4, fy - 8);
    ctx.stroke();
  }

  // folded thumb
  ctx.fillStyle = '#edc8b5';
  ctx.beginPath();
  ctx.ellipse(handX + 9, handY - 4, 5, 8, 0.6, 0, TAU);
  ctx.fill();

  // cursed energy collar ring around the raised hand
  const pulse = 0.5 + Math.sin(time * 3.2) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, handX, handY - 22, 34 + pulse * 6, '#7df9ff', domain ? 0.34 : 0.2, 0);
  for (let i = 0; i < 3; i++) {
    const rad = 20 + i * 6 + pulse * 2;
    const start = time * (0.8 + i * 0.35) + i * 2.1;
    ctx.strokeStyle = rgba(i === 1 ? '#b7a6ff' : '#7df9ff', 0.42 - i * 0.09);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(handX, handY - 24, rad, start, start + 2.4);
    ctx.stroke();
  }
  ctx.restore();

  if (domain) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, handX, handY - 24, 52, '#e8fbff', 0.3, 0);
    ctx.restore();
  }
}

export function drawGojo(ctx, g, opts) {
  const time = opts.time;
  const domain = !!opts.domain;
  const attack = clamp(opts.attack || 0, 0, 1);
  const intro = !!opts.intro;
  const s = g.height / DESIGN_HEIGHT;
  const bob = Math.sin(time * 1.5) * 2.4 + (intro ? Math.sin(time * 0.7) * 3 : 0);
  const pulse = 0.5 + Math.sin(time * 2.1) * 0.5;

  ctx.save();
  ctx.translate(g.x, g.y + bob);
  ctx.scale(s, s);
  if (attack) {
    ctx.translate(attack * 5, -attack * 3);
    ctx.rotate(-0.016 * attack);
  }

  // floor shadow and cursed energy circle
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, -4, 88, 16, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#7df9ff', 0.18 + pulse * 0.08);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -4, 92 + pulse * 6, 18 + pulse * 2, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#b07bff', 0.12);
  ctx.beginPath();
  ctx.ellipse(0, -4, 70, 13, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(-10, -235, 20, -10, -235, 225);
  aura.addColorStop(0, rgba(domain ? '#bfefff' : '#66d8ff', domain ? 0.18 : 0.1));
  aura.addColorStop(0.45, rgba('#7a5bff', 0.08));
  aura.addColorStop(1, rgba('#7a5bff', 0));
  ctx.fillStyle = aura;
  ctx.fillRect(-240, -440, 480, 460);

  for (let i = 0; i < 2; i++) {
    const a = time * 0.5 + i * 2.4;
    ctx.strokeStyle = rgba(i ? '#b07bff' : '#7df9ff', 0.07 + pulse * 0.03);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, -258);
    ctx.bezierCurveTo(
      -130 + Math.sin(a) * 24, -330,
      -40 + Math.cos(a) * 18, -430,
      64 + Math.sin(a * 1.3) * 30, -350,
    );
    ctx.stroke();
  }

  for (let i = 0; i < 9; i++) {
    const a = time * (0.35 + i * 0.020) + i * 1.8;
    const rad = 100 + (i % 3) * 36;
    const px = Math.cos(a) * rad;
    const py = -230 + Math.sin(a * 1.25) * 135;
    const size = 1.2 + (i % 2) * 1.1;
    ctx.fillStyle = rgba(i % 3 === 0 ? '#ffb3e6' : '#a9fbff', 0.25 + pulse * 0.2);
    ctx.beginPath();
    ctx.arc(px, py, size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // legs
  ctx.fillStyle = '#070b14';
  ctx.beginPath();
  ctx.moveTo(-44, -138);
  ctx.quadraticCurveTo(-54, -74, -50, -8);
  ctx.quadraticCurveTo(-34, -1, -20, -8);
  ctx.quadraticCurveTo(-22, -74, -14, -132);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(18, -132);
  ctx.quadraticCurveTo(26, -74, 30, -8);
  ctx.quadraticCurveTo(46, -1, 56, -9);
  ctx.quadraticCurveTo(52, -76, 44, -138);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(92,125,170,0.2)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-39, -120);
  ctx.quadraticCurveTo(-45, -66, -42, -14);
  ctx.moveTo(31, -120);
  ctx.quadraticCurveTo(36, -64, 40, -14);
  ctx.stroke();

  // boots
  ctx.fillStyle = '#04060b';
  roundRectPath(ctx, -57, -15, 40, 16, 7);
  ctx.fill();
  roundRectPath(ctx, 22, -15, 42, 16, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,249,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-55, -7);
  ctx.lineTo(-20, -8);
  ctx.moveTo(24, -7);
  ctx.lineTo(61, -8);
  ctx.stroke();

  // torso
  const jacket = ctx.createLinearGradient(-92, -275, 82, -130);
  jacket.addColorStop(0, '#2a4265');
  jacket.addColorStop(0.32, '#16253d');
  jacket.addColorStop(0.72, '#0b1424');
  jacket.addColorStop(1, '#070c16');
  torsoPath(ctx);
  ctx.fillStyle = jacket;
  ctx.fill();

  // sculpted jacket lighting: chest sheen, side falloff and fabric folds
  ctx.save();
  torsoPath(ctx);
  ctx.clip();

  const sheen = ctx.createRadialGradient(-38, -247, 4, -34, -232, 118);
  sheen.addColorStop(0, 'rgba(108,158,220,0.34)');
  sheen.addColorStop(0.55, 'rgba(64,104,160,0.11)');
  sheen.addColorStop(1, 'rgba(20,36,62,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-100, -290, 210, 180);

  const sideShade = ctx.createLinearGradient(6, -280, 82, -150);
  sideShade.addColorStop(0, 'rgba(2,5,12,0)');
  sideShade.addColorStop(1, 'rgba(1,3,8,0.62)');
  ctx.fillStyle = sideShade;
  ctx.fillRect(-20, -286, 116, 168);

  // shoulder panels
  ctx.fillStyle = 'rgba(76,120,174,0.16)';
  ctx.beginPath();
  ctx.moveTo(-58, -270);
  ctx.lineTo(-80, -252);
  ctx.lineTo(-68, -218);
  ctx.lineTo(-45, -232);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(55, -271);
  ctx.lineTo(80, -254);
  ctx.lineTo(72, -222);
  ctx.lineTo(48, -234);
  ctx.closePath();
  ctx.fill();

  // fabric folds
  ctx.strokeStyle = 'rgba(104,150,205,0.19)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-27, -252);
  ctx.quadraticCurveTo(-37, -218, -29, -186);
  ctx.moveTo(31, -248);
  ctx.quadraticCurveTo(43, -212, 36, -178);
  ctx.moveTo(-55, -172);
  ctx.quadraticCurveTo(-38, -166, -20, -170);
  ctx.moveTo(53, -170);
  ctx.quadraticCurveTo(36, -162, 20, -166);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(1,3,8,0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-45, -246);
  ctx.quadraticCurveTo(-53, -212, -47, -178);
  ctx.moveTo(46, -243);
  ctx.quadraticCurveTo(55, -208, 50, -174);
  ctx.stroke();

  ctx.restore();

  // jacket shading + seams
  ctx.strokeStyle = 'rgba(142,190,240,0.28)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-72, -252);
  ctx.quadraticCurveTo(-58, -198, -48, -148);
  ctx.moveTo(72, -252);
  ctx.quadraticCurveTo(56, -198, 46, -148);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(130,175,225,0.34)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -258);
  ctx.lineTo(0, -134);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(18,28,44,0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-50, -142);
  ctx.quadraticCurveTo(0, -133, 50, -142);
  ctx.stroke();
  ctx.fillStyle = 'rgba(125,249,255,0.45)';
  roundRectPath(ctx, -7, -146, 14, 8, 2);
  ctx.fill();

  // chest pocket detail
  ctx.strokeStyle = 'rgba(125,249,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-54, -206);
  ctx.lineTo(-26, -202);
  ctx.lineTo(-28, -180);
  ctx.stroke();

  // collar + neck
  drawCollar(ctx);
  ctx.fillStyle = '#e9c7b4';
  roundRectPath(ctx, -17, -282, 34, 34, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(135,80,78,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, -259, 17, 8, 0, 0, TAU);
  ctx.fill();

  // back hair, face
  ctx.save();
  ctx.translate(Math.sin(time * 1.55) * 1.3, 0);
  drawHair(ctx, time, domain);
  ctx.restore();
  drawFace(ctx, time, domain);

  // small front collar folds
  ctx.fillStyle = '#0a1220';
  ctx.beginPath();
  ctx.moveTo(-30, -263);
  ctx.lineTo(-8, -252);
  ctx.lineTo(-2, -232);
  ctx.lineTo(-22, -248);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, -263);
  ctx.lineTo(8, -252);
  ctx.lineTo(2, -232);
  ctx.lineTo(22, -248);
  ctx.closePath();
  ctx.fill();

  drawArm(ctx, time, domain, attack);

  // rim light
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#7df9ff', 0.26);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-57, -286);
  ctx.quadraticCurveTo(-92, -266, -90, -238);
  ctx.quadraticCurveTo(-79, -190, -66, -152);
  ctx.stroke();

  ctx.strokeStyle = rgba('#ff3d9a', 0.17);
  ctx.beginPath();
  ctx.moveTo(49, -288);
  ctx.quadraticCurveTo(91, -266, 90, -238);
  ctx.quadraticCurveTo(71, -180, 65, -152);
  ctx.stroke();

  if (attack > 0.02) {
    ctx.strokeStyle = rgba('#a9fbff', 0.2 + attack * 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(78, -246);
    ctx.quadraticCurveTo(108, -296, 96, -354);
    ctx.stroke();
    glow(ctx, 96, -356, 30 + attack * 14, '#7df9ff', 0.2 + attack * 0.3, 0);
  }
  ctx.restore();

  ctx.restore();
}

export { DESIGN_HEIGHT as GOJO_DESIGN_HEIGHT };
