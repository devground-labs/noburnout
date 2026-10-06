import * as THREE from 'three';

export function createTankMesh(colorHex = 0x38bdf8, accentHex = 0x0284c7) {
  const group = new THREE.Group();

  // 1. Lower Chassis / Hull
  const hullGeo = new THREE.BoxGeometry(3.2, 1.1, 4.4);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.85,
    roughness: 0.25
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.9;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // 2. Colored Armor Plating
  const plateGeo = new THREE.BoxGeometry(3.0, 0.35, 4.0);
  const plateMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.7,
    roughness: 0.3,
    emissive: colorHex,
    emissiveIntensity: 0.15
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.y = 1.45;
  plate.castShadow = true;
  group.add(plate);

  // 3. Treads (Left & Right)
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    metalness: 0.95,
    roughness: 0.4
  });
  [-1.8, 1.8].forEach(x => {
    const treadGeo = new THREE.BoxGeometry(0.7, 1.1, 4.8);
    const tread = new THREE.Mesh(treadGeo, treadMat);
    tread.position.set(x, 0.55, 0);
    tread.castShadow = true;
    group.add(tread);

    // Tread Neon Accent Strip
    const stripGeo = new THREE.BoxGeometry(0.72, 0.12, 4.4);
    const stripMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(x, 1.05, 0);
    group.add(strip);
  });

  // 4. Turret Assembly (Revolving)
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 1.6, 0);

  const turretBaseGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.7, 16);
  const turretBaseMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.8,
    roughness: 0.25
  });
  const turretBase = new THREE.Mesh(turretBaseGeo, turretBaseMat);
  turretBase.position.y = 0.35;
  turretBase.castShadow = true;
  turretGroup.add(turretBase);

  // Turret Top Dome
  const domeGeo = new THREE.SphereGeometry(1.0, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, plateMat);
  dome.position.y = 0.7;
  dome.castShadow = true;
  turretGroup.add(dome);

  // Dual Cannon Barrels
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.9,
    roughness: 0.2
  });
  [-0.35, 0.35].forEach(x => {
    const barrelGeo = new THREE.CylinderGeometry(0.16, 0.18, 3.2, 12);
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, 0.6, 2.0);
    barrel.castShadow = true;
    turretGroup.add(barrel);

    // Muzzle tip glow
    const tipGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12);
    const tipMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(x, 0.6, 3.6);
    turretGroup.add(tip);
  });

  group.add(turretGroup);

  return {
    mesh: group,
    turret: turretGroup
  };
}
