import * as THREE from 'three';

/**
 * PlumberModel - Procedural 3D character, enemies, interactive blocks,
 * and environmental props for Super Plumber 3D.
 */
export class PlumberModel {
  /**
   * Builds the iconic 3D Hero Plumber character.
   */
  static createPlumber() {
    const root = new THREE.Group();
    root.name = 'plumber';

    // Shared Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffcb9a,
      roughness: 0.6,
      metalness: 0.05
    });

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xd92626,
      roughness: 0.5,
      metalness: 0.1
    });

    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.6,
      metalness: 0.1
    });

    const brownMat = new THREE.MeshStandardMaterial({
      color: 0x5c2e0b,
      roughness: 0.8,
      metalness: 0.1
    });

    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.1
    });

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      metalness: 0.3
    });

    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.1
    });

    // 1. Torso & Overalls Group
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 0.65;
    root.add(torsoGroup);

    // Red Under-Shirt
    const shirtGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.5, 12);
    const shirt = new THREE.Mesh(shirtGeo, redMat);
    shirt.castShadow = true;
    torsoGroup.add(shirt);

    // Blue Overalls Bib
    const overallsGeo = new THREE.BoxGeometry(0.52, 0.42, 0.44);
    const overalls = new THREE.Mesh(overallsGeo, blueMat);
    overalls.position.y = -0.05;
    overalls.castShadow = true;
    torsoGroup.add(overalls);

    // Overalls Yellow Buttons
    const buttonGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8);
    buttonGeo.rotateX(Math.PI / 2);
    const btnL = new THREE.Mesh(buttonGeo, yellowMat);
    btnL.position.set(-0.14, 0.06, 0.23);
    const btnR = new THREE.Mesh(buttonGeo, yellowMat);
    btnR.position.set(0.14, 0.06, 0.23);
    torsoGroup.add(btnL, btnR);

    // Overalls Shoulder Straps
    const strapGeo = new THREE.BoxGeometry(0.08, 0.4, 0.04);
    const strapL = new THREE.Mesh(strapGeo, blueMat);
    strapL.position.set(-0.14, 0.1, 0.18);
    strapL.rotation.x = -0.1;
    const strapR = new THREE.Mesh(strapGeo, blueMat);
    strapR.position.set(0.14, 0.1, 0.18);
    strapR.rotation.x = -0.1;
    torsoGroup.add(strapL, strapR);

    // 2. Head & Cap Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.15, 0);
    root.add(headGroup);

    // Face / Head Sphere
    const headGeo = new THREE.SphereGeometry(0.32, 16, 16);
    headGeo.scale(1, 0.95, 0.95);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.castShadow = true;
    headGroup.add(head);

    // Big Bulbous Nose
    const noseGeo = new THREE.SphereGeometry(0.12, 12, 12);
    noseGeo.scale(1.1, 0.9, 1.2);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, -0.02, 0.32);
    nose.castShadow = true;
    headGroup.add(nose);

    // Iconic Bushy Mustache
    const mustacheGeo = new THREE.BoxGeometry(0.34, 0.08, 0.12);
    const mustache = new THREE.Mesh(mustacheGeo, blackMat);
    mustache.position.set(0, -0.1, 0.3);
    mustache.rotation.x = 0.15;
    headGroup.add(mustache);

    // Cartoon Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    eyeGeo.scale(0.7, 1.2, 0.4);
    const eyeL = new THREE.Mesh(eyeGeo, blackMat);
    eyeL.position.set(-0.11, 0.08, 0.28);
    const eyeR = new THREE.Mesh(eyeGeo, blackMat);
    eyeR.position.set(0.11, 0.08, 0.28);
    headGroup.add(eyeL, eyeR);

    // Eye Highlights (White dots)
    const eyePupilGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const pupilL = new THREE.Mesh(eyePupilGeo, whiteMat);
    pupilL.position.set(-0.1, 0.11, 0.3);
    const pupilR = new THREE.Mesh(eyePupilGeo, whiteMat);
    pupilR.position.set(0.1, 0.11, 0.3);
    headGroup.add(pupilL, pupilR);

    // Ears
    const earGeo = new THREE.SphereGeometry(0.08, 8, 8);
    earGeo.scale(0.5, 0.9, 0.7);
    const earL = new THREE.Mesh(earGeo, skinMat);
    earL.position.set(-0.31, 0, 0);
    const earR = new THREE.Mesh(earGeo, skinMat);
    earR.position.set(0.31, 0, 0);
    headGroup.add(earL, earR);

    // Sideburns
    const sideburnGeo = new THREE.BoxGeometry(0.06, 0.12, 0.1);
    const sideL = new THREE.Mesh(sideburnGeo, brownMat);
    sideL.position.set(-0.3, 0.02, 0.05);
    const sideR = new THREE.Mesh(sideburnGeo, brownMat);
    sideR.position.set(0.3, 0.02, 0.05);
    headGroup.add(sideL, sideR);

    // Cap Dome
    const capDomeGeo = new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    capDomeGeo.scale(1.05, 0.9, 1.15);
    const capDome = new THREE.Mesh(capDomeGeo, redMat);
    capDome.position.set(0, 0.1, -0.02);
    capDome.castShadow = true;
    headGroup.add(capDome);

    // Cap Peak / Front Pouch
    const capPouchGeo = new THREE.SphereGeometry(0.25, 12, 10);
    capPouchGeo.scale(1.1, 0.7, 0.9);
    const capPouch = new THREE.Mesh(capPouchGeo, redMat);
    capPouch.position.set(0, 0.2, 0.12);
    headGroup.add(capPouch);

    // Cap Visor / Brim
    const visorGeo = new THREE.CylinderGeometry(0.36, 0.38, 0.04, 16, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
    const visor = new THREE.Mesh(visorGeo, redMat);
    visor.position.set(0, 0.14, 0.16);
    visor.rotation.x = 0.22;
    headGroup.add(visor);

    // White Cap Emblem (Circle)
    const emblemGeo = new THREE.CircleGeometry(0.08, 12);
    const emblem = new THREE.Mesh(emblemGeo, whiteMat);
    emblem.position.set(0, 0.26, 0.28);
    emblem.rotation.x = -0.2;
    headGroup.add(emblem);

    // 3. Arms Group (Left & Right)
    const armL = new THREE.Group();
    armL.position.set(-0.32, 0.82, 0);
    const armR = new THREE.Group();
    armR.position.set(0.32, 0.82, 0);
    root.add(armL, armR);

    // Arm Sleeve (Red)
    const sleeveGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8);
    const sleeveL = new THREE.Mesh(sleeveGeo, redMat);
    sleeveL.position.y = -0.12;
    armL.add(sleeveL);
    const sleeveR = new THREE.Mesh(sleeveGeo, redMat);
    sleeveR.position.y = -0.12;
    armR.add(sleeveR);

    // White Gloves
    const gloveGeo = new THREE.SphereGeometry(0.11, 10, 10);
    const gloveL = new THREE.Mesh(gloveGeo, whiteMat);
    gloveL.position.y = -0.27;
    gloveL.castShadow = true;
    armL.add(gloveL);
    const gloveR = new THREE.Mesh(gloveGeo, whiteMat);
    gloveR.position.y = -0.27;
    gloveR.castShadow = true;
    armR.add(gloveR);

    // 4. Legs & Boots Group (Left & Right)
    const legL = new THREE.Group();
    legL.position.set(-0.16, 0.42, 0);
    const legR = new THREE.Group();
    legR.position.set(0.16, 0.42, 0);
    root.add(legL, legR);

    // Pants Leg (Blue)
    const pantGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 8);
    const pantL = new THREE.Mesh(pantGeo, blueMat);
    pantL.position.y = -0.1;
    pantL.castShadow = true;
    legL.add(pantL);
    const pantR = new THREE.Mesh(pantGeo, blueMat);
    pantR.position.y = -0.1;
    pantR.castShadow = true;
    legR.add(pantR);

    // Brown Work Boots
    const bootGeo = new THREE.BoxGeometry(0.2, 0.16, 0.32);
    const bootL = new THREE.Mesh(bootGeo, brownMat);
    bootL.position.set(0, -0.24, 0.05);
    bootL.castShadow = true;
    legL.add(bootL);
    const bootR = new THREE.Mesh(bootGeo, brownMat);
    bootR.position.set(0, -0.24, 0.05);
    bootR.castShadow = true;
    legR.add(bootR);

    // Attach animation refs
    root.userData = {
      headGroup,
      torsoGroup,
      armL,
      armR,
      legL,
      legR,
      redMat,
      blueMat,
      skinMat,
      whiteMat,
      yellowMat,
      form: 'small',
      animTime: 0
    };

    return root;
  }

  /**
   * Updates Plumber visual form (Small, Super, Fire, Star Invincible).
   */
  static setPlumberForm(plumber, form = 'small') {
    const d = plumber.userData;
    d.form = form;

    if (form === 'small') {
      plumber.scale.set(0.9, 0.9, 0.9);
      d.redMat.color.setHex(0xd92626);
      d.blueMat.color.setHex(0x1d4ed8);
      d.redMat.emissive.setHex(0x000000);
    } else if (form === 'super') {
      plumber.scale.set(1.22, 1.22, 1.22);
      d.redMat.color.setHex(0xd92626);
      d.blueMat.color.setHex(0x1d4ed8);
      d.redMat.emissive.setHex(0x000000);
    } else if (form === 'fire') {
      plumber.scale.set(1.22, 1.22, 1.22);
      d.redMat.color.setHex(0xf8fafc); // White cap & suit
      d.blueMat.color.setHex(0xd92626); // Red overalls
      d.redMat.emissive.setHex(0x111111);
    } else if (form === 'star') {
      // Star powerup
      plumber.scale.set(1.22, 1.22, 1.22);
    }
  }

  /**
   * Procedural Walk/Run/Jump/Skid Animation.
   */
  static animatePlumber(plumber, dt, vx, isGrounded, isSkidding, isDead, isVictory) {
    const d = plumber.userData;
    d.animTime += dt;

    if (isDead) {
      plumber.rotation.z = Math.PI;
      d.armL.rotation.z = 1.2;
      d.armR.rotation.z = -1.2;
      return;
    }

    if (isVictory) {
      plumber.rotation.y = Math.sin(d.animTime * 6) * 0.4;
      d.armL.rotation.x = -Math.PI * 0.8;
      d.armR.rotation.x = -Math.PI * 0.8;
      d.legL.rotation.x = 0;
      d.legR.rotation.x = 0;
      return;
    }

    if (!isGrounded) {
      // Classic jump pose: arm up, forward leg bent
      d.armR.rotation.x = -2.2;
      d.armL.rotation.x = 0.5;
      d.legL.rotation.x = -0.7;
      d.legR.rotation.x = 0.4;
      d.headGroup.rotation.x = -0.2;
      return;
    }

    if (isSkidding) {
      // Skidding friction pose
      d.armL.rotation.x = 1.2;
      d.armR.rotation.x = 1.2;
      d.legL.rotation.x = -0.5;
      d.legR.rotation.x = -0.5;
      d.torsoGroup.rotation.z = -0.2 * Math.sign(vx);
      return;
    }

    const speed = Math.abs(vx);
    if (speed > 0.3) {
      // Running cycle
      const freq = speed * 1.6;
      const swing = Math.sin(d.animTime * freq * 8) * 0.85;

      d.legL.rotation.x = swing;
      d.legR.rotation.x = -swing;
      d.armL.rotation.x = -swing * 0.8;
      d.armR.rotation.x = swing * 0.8;
      d.torsoGroup.position.y = 0.65 + Math.abs(Math.sin(d.animTime * freq * 8)) * 0.06;
      d.headGroup.rotation.x = 0.08;
    } else {
      // Idle breath
      d.legL.rotation.x = 0;
      d.legR.rotation.x = 0;
      d.armL.rotation.x = 0;
      d.armR.rotation.x = 0;
      d.torsoGroup.position.y = 0.65 + Math.sin(d.animTime * 3) * 0.02;
      d.headGroup.rotation.x = 0;
    }
  }

  // =========================================================================
  // Enemies
  // =========================================================================

  /**
   * Brown mushroom-like Goomba.
   */
  static createGoomba() {
    const group = new THREE.Group();
    group.name = 'goomba';

    const brownMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.7,
      metalness: 0.1
    });

    const creamMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.8,
      metalness: 0.05
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.9,
      metalness: 0.1
    });

    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const eyeBlackMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

    // Head / Mushroom Cap
    const capGeo = new THREE.ConeGeometry(0.48, 0.65, 12);
    const cap = new THREE.Mesh(capGeo, brownMat);
    cap.position.y = 0.55;
    cap.rotation.x = Math.PI; // Inverted mushroom bell
    cap.castShadow = true;
    group.add(cap);

    // Stalk / Body
    const stemGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.36, 12);
    const stem = new THREE.Mesh(stemGeo, creamMat);
    stem.position.y = 0.32;
    stem.castShadow = true;
    group.add(stem);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
    eyeGeo.scale(0.7, 1.2, 0.4);
    const eyeL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeL.position.set(-0.14, 0.42, 0.28);
    const eyeR = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeR.position.set(0.14, 0.42, 0.28);
    group.add(eyeL, eyeR);

    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const pupL = new THREE.Mesh(pupilGeo, eyeBlackMat);
    pupL.position.set(-0.12, 0.42, 0.31);
    const pupR = new THREE.Mesh(pupilGeo, eyeBlackMat);
    pupR.position.set(0.12, 0.42, 0.31);
    group.add(pupL, pupR);

    // Eyebrows (Menacing angle)
    const browGeo = new THREE.BoxGeometry(0.14, 0.03, 0.04);
    const browL = new THREE.Mesh(browGeo, eyeBlackMat);
    browL.position.set(-0.14, 0.5, 0.29);
    browL.rotation.z = -0.3;
    const browR = new THREE.Mesh(browGeo, eyeBlackMat);
    browR.position.set(0.14, 0.5, 0.29);
    browR.rotation.z = 0.3;
    group.add(browL, browR);

    // Two Waddling Feet
    const footGeo = new THREE.SphereGeometry(0.16, 8, 8);
    footGeo.scale(1.2, 0.6, 1.4);
    const footL = new THREE.Mesh(footGeo, darkMat);
    footL.position.set(-0.2, 0.08, 0);
    const footR = new THREE.Mesh(footGeo, darkMat);
    footR.position.set(0.2, 0.08, 0);
    group.add(footL, footR);

    group.userData = {
      footL,
      footR,
      isSquished: false,
      squishTimer: 0
    };

    return group;
  }

  /**
   * Green Turtle Koopa Troopa (with kickable shell mode).
   */
  static createKoopa() {
    const group = new THREE.Group();
    group.name = 'koopa';

    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.4,
      metalness: 0.15
    });

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.6
    });

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

    // Shell Group
    const shellGroup = new THREE.Group();
    shellGroup.position.y = 0.48;
    group.add(shellGroup);

    // Shell Dome
    const shellGeo = new THREE.SphereGeometry(0.38, 14, 14);
    shellGeo.scale(0.9, 1.15, 0.9);
    const shell = new THREE.Mesh(shellGeo, greenMat);
    shell.castShadow = true;
    shellGroup.add(shell);

    // Shell White Rim
    const rimGeo = new THREE.TorusGeometry(0.36, 0.06, 8, 16);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, whiteMat);
    rim.position.y = -0.15;
    shellGroup.add(rim);

    // Head (Yellow)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.88, 0.15);
    group.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
    headGeo.scale(0.85, 1, 1.1);
    const head = new THREE.Mesh(headGeo, yellowMat);
    head.castShadow = true;
    headGroup.add(head);

    // Beak / Snout
    const beakGeo = new THREE.SphereGeometry(0.12, 8, 8);
    beakGeo.scale(0.8, 0.7, 1.3);
    const beak = new THREE.Mesh(beakGeo, yellowMat);
    beak.position.set(0, -0.06, 0.16);
    headGroup.add(beak);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    eyeGeo.scale(0.6, 1.2, 0.5);
    const eyeL = new THREE.Mesh(eyeGeo, whiteMat);
    eyeL.position.set(-0.1, 0.06, 0.16);
    const eyeR = new THREE.Mesh(eyeGeo, whiteMat);
    eyeR.position.set(0.1, 0.06, 0.16);
    headGroup.add(eyeL, eyeR);

    // Orange Shoes
    const shoeGeo = new THREE.BoxGeometry(0.16, 0.14, 0.28);
    const shoeL = new THREE.Mesh(shoeGeo, orangeMat);
    shoeL.position.set(-0.16, 0.07, 0);
    const shoeR = new THREE.Mesh(shoeGeo, orangeMat);
    shoeR.position.set(0.16, 0.07, 0);
    group.add(shoeL, shoeR);

    group.userData = {
      shellGroup,
      headGroup,
      shoeL,
      shoeR,
      isShell: false,
      shellSpeed: 0
    };

    return group;
  }

  /**
   * Piranha Plant popping out of green pipes.
   */
  static createPiranhaPlant() {
    const group = new THREE.Group();
    group.name = 'piranha';

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4
    });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x16a34a });

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8);
    const stem = new THREE.Mesh(stemGeo, greenMat);
    stem.position.y = 0.4;
    group.add(stem);

    // Bulb Head (Top Jaw)
    const headTopGeo = new THREE.SphereGeometry(0.28, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const headTop = new THREE.Mesh(headTopGeo, redMat);
    headTop.position.set(0, 0.78, 0);
    headTop.rotation.x = -0.3;
    group.add(headTop);

    // White Lips & Sharp Teeth
    const lipGeo = new THREE.TorusGeometry(0.26, 0.04, 6, 12);
    lipGeo.rotateX(Math.PI / 2);
    const lip = new THREE.Mesh(lipGeo, whiteMat);
    lip.position.set(0, 0.76, 0);
    group.add(lip);

    // White polka dots on head
    for (let i = 0; i < 5; i++) {
      const dotGeo = new THREE.CircleGeometry(0.05, 8);
      const dot = new THREE.Mesh(dotGeo, whiteMat);
      const angle = (i / 5) * Math.PI * 2;
      dot.position.set(Math.cos(angle) * 0.22, 0.9, Math.sin(angle) * 0.22);
      dot.rotation.x = -Math.PI / 2;
      group.add(dot);
    }

    return group;
  }

  // =========================================================================
  // Interactive Blocks & Collectibles
  // =========================================================================

  /**
   * Question Mark [?] Block.
   */
  static createQuestionBlock(type = 'coin') {
    const group = new THREE.Group();
    group.name = 'question_block';

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.5,
      emissive: 0x78350f,
      emissiveIntensity: 0.3
    });

    const studMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.5
    });

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const box = new THREE.Mesh(boxGeo, goldMat);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    // Corner Rivets/Studs
    const studGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8);
    studGeo.rotateX(Math.PI / 2);
    const offsets = [
      [-0.38, 0.38],
      [0.38, 0.38],
      [-0.38, -0.38],
      [0.38, -0.38]
    ];

    offsets.forEach(([x, y]) => {
      const stud = new THREE.Mesh(studGeo, studMat);
      stud.position.set(x, y, 0.51);
      group.add(stud);
    });

    // Embossed '?' on front face
    const glyphGroup = new THREE.Group();
    glyphGroup.position.set(0, 0, 0.51);
    const curveGeo = new THREE.TorusGeometry(0.18, 0.055, 6, 12, Math.PI * 1.3);
    const curve = new THREE.Mesh(curveGeo, studMat);
    curve.position.set(0, 0.1, 0);
    glyphGroup.add(curve);

    const stemGeo = new THREE.BoxGeometry(0.09, 0.14, 0.03);
    const stem = new THREE.Mesh(stemGeo, studMat);
    stem.position.set(0, -0.05, 0);
    glyphGroup.add(stem);

    const dotGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const dot = new THREE.Mesh(dotGeo, studMat);
    dot.position.set(0, -0.25, 0);
    glyphGroup.add(dot);

    group.add(glyphGroup);

    group.userData = {
      blockType: 'question',
      contentType: type, // 'coin', 'mushroom', 'fireflower', 'star'
      isUsed: false,
      boxMesh: box,
      glyphMesh: glyphGroup,
      bumpY: 0
    };

    return group;
  }

  /**
   * Brick Block.
   */
  static createBrickBlock() {
    const group = new THREE.Group();
    group.name = 'brick_block';

    const brickMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.8,
      metalness: 0.1
    });

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const box = new THREE.Mesh(boxGeo, brickMat);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    // Decorative mortar line cuts
    const mortarMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const lineGeoH = new THREE.BoxGeometry(0.96, 0.04, 0.03);
    const lineH = new THREE.Mesh(lineGeoH, mortarMat);
    lineH.position.set(0, 0, 0.51);
    group.add(lineH);

    const lineGeoV1 = new THREE.BoxGeometry(0.04, 0.46, 0.03);
    const lineV1 = new THREE.Mesh(lineGeoV1, mortarMat);
    lineV1.position.set(-0.25, 0.25, 0.51);
    const lineV2 = new THREE.Mesh(lineGeoV1, mortarMat);
    lineV2.position.set(0.25, -0.25, 0.51);
    group.add(lineV1, lineV2);

    group.userData = {
      blockType: 'brick',
      isDestroyed: false,
      bumpY: 0
    };

    return group;
  }

  /**
   * Floating Golden Coin.
   */
  static createCoin() {
    const group = new THREE.Group();
    group.name = 'coin';

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.85,
      emissive: 0xca8a04,
      emissiveIntensity: 0.25
    });

    // Thick Beveled Coin Cylinder
    const coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coin = new THREE.Mesh(coinGeo, goldMat);
    coin.castShadow = true;
    group.add(coin);

    // Center Star / Emboss Ring
    const ringGeo = new THREE.TorusGeometry(0.24, 0.03, 6, 16);
    const ring = new THREE.Mesh(ringGeo, goldMat);
    ring.position.z = 0.055;
    group.add(ring);

    group.userData = {
      collected: false,
      rotSpeed: 3.5
    };

    return group;
  }

  /**
   * Classic Green Warp Pipe.
   */
  static createPipe(height = 3) {
    const group = new THREE.Group();
    group.name = 'pipe';

    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.4,
      metalness: 0.2
    });

    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x052e16,
      roughness: 0.9
    });

    // Pipe Body Column
    const bodyHeight = height - 0.6;
    const bodyGeo = new THREE.CylinderGeometry(0.72, 0.72, bodyHeight, 16);
    const body = new THREE.Mesh(bodyGeo, pipeMat);
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Pipe Top Rim / Lip Collar
    const collarGeo = new THREE.CylinderGeometry(0.88, 0.88, 0.6, 16);
    const collar = new THREE.Mesh(collarGeo, pipeMat);
    collar.position.y = height - 0.3;
    collar.castShadow = true;
    collar.receiveShadow = true;
    group.add(collar);

    // Dark Hollow Interior
    const insideGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.05, 16);
    const inside = new THREE.Mesh(insideGeo, innerMat);
    inside.position.y = height;
    group.add(inside);

    group.userData = {
      height,
      radius: 0.88
    };

    return group;
  }

  /**
   * Super Mushroom Powerup.
   */
  static createSuperMushroom() {
    const group = new THREE.Group();
    group.name = 'super_mushroom';

    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const eyeBlackMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

    // Cap
    const capGeo = new THREE.SphereGeometry(0.42, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const cap = new THREE.Mesh(capGeo, redMat);
    cap.position.y = 0.35;
    group.add(cap);

    // White Spots
    const spots = [
      [0, 0.58, 0.28],
      [-0.26, 0.45, 0.18],
      [0.26, 0.45, 0.18],
      [0, 0.72, 0]
    ];
    spots.forEach(([x, y, z]) => {
      const spotGeo = new THREE.CircleGeometry(0.1, 8);
      const spot = new THREE.Mesh(spotGeo, whiteMat);
      spot.position.set(x, y, z);
      spot.lookAt(0, 0.35, 0);
      group.add(spot);
    });

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.3, 12);
    const stem = new THREE.Mesh(stemGeo, whiteMat);
    stem.position.y = 0.2;
    group.add(stem);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
    eyeGeo.scale(0.5, 1.3, 0.4);
    const eyeL = new THREE.Mesh(eyeGeo, eyeBlackMat);
    eyeL.position.set(-0.08, 0.23, 0.24);
    const eyeR = new THREE.Mesh(eyeGeo, eyeBlackMat);
    eyeR.position.set(0.08, 0.23, 0.24);
    group.add(eyeL, eyeR);

    group.userData = {
      type: 'mushroom',
      vx: 3.5,
      vy: 0
    };

    return group;
  }

  /**
   * Fire Flower Powerup.
   */
  static createFireFlower() {
    const group = new THREE.Group();
    group.name = 'fire_flower';

    const greenMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, emissiveIntensity: 0.3 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8);
    const stem = new THREE.Mesh(stemGeo, greenMat);
    stem.position.y = 0.2;
    group.add(stem);

    // Flower Outer Petals (Yellow/Red concentric discs)
    const petalGeo = new THREE.TorusGeometry(0.26, 0.08, 8, 16);
    const petal = new THREE.Mesh(petalGeo, redMat);
    petal.position.set(0, 0.5, 0);
    group.add(petal);

    const innerPetalGeo = new THREE.TorusGeometry(0.18, 0.06, 8, 16);
    const innerPetal = new THREE.Mesh(innerPetalGeo, yellowMat);
    innerPetal.position.set(0, 0.5, 0.02);
    group.add(innerPetal);

    // White Core Face
    const coreGeo = new THREE.SphereGeometry(0.12, 10, 10);
    coreGeo.scale(1.2, 0.8, 0.5);
    const core = new THREE.Mesh(coreGeo, whiteMat);
    core.position.set(0, 0.5, 0.04);
    group.add(core);

    group.userData = {
      type: 'fireflower',
      animTime: 0
    };

    return group;
  }

  /**
   * Bouncy Fireball thrown by Fire Mario.
   */
  static createFireball() {
    const group = new THREE.Group();
    group.name = 'fireball';

    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xef4444,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });

    const ballGeo = new THREE.SphereGeometry(0.2, 10, 10);
    const ball = new THREE.Mesh(ballGeo, fireMat);
    group.add(ball);

    // Core glow
    const light = new THREE.PointLight(0xff5500, 1.5, 3.5);
    group.add(light);

    group.userData = {
      vx: 12,
      vy: 0,
      bounces: 0,
      life: 2.5
    };

    return group;
  }

  /**
   * End-of-level Flagpole.
   */
  static createFlagpole(height = 10) {
    const group = new THREE.Group();
    group.name = 'flagpole';

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.1 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, side: THREE.DoubleSide });

    // Green stepped base
    const baseGeo = new THREE.CylinderGeometry(0.8, 1, 0.8, 8);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.4;
    group.add(base);

    // Silver Pole
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, height, 12);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = height / 2 + 0.8;
    pole.castShadow = true;
    group.add(pole);

    // Golden Top Sphere
    const finialGeo = new THREE.SphereGeometry(0.28, 12, 12);
    const finial = new THREE.Mesh(finialGeo, goldMat);
    finial.position.y = height + 0.8;
    group.add(finial);

    // Sliding Triangular Flag
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(-1.2, 0.4);
    flagShape.lineTo(0, 0.8);
    flagShape.closePath();

    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(-0.08, height, 0);
    group.add(flag);

    group.userData = {
      poleHeight: height,
      flagMesh: flag,
      flagY: height,
      isTriggered: false
    };

    return group;
  }

  /**
   * End-of-level Castle.
   */
  static createCastle() {
    const group = new THREE.Group();
    group.name = 'castle';

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.85,
      metalness: 0.05
    });

    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });

    // Main Keep Base
    const keepGeo = new THREE.BoxGeometry(4, 3.5, 3);
    const keep = new THREE.Mesh(keepGeo, wallMat);
    keep.position.y = 1.75;
    keep.castShadow = true;
    group.add(keep);

    // Center Tower
    const towerGeo = new THREE.BoxGeometry(2.2, 2.5, 2.2);
    const tower = new THREE.Mesh(towerGeo, wallMat);
    tower.position.set(0, 4.2, 0);
    tower.castShadow = true;
    group.add(tower);

    // Battlements / Crenellations
    for (let i = -1.6; i <= 1.6; i += 0.8) {
      const cGeo = new THREE.BoxGeometry(0.4, 0.5, 0.4);
      const c = new THREE.Mesh(cGeo, wallMat);
      c.position.set(i, 3.75, 1.3);
      group.add(c);
    }

    // Arched Entrance Doorway
    const doorGeo = new THREE.BoxGeometry(1.2, 1.8, 0.4);
    const door = new THREE.Mesh(doorGeo, darkMat);
    door.position.set(0, 0.9, 1.4);
    group.add(door);

    // Castle Flag
    const cFlagGeo = new THREE.BoxGeometry(0.04, 0.8, 0.04);
    const cPole = new THREE.Mesh(cFlagGeo, wallMat);
    cPole.position.set(0, 5.8, 0);
    group.add(cPole);

    const cFlagMeshGeo = new THREE.BufferGeometry();
    const bannerGeo = new THREE.PlaneGeometry(0.6, 0.4);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0.3, 5.9, 0);
    group.add(banner);

    return group;
  }
}
