import * as THREE from 'three';

export function createFighterShip() {
  const group = new THREE.Group();

  // 1. Sleek Fuselage
  const bodyGeo = new THREE.ConeGeometry(0.9, 4.2, 8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
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
    color: 0x1e293b,
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

  const mat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.85,
    metalness: 0.15,
    flatShading: true
  });
  return new THREE.Mesh(geo, mat);
}
