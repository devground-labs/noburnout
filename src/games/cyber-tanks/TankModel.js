import * as THREE from 'three';

/**
 * Procedural High-Detail Sci-Fi Combat Hover/Tread Tank
 * Matched 1:1 with random/tanks.html
 */
export function buildTankMesh(primaryColor = 0x0284c7, glowColor = 0x06b6d4) {
  const tank = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.6,
    roughness: 0.35
  });

  const armorMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.65,
    roughness: 0.25
  });

  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.2
  });

  // 1. Lower Track Units (Left & Right)
  const trackGeo = new THREE.BoxGeometry(0.5, 0.65, 3.4);
  const lTrack = new THREE.Mesh(trackGeo, treadMat);
  lTrack.position.set(-1.1, 0.32, 0);
  lTrack.castShadow = true;
  tank.add(lTrack);

  const rTrack = new THREE.Mesh(trackGeo, treadMat);
  rTrack.position.set(1.1, 0.32, 0);
  rTrack.castShadow = true;
  tank.add(rTrack);

  // Track Drive Sprockets (4 pairs on each tread)
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.52, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
  [-1.2, -0.4, 0.4, 1.2].forEach(z => {
    const wl = new THREE.Mesh(wheelGeo, wheelMat);
    wl.rotation.z = Math.PI / 2;
    wl.position.set(-1.1, 0.3, z);
    tank.add(wl);

    const wr = new THREE.Mesh(wheelGeo, wheelMat);
    wr.rotation.z = Math.PI / 2;
    wr.position.set(1.1, 0.3, z);
    tank.add(wr);
  });

  // 2. Main Chassis Hull
  const hullGeo = new THREE.BoxGeometry(1.9, 0.65, 3.0);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.set(0, 0.55, 0);
  hull.castShadow = true;
  tank.add(hull);

  // Sloped front glacis armor plate
  const glacisGeo = new THREE.BoxGeometry(1.85, 0.4, 1.1);
  const glacis = new THREE.Mesh(glacisGeo, armorMat);
  glacis.position.set(0, 0.68, 1.1);
  glacis.rotation.x = -0.35;
  glacis.castShadow = true;
  tank.add(glacis);

  // Side armor skirts with team glow strip
  const skirtGeo = new THREE.BoxGeometry(0.12, 0.35, 2.9);
  const lSkirt = new THREE.Mesh(skirtGeo, armorMat);
  lSkirt.position.set(-1.38, 0.45, 0);
  tank.add(lSkirt);
  const rSkirt = new THREE.Mesh(skirtGeo, armorMat);
  rSkirt.position.set(1.38, 0.45, 0);
  tank.add(rSkirt);

  // Glowing team identity LED stripes
  const stripMat = new THREE.MeshBasicMaterial({ color: glowColor });
  const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.7), stripMat);
  stripL.position.set(-1.45, 0.52, 0);
  tank.add(stripL);
  const stripR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.7), stripMat);
  stripR.position.set(1.45, 0.52, 0);
  tank.add(stripR);

  // High-intensity front LED combat headlights
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.1), headLightMat);
  hlL.position.set(-0.65, 0.72, 1.55);
  tank.add(hlL);
  const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.1), headLightMat);
  hlR.position.set(0.65, 0.72, 1.55);
  tank.add(hlR);

  // Cyber combat vehicle underglow
  const underglow = new THREE.PointLight(glowColor, 1.2, 7);
  underglow.position.set(0, 0.25, 0);
  tank.add(underglow);

  // 3. Rotating Turret
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 0.9, -0.1);

  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.55, 16), armorMat);
  turretBase.position.y = 0.25;
  turretBase.castShadow = true;
  turretGroup.add(turretBase);

  // Commander Cupola
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.25, 12), hullMat);
  cupola.position.set(-0.35, 0.58, -0.2);
  turretGroup.add(cupola);

  // Dual Missile Launcher Pods on sides of turret
  const podGeo = new THREE.BoxGeometry(0.45, 0.45, 1.5);
  const podMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });

  const lPod = new THREE.Mesh(podGeo, podMat);
  lPod.position.set(-0.95, 0.35, 0.2);
  lPod.castShadow = true;
  turretGroup.add(lPod);

  const rPod = new THREE.Mesh(podGeo, podMat);
  rPod.position.set(0.95, 0.35, 0.2);
  rPod.castShadow = true;
  turretGroup.add(rPod);

  // Main High-Velocity Cannon
  const cannonGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.4, 16);
  const cannon = new THREE.Mesh(cannonGeo, hullMat);
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, 0.32, 1.4);
  cannon.castShadow = true;
  turretGroup.add(cannon);

  // Heavy Muzzle Brake
  const muzzleGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.35, 12);
  const muzzle = new THREE.Mesh(muzzleGeo, armorMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.32, 2.6);
  turretGroup.add(muzzle);

  tank.add(turretGroup);
  tank.userData.turret = turretGroup;
  tank.userData.cannon = cannon;

  return tank;
}

// Alias for backwards compatibility
export const createTankMesh = buildTankMesh;
