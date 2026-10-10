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
