import * as THREE from 'three';

export function createFighterShip() {
  const group = new THREE.Group();

  // 1. Sleek Fuselage
  const bodyGeo = new THREE.ConeGeometry(0.9, 4.2, 8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.9,
    roughness: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  // 2. Cockpit Canopy Glass (Glowing Neon Cyan)
  const canopyGeo = new THREE.SphereGeometry(0.45, 12, 12);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.5
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.35, -0.4);
  canopy.scale.set(0.8, 0.6, 2.0);
  group.add(canopy);

  // 3. Swept Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(3.2, -1.2);
  wingShape.lineTo(2.8, -2.4);
  wingShape.lineTo(0, -1.6);
  wingShape.closePath();

  const extrudeSettings = { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 };
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.85,
    roughness: 0.25
  });

  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.rotation.x = Math.PI / 2;
  rightWing.position.set(0, 0, 0.8);
  rightWing.castShadow = true;
  group.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.rotation.x = Math.PI / 2;
  leftWing.scale.x = -1;
  leftWing.position.set(0, 0, 0.8);
  leftWing.castShadow = true;
  group.add(leftWing);

  // 4. Plasma Engine Thrusters
  const thrusterGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.6, 12);
  const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  [-0.6, 0.6].forEach(x => {
    const t = new THREE.Mesh(thrusterGeo, thrusterMat);
    t.rotation.x = Math.PI / 2;
    t.position.set(x, 0, 2.2);
    group.add(t);
  });

  return group;
}

export function createAsteroidMesh(radius = 1.8) {
  const geo = new THREE.DodecahedronGeometry(radius, 1);
  // Deform vertices for realistic cratered space rock
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const noise = 1 + (Math.random() - 0.5) * 0.35;
    v.multiplyScalar(noise);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // Chunky, faceted toy rocks in warm, light colours so they read against the indigo space
  const rocks = [0xffb4a2, 0xffe08a, 0xb8f2d0, 0xffc4dd, 0xbfe6ff];
  const mat = new THREE.MeshStandardMaterial({
    color: rocks[Math.floor(Math.random() * rocks.length)],
    roughness: 0.6,
    metalness: 0,
    flatShading: true
  });
  return new THREE.Mesh(geo, mat);
}

export function createEnemyJetMesh() {
  const group = new THREE.Group();
  
  const bodyGeo = new THREE.ConeGeometry(0.6, 2.4, 6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xef4444, // Red enemy
    metalness: 0.8,
    roughness: 0.3
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2; // Pointing towards player (but moving backwards, so maybe wait)
  // Our ship points forward. We are looking down Z axis towards negative. 
  // Ship cone rotation is Math.PI/2 (tip points to -Z). 
  // Enemy comes from -Z to +Z, so it should point to +Z.
  body.rotation.x = -Math.PI / 2; 
  group.add(body);

  const wingGeo = new THREE.BoxGeometry(2.5, 0.1, 0.6);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, metalness: 0.7, roughness: 0.3 });
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, 0, 0.2);
  group.add(wing);

  const engineGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, -1.2);
  group.add(engine);

  return group;
}

/**
 * The player's jet form: a yellow delta-wing fighter with twin tails, wing-tip missile pods
 * and glowing nozzles. The nose points toward -Z, like the starfighter.
 */
export function createJetShip() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.2, roughness: 0.35 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.4 });
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, metalness: 0.3, roughness: 0.45 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xdfe9ff, metalness: 0.2, roughness: 0.4 });
  const coralMat = new THREE.MeshStandardMaterial({ color: 0xff6b5b, metalness: 0.2, roughness: 0.4 });

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3.0, 6, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 16), whiteMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.0;
  group.add(nose);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.3 })
  );
  canopy.scale.set(0.85, 0.7, 1.9);
  canopy.position.set(0, 0.45, -0.9);
  group.add(canopy);

  // Delta wings (the shape's Y runs along the ship's length once it is laid flat)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -1.4);
  wingShape.lineTo(3.5, 1.0);
  wingShape.lineTo(3.5, 1.6);
  wingShape.lineTo(0, 1.6);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  [1, -1].forEach(side => {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.x = Math.PI / 2;
    wing.scale.x = side;
    wing.position.set(0, -0.08, 0.5);
    group.add(wing);

    // wing-tip missile pod
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.1, 4, 10), coralMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 3.4, -0.08, 1.0);
    group.add(pod);
    const podTip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 10), whiteMat);
    podTip.rotation.x = -Math.PI / 2;
    podTip.position.set(side * 3.4, -0.08, 0.2);
    group.add(podTip);

    // twin tail fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.9), coralMat);
    fin.position.set(side * 0.55, 0.75, 1.5);
    fin.rotation.z = side * -0.22;
    group.add(fin);

    // engine nozzle and glow
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 14), navyMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.38, 0, 2.2);
    group.add(nozzle);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 14), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(side * 0.38, 0, 2.55);
    group.add(glow);
  });

  return group;
}

/**
 * An AI dogfighter: a toy fighter plane with swept wings and a twin tail. Built nose toward -Z
 * (like the player); the game turns it around to face the player.
 * `mats` lists its materials so the game can flash or glow them.
 */
export function createDogfighterMesh({ ace = false } = {}) {
  const group = new THREE.Group();
  const bodyColor = ace ? 0xffd23f : 0xff6b5b;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.15, roughness: 0.4 });
  const wingMat = new THREE.MeshStandardMaterial({ color: ace ? 0xfff3c4 : 0xffe1d6, metalness: 0.15, roughness: 0.45 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, metalness: 0.4, roughness: 0.15 });

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.0, 6, 14), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 14), whiteMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.9;
  group.add(nose);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), glassMat);
  canopy.scale.set(0.8, 0.7, 1.7);
  canopy.position.set(0, 0.4, -0.5);
  group.add(canopy);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.6);
  wingShape.lineTo(3.0, 0.9);
  wingShape.lineTo(3.0, 1.4);
  wingShape.lineTo(0, 1.0);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  const stripeGeo = new THREE.BoxGeometry(0.5, 0.05, 0.2);
  [1, -1].forEach(side => {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.x = Math.PI / 2;
    wing.scale.x = side;
    wing.position.set(0, -0.06, 0.3);
    group.add(wing);

    const tip = new THREE.Mesh(stripeGeo, whiteMat);
    tip.position.set(side * 2.8, 0.04, 1.2);
    group.add(tip);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.7), bodyMat);
    fin.position.set(side * 0.5, 0.65, 1.2);
    fin.rotation.z = side * -0.2;
    group.add(fin);
  });

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
  engine.rotation.x = Math.PI / 2;
  engine.position.z = 1.9;
  group.add(engine);

  const mats = [bodyMat, wingMat, whiteMat, glassMat];
  group.userData.mats = mats;
  return group;
}
