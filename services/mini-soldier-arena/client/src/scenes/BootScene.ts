import Phaser from 'phaser';
import { CELL_W, CELL_H } from '../config';
import { makeTextures } from '../textures';
import { WEAPONS } from '../shared/weapons';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.spritesheet('soldier', 'assets/soldier.png', { frameWidth: CELL_W, frameHeight: CELL_H });
    this.load.image('head', 'assets/head.png');
    [...Object.keys(WEAPONS), 'grenade', 'pineapple'].forEach((k) => this.load.image('w_' + k, `assets/weapons/${k}.png`));
  }

  create() {
    makeTextures(this);
    this.scene.start('GameScene');
  }
}
