import * as THREE from 'three';

/**
 * Procedural 3D Character & Hardware Models for Shadow Operative
 * - Elite Nanotech Operative (Player)
 * - Corporate Patrol Enforcer (Guard)
 * - Surveillance Drone & Security Camera
 */

// =============================================================================
// 1. Elite Cyber Operative (Player)
// =============================================================================
export function buildOperativeMesh(primaryColor = 0x0f172a, accentColor = 0xf43f5e) {
  const root = new THREE.Group();

  const suitMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.65,
    roughness: 0.35
  });

  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.8,
    roughness: 0.25
  });

  const visorMat = new THREE.MeshBasicMaterial({
    color: accentColor
  });

  const glowStripMat = new THREE.MeshBasicMaterial({
    color: accentColor
  });

  // Body container (allows bobbing and running tilt)
  const body = new THREE.Group();
  root.add(body);

  // Torso / Tactical Chest Rig
  const chestGeo = new THREE.BoxGeometry(0.85, 1.0, 0.5);
  const chest = new THREE.Mesh(chestGeo, suitMat);
  chest.position.y = 1.35;
  chest.castShadow = true;
  chest.receiveShadow = true;
  body.add(chest);

  // Armored Chest Plate
  const plateGeo = new THREE.BoxGeometry(0.78, 0.55, 0.2);
  const plate = new THREE.Mesh(plateGeo, armorMat);
  plate.position.set(0, 1.45, 0.22);
  plate.castShadow = true;
  body.add(plate);

  // Glowing cyber spine/nanosuit LED stripe on back
  const spineGeo = new THREE.BoxGeometry(0.08, 0.8, 0.08);
  const spine = new THREE.Mesh(spineGeo, glowStripMat);
  spine.position.set(0, 1.35, -0.27);
  body.add(spine);

  // Shoulders & Pauldrons
  [-0.55, 0.55].forEach(x => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.4), armorMat);
    pad.position.set(x, 1.8, 0);
    pad.castShadow = true;
    body.add(pad);
  });

  // Tactical Head & Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.05, 0);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12), suitMat);
  helmet.castShadow = true;
  headGroup.add(helmet);

  // Glowing Cyber Visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.2), visorMat);
  visor.position.set(0, 0.02, 0.28);
  headGroup.add(visor);

  // Visor forward subtle point glow
  const visorLight = new THREE.PointLight(accentColor, 0.8, 4);
  visorLight.position.set(0, 0.05, 0.35);
  headGroup.add(visorLight);

  body.add(headGroup);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.24, 0.85, 0.26);
  const leftArm = new THREE.Mesh(armGeo, suitMat);
  leftArm.position.set(-0.55, 1.25, 0);
  leftArm.castShadow = true;
  body.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, suitMat);
  rightArm.position.set(0.55, 1.25, 0);
  rightArm.castShadow = true;
  body.add(rightArm);

  // Silenced Tactical Disruptor in right hand
  const gunGroup = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.55), armorMat);
  gunGroup.add(gunBody);
  const gunTip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), armorMat);
  gunTip.rotation.x = Math.PI / 2;
  gunTip.position.set(0, 0.04, 0.38);
  gunGroup.add(gunTip);
  gunGroup.position.set(0.55, 0.85, 0.25);
  body.add(gunGroup);

  // Legs & Combat Boots
  const legGeo = new THREE.BoxGeometry(0.3, 0.85, 0.32);
  const leftLeg = new THREE.Mesh(legGeo, suitMat);
  leftLeg.position.set(-0.25, 0.45, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, suitMat);
  rightLeg.position.set(0.25, 0.45, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  // Subtle stealth ground shadow / stealth ring
  const ringGeo = new THREE.RingGeometry(0.65, 0.75, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const stealthRing = new THREE.Mesh(ringGeo, ringMat);
  stealthRing.rotation.x = -Math.PI / 2;
  stealthRing.position.y = 0.03;
  root.add(stealthRing);

  root.userData = {
    body,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    stealthRing,
    visorLight
  };

  return root;
}

// =============================================================================
// 2. Corporate Patrol Enforcer (Guard)
// =============================================================================
export function buildEnforcerMesh(accentColor = 0xf59e0b) {
  const root = new THREE.Group();

  const heavySuitMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // slate-700
    metalness: 0.7,
    roughness: 0.3
  });

  const heavyArmorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // dark plate
    metalness: 0.85,
    roughness: 0.25
  });

  const eyeVisorMat = new THREE.MeshBasicMaterial({
    color: accentColor
  });

  const body = new THREE.Group();
  root.add(body);

  // Bulky Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.15, 0.65), heavySuitMat);
  torso.position.y = 1.45;
  torso.castShadow = true;
  body.add(torso);

  // Heavy Kevlar/Ceramic Chest Plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.25), heavyArmorMat);
  plate.position.set(0, 1.55, 0.3);
  plate.castShadow = true;
  body.add(plate);

  // Large Armored Pauldrons
  [-0.65, 0.65].forEach(x => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.5), heavyArmorMat);
    pad.position.set(x, 1.95, 0);
    pad.castShadow = true;
    body.add(pad);
  });

  // Helmet with Tactical Guard Optic
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.18, 0);

  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), heavyArmorMat);
  helm.castShadow = true;
  headGroup.add(helm);

  // Visor / Cyber Eye Lens
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.12), eyeVisorMat);
  visor.position.set(0, 0.05, 0.28);
  headGroup.add(visor);
  body.add(headGroup);

  // Arms with Flashlight on Right Arm
  const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.32);
  const leftArm = new THREE.Mesh(armGeo, heavySuitMat);
  leftArm.position.set(-0.65, 1.35, 0);
  leftArm.castShadow = true;
  body.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, heavySuitMat);
  rightArm.position.set(0.65, 1.35, 0);
  rightArm.castShadow = true;
  body.add(rightArm);

  // Heavy Flashlight Unit
  const torchGroup = new THREE.Group();
  const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 12), heavyArmorMat);
  torchBody.rotation.x = Math.PI / 2;
  torchGroup.add(torchBody);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lens.position.set(0, 0, 0.31);
  torchGroup.add(lens);

  torchGroup.position.set(0.65, 1.05, 0.3);
  body.add(torchGroup);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.38, 0.95, 0.38);
  const leftLeg = new THREE.Mesh(legGeo, heavySuitMat);
  leftLeg.position.set(-0.32, 0.48, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, heavySuitMat);
  rightLeg.position.set(0.32, 0.48, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  // Volumetric Flashlight Spotlight & Cone
  const flashlight = new THREE.SpotLight(0xfff5db, 3.2, 16, Math.PI / 5.5, 0.35, 1.2);
  flashlight.position.set(0, 1.2, 0.4);
  flashlight.target.position.set(0, 0.5, 12);
  root.add(flashlight);
  root.add(flashlight.target);

  // Semi-transparent visible vision cone on the ground
  const coneGeo = new THREE.ConeGeometry(4.8, 11, 24, 1, true, 0, Math.PI * 2);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const visionCone = new THREE.Mesh(coneGeo, coneMat);
  visionCone.rotation.x = -Math.PI / 2;
  visionCone.position.set(0, 0.3, 5.5);
  root.add(visionCone);

  // Status icon / question mark or exclamation mesh
  const alertBadgeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const alertBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), alertBadgeMat);
  alertBadge.position.set(0, 2.75, 0);
  alertBadge.visible = false;
  root.add(alertBadge);

  root.userData = {
    body,
    headGroup,
    leftLeg,
    rightLeg,
    flashlight,
    visionCone,
    coneMat,
    eyeVisorMat,
    alertBadge,
    alertBadgeMat
  };

  return root;
}

// =============================================================================
// 3. Wall/Ceiling Security Camera
// =============================================================================
export function buildSecurityCameraMesh() {
  const root = new THREE.Group();

  const mountMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  // Ceiling/Wall Arm Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 12), mountMat);
  root.add(base);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), mountMat);
  arm.position.y = -0.4;
  root.add(arm);

  // Swiveling head
  const head = new THREE.Group();
  head.position.y = -0.7;

  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.9), bodyMat);
  camBox.position.z = 0.2;
  camBox.castShadow = true;
  head.add(camBox);

  // Lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 12), mountMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, 0.72);
  head.add(lens);

  // Status LED
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), ledMat);
  led.position.set(0, 0.22, 0.6);
  head.add(led);

  // Camera Spot Light
  const spot = new THREE.SpotLight(0x38bdf8, 2.5, 18, Math.PI / 5, 0.4, 1.2);
  spot.position.set(0, 0, 0.75);
  spot.target.position.set(0, -6, 10);
  head.add(spot);
  head.add(spot.target);

  // Visible scanning cone
  const coneGeo = new THREE.ConeGeometry(3.5, 12, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const sweepCone = new THREE.Mesh(coneGeo, coneMat);
  sweepCone.rotation.x = -Math.PI / 2.8;
  sweepCone.position.set(0, -3.5, 5.5);
  head.add(sweepCone);

  root.add(head);

  root.userData = {
    head,
    spot,
    ledMat,
    coneMat,
    sweepCone
  };

  return root;
}

// =============================================================================
// 4. Data Terminal & Quantum Vault Core
// =============================================================================
export function buildTerminalMesh(terminalName = 'ALPHA', isVault = false) {
  const root = new THREE.Group();

  const caseMat = new THREE.MeshStandardMaterial({
    color: isVault ? 0x0f172a : 0x1e293b,
    metalness: 0.85,
    roughness: 0.25
  });

  const screenColor = isVault ? 0xf59e0b : 0x06b6d4;
  const screenMat = new THREE.MeshBasicMaterial({ color: screenColor });

  if (isVault) {
    // Large Central Quantum Vault Chamber
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 16), caseMat);
    base.position.y = 0.4;
    base.castShadow = true;
    base.receiveShadow = true;
    root.add(base);

    // Glass Containment Cylinder
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      metalness: 0.1,
      roughness: 0.1
    });
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 24), glassMat);
    chamber.position.y = 2.4;
    root.add(chamber);

    // Glowing Quantum Data Core
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 2), coreMat);
    core.position.y = 2.4;
    root.add(core);

    const coreLight = new THREE.PointLight(0x38bdf8, 3.5, 14);
    coreLight.position.y = 2.4;
    root.add(coreLight);

    // Surrounding data pillars
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.0, 0.45), caseMat);
      col.position.set(Math.cos(angle) * 2.2, 2.0, Math.sin(angle) * 2.2);
      col.castShadow = true;
      root.add(col);
    }

    root.userData = { core, coreLight, isVault: true, hacked: false };
    return root;
  }

  // Security Access Terminal Pedestal
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), caseMat);
  pedestal.position.y = 0.65;
  pedestal.castShadow = true;
  root.add(pedestal);

  // Angled Display Console
  const consoleHead = new THREE.Group();
  consoleHead.position.set(0, 1.35, 0.1);
  consoleHead.rotation.x = -0.45;

  const screenMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.1), screenMat);
  consoleHead.add(screenMesh);
  root.add(consoleHead);

  // Holographic interaction beam
  const ringGeo = new THREE.RingGeometry(0.9, 1.15, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: screenColor,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
  });
  const groundRing = new THREE.Mesh(ringGeo, ringMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.03;
  root.add(groundRing);

  // Light emitter
  const termLight = new THREE.PointLight(screenColor, 1.8, 6);
  termLight.position.set(0, 1.6, 0.4);
  root.add(termLight);

  root.userData = {
    screenMat,
    groundRing,
    termLight,
    isVault: false,
    name: terminalName,
    hacked: false
  };

  return root;
}
