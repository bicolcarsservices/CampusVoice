import Phaser from 'phaser';

// Draws the scenery textures in code (trees, crates, tower, mountains).
export function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const tex = (k: string, w: number, h: number) => { g.generateTexture(k, w, h); g.clear(); };

  g.fillStyle(0x5a3d26); g.fillRect(40, 120, 12, 30);
  g.fillStyle(0x2f6b47); g.fillTriangle(46, 62, 4, 128, 88, 128);
  g.fillStyle(0x357a50); g.fillTriangle(46, 32, 10, 98, 82, 98);
  g.fillStyle(0x3c8a58); g.fillTriangle(46, 4, 18, 68, 74, 68);
  g.fillStyle(0xffffff);
  g.fillTriangle(46, 4, 36, 28, 56, 28); g.fillTriangle(46, 32, 30, 62, 62, 62); g.fillTriangle(46, 62, 20, 98, 72, 98);
  tex('pine', 92, 150);

  g.fillStyle(0x8a6a3c);
  for (let i = 0; i < 12; i++) g.fillRect(62 + Math.sin(i / 3) * 4 - i * 0.6, 214 - i * 15, 12 - i * 0.4, 18);
  g.fillStyle(0x3f9b3a);
  const fronds: number[][] = [[58,40,10,60,30,20],[62,40,0,30,20,56],[62,40,60,0,80,30],[66,40,120,10,102,50],[66,40,130,50,110,70],[62,40,40,70,60,70],[66,40,88,70,70,64]];
  fronds.forEach(([a, b, c, d, e, f]) => g.fillTriangle(a, b, c, d, e, f));
  g.fillStyle(0x2e7d32); g.fillTriangle(62, 40, 20, 14, 40, 46); g.fillTriangle(66, 40, 110, 14, 92, 46);
  tex('palm', 130, 222);

  g.fillStyle(0xb07a3a); g.fillRect(0, 0, 48, 48);
  g.lineStyle(4, 0x6e4a1f); g.strokeRect(2, 2, 44, 44);
  g.lineStyle(3, 0x6e4a1f); g.lineBetween(4, 4, 44, 44); g.lineBetween(44, 4, 4, 44);
  g.fillStyle(0xffffff); g.fillRect(0, 0, 48, 5);
  tex('crate', 48, 48);

  g.fillStyle(0x6d7378); g.fillRect(0, 0, 48, 48);
  g.fillStyle(0x565c61); g.fillRect(5, 5, 17, 17); g.fillRect(26, 5, 17, 17); g.fillRect(5, 26, 17, 17); g.fillRect(26, 26, 17, 17);
  g.fillStyle(0xffffff); g.fillRect(0, 0, 48, 6);
  tex('stone', 48, 48);

  // green pine (no snow)
  g.fillStyle(0x5a3d26); g.fillRect(40, 120, 12, 30);
  g.fillStyle(0x24603a); g.fillTriangle(46, 62, 4, 128, 88, 128);
  g.fillStyle(0x2d7144); g.fillTriangle(46, 32, 10, 98, 82, 98);
  g.fillStyle(0x378450); g.fillTriangle(46, 4, 18, 68, 74, 68);
  tex('pineG', 92, 150);

  // cactus
  g.fillStyle(0x3f8f4a); g.fillRoundedRect(16, 8, 14, 82, 7);
  g.fillRoundedRect(0, 34, 10, 30, 5); g.fillRect(0, 56, 18, 9);
  g.fillRoundedRect(34, 22, 10, 30, 5); g.fillRect(28, 44, 14, 9);
  g.fillStyle(0x2c6b36); g.fillRect(22, 10, 3, 78);
  tex('cactus', 46, 92);

  // broken concrete wall for the city map
  g.fillStyle(0x7b8490); g.fillRect(8, 30, 60, 90); g.fillTriangle(8, 30, 36, 6, 68, 30);
  g.fillStyle(0x59616c); g.fillRect(20, 50, 14, 20); g.fillRect(44, 80, 14, 20); g.fillRect(8, 112, 60, 8);
  g.fillStyle(0x7b8490); g.fillRect(70, 70, 24, 50); g.fillTriangle(70, 70, 82, 56, 94, 70);
  tex('ruin', 96, 122);

  // bullet tracer, rocket, spark
  g.fillStyle(0xffb300); g.fillRect(0, 0, 14, 4); g.fillStyle(0xffffff); g.fillRect(4, 1, 10, 2);
  tex('bullet', 14, 4);
  g.fillStyle(0x8d99a6); g.fillRect(4, 1, 14, 6); g.fillStyle(0xd23a3a); g.fillTriangle(18, 0, 18, 8, 24, 4);
  g.fillStyle(0xffa000); g.fillTriangle(4, 1, 4, 7, 0, 4);
  tex('rocket', 24, 8);
  g.fillStyle(0xffffff); g.fillCircle(4, 4, 4); tex('spark', 8, 8);

  // turbo rocket lying on the ground, and a tiny glint so items are easy to spot
  g.fillStyle(0xe8e8e8); g.fillRect(8, 3, 28, 10); g.fillStyle(0xb0b8c0); g.fillRect(8, 9, 28, 4);
  g.fillStyle(0xd23a3a); g.fillTriangle(44, 8, 36, 2, 36, 14);
  g.fillStyle(0xffb300); g.fillTriangle(0, 8, 8, 3, 8, 13);
  tex('icon_turbo_flat', 46, 16);
  g.fillStyle(0xffffff); g.fillRect(4, 0, 2, 10); g.fillRect(0, 4, 10, 2); g.fillStyle(0xfff3a0); g.fillRect(3, 3, 4, 4);
  tex('twinkle', 10, 10);

  g.destroy();
}
