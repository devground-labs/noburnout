import * as THREE from 'three';

/**
 * 3D Cricket Stadium, Pitch, Wickets, Batsman & Bowler Models
 */

// =========================================================================
// 1. Stadium, Outfield Turf & Grandstands
// =========================================================================
export function createCricketStadium() {
  const stadiumGroup = new THREE.Group();

  // Outfield Oval with alternating lawn mower rings/stripes
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Base grass
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, 1024, 1024);

  // Concentric mowed grass bands
  const bands = 16;
  for (let i = bands; i >= 1; i--) {
    const r = (512 / bands) * i;
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#15803d';
    ctx.fill();
  }

  // Radial mower stripes
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.arc(512, 512, 500, a, a + Math.PI / 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();
  }

  // 30-yard inner fielding circle
  ctx.beginPath();
  ctx.arc(512, 512, 230, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Boundary rope line
  ctx.beginPath();
  ctx.arc(512, 512, 490, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();

  const turfTexture = new THREE.CanvasTexture(canvas);
  turfTexture.wrapS = THREE.ClampToEdgeWrapping;
  turfTexture.wrapT = THREE.ClampToEdgeWrapping;

  const outfieldGeo = new THREE.PlaneGeometry(120, 110, 32, 32);
  const outfieldMat = new THREE.MeshStandardMaterial({
    map: turfTexture,
    roughness: 0.85,
    metalness: 0.08
  });
  const outfield = new THREE.Mesh(outfieldGeo, outfieldMat);
  outfield.rotation.x = -Math.PI / 2;
  outfield.receiveShadow = true;
  stadiumGroup.add(outfield);

  // 3D Boundary Foam Toblerones / LED Boards along perimeter (radius ~52m)
  const boundaryRadius = 52;
  const boardCount = 44;
  const boardGeo = new THREE.BoxGeometry(7.0, 0.9, 0.8);
  const boardMatA = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4, metalness: 0.6 });
  const boardMatB = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.6 });

  for (let i = 0; i < boardCount; i++) {
    const angle = (i / boardCount) * Math.PI * 2;
    const bx = Math.cos(angle) * boundaryRadius;
    const bz = Math.sin(angle) * (boundaryRadius * 0.92);
    const board = new THREE.Mesh(boardGeo, i % 2 === 0 ? boardMatA : boardMatB);
    board.position.set(bx, 0.45, bz);
    board.rotation.y = -angle + Math.PI / 2;
    board.receiveShadow = true;
    stadiumGroup.add(board);
  }

  // 22-Yard Central Clay/Turf Pitch (width 3.4m, length 22m)
  const pitchGeo = new THREE.PlaneGeometry(3.6, 22.5);
  const pitchCanvas = document.createElement('canvas');
  pitchCanvas.width = 128;
  pitchCanvas.height = 512;
  const pCtx = pitchCanvas.getContext('2d');

  // Hard dry buff clay
  pCtx.fillStyle = '#b59a6d';
  pCtx.fillRect(0, 0, 128, 512);

  // Subtle turf scuffs & footmarks
  pCtx.fillStyle = '#8f774f';
  for (let i = 0; i < 40; i++) {
    const rx = Math.random() * 128;
    const ry = Math.random() * 512;
    pCtx.fillRect(rx, ry, Math.random() * 8, Math.random() * 14);
  }

  // Bowling & Popping Creases (batsman end ~y=460, bowler end ~y=52)
  pCtx.fillStyle = '#ffffff';
  pCtx.fillRect(16, 440, 96, 4); // Batsman popping crease
  pCtx.fillRect(16, 68, 96, 4);  // Bowler popping crease
  pCtx.fillRect(24, 460, 80, 3); // Stumps line
  pCtx.fillRect(24, 48, 80, 3);

  const pitchTex = new THREE.CanvasTexture(pitchCanvas);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: pitchTex,
    roughness: 0.9,
    metalness: 0.05
  });
  const pitch = new THREE.Mesh(pitchGeo, pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.02, 0);
  pitch.receiveShadow = true;
  stadiumGroup.add(pitch);

  // Stadium Stands Bowl & Spectator Tiers
  const standsGroup = new THREE.Group();
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const rIn = boundaryRadius + 2.5 + t * 4.2;
    const rOut = rIn + 4.2;
    const h = 2.0 + t * 3.4;

    const tierGeo = new THREE.CylinderGeometry(rOut, rIn, 3.2, 48, 1, true);
    const tierMat = new THREE.MeshStandardMaterial({
      color: t % 2 === 0 ? 0x1e293b : 0x0f172a,
      roughness: 0.8
    });
    const tierMesh = new THREE.Mesh(tierGeo, tierMat);
    tierMesh.position.y = h;
    standsGroup.add(tierMesh);

    // Colorful crowd seats layer
    const crowdGeo = new THREE.CylinderGeometry(rOut * 0.99, rIn * 1.01, 0.4, 48, 1, true);
    const crowdMat = new THREE.MeshStandardMaterial({
      color: [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0x8b5cf6][t % 5],
      roughness: 0.6
    });
    const crowdMesh = new THREE.Mesh(crowdGeo, crowdMat);
    crowdMesh.position.y = h + 1.6;
    standsGroup.add(crowdMesh);
  }
  stadiumGroup.add(standsGroup);

  // 4 Massive Stadium Floodlight Towers
  const towerPositions = [
    { x: -55, z: -50, angle: Math.PI / 4 },
    { x: 55, z: -50, angle: -Math.PI / 4 },
    { x: -55, z: 50, angle: (3 * Math.PI) / 4 },
    { x: 55, z: 50, angle: -(3 * Math.PI) / 4 }
  ];

  towerPositions.forEach(tp => {
    const mast = new THREE.Group();
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });

    // Lattice Pylon
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 34, 6), mastMat);
    pylon.position.y = 17;
    pylon.castShadow = true;
    mast.add(pylon);

    // Floodlight Head Bank
    const bankGeo = new THREE.BoxGeometry(9, 4.5, 1.2);
    const bank = new THREE.Mesh(bankGeo, mastMat);
    bank.position.set(0, 34, 0);
    bank.rotation.x = 0.4;
    mast.add(bank);

    // Glowing Bulb Panel
    const bulbPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 4.0),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    bulbPanel.position.set(0, 34, 0.65);
    bulbPanel.rotation.x = 0.4;
    mast.add(bulbPanel);

    // SpotLight focused towards pitch center
    const spot = new THREE.SpotLight(0xffffff, 1.8, 110, Math.PI / 3.5, 0.4, 1.0);
    spot.position.set(0, 34, 0.8);
    spot.target.position.set(0, 0, 0);
    mast.add(spot);
    mast.add(spot.target);

    mast.position.set(tp.x, 0, tp.z);
    mast.rotation.y = tp.angle;
    stadiumGroup.add(mast);
  });

  return stadiumGroup;
}

// =========================================================================
// 2. Interactive Stumps & Bails (Batsman and Bowler Ends)
// =========================================================================
export function createWicketsSet(posZ = 9.8) {
  const group = new THREE.Group();
  group.position.set(0, 0, posZ);

  const stumpMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // Amber polish
    roughness: 0.35,
    metalness: 0.15
  });

  const stumps = [];
  // 3 Stumps spaced at 0.11m
  const stumpX = [-0.11, 0, 0.11];
  stumpX.forEach((x, idx) => {
    const geo = new THREE.CylinderGeometry(0.024, 0.024, 0.72, 12);
    const stump = new THREE.Mesh(geo, stumpMat);
    stump.position.set(x, 0.36, 0);
    stump.castShadow = true;
    group.add(stump);
    stumps.push({ mesh: stump, origPos: new THREE.Vector3(x, 0.36, 0) });
  });

  // 2 Wooden Bails resting atop stumps
  const bailMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.3,
    metalness: 0.1
  });
  const bails = [];
  [-0.055, 0.055].forEach((x, idx) => {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8);
    const bail = new THREE.Mesh(geo, bailMat);
    bail.rotation.z = Math.PI / 2;
    bail.position.set(x, 0.73, 0);
    bail.castShadow = true;
    group.add(bail);
    bails.push({ mesh: bail, origPos: new THREE.Vector3(x, 0.73, 0) });
  });

  return {
    group,
    stumps,
    bails,
    reset() {
      stumps.forEach(s => {
        s.mesh.position.copy(s.origPos);
        s.mesh.rotation.set(0, 0, 0);
      });
      bails.forEach(b => {
        b.mesh.position.copy(b.origPos);
        b.mesh.rotation.set(0, 0, Math.PI / 2);
      });
    },
    scatter(impactVelocity) {
      stumps.forEach((s, idx) => {
        s.mesh.rotation.x = 0.5 + Math.random() * 0.8;
        s.mesh.rotation.z = (idx - 1) * 0.4 + (Math.random() - 0.5) * 0.5;
        s.mesh.position.y = 0.25;
        s.mesh.position.z += 0.3 + Math.random() * 0.4;
      });
      bails.forEach((b, idx) => {
        b.mesh.position.y = 1.1 + Math.random() * 0.6;
        b.mesh.position.x += (idx === 0 ? -0.4 : 0.4) + (Math.random() - 0.5) * 0.3;
        b.mesh.position.z += 0.8 + Math.random() * 0.6;
        b.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      });
    }
  };
}

// =========================================================================
// 3. 3D Batsman Figure with Articulated Bat
// =========================================================================
export function createBatsmanModel() {
  const batsmanGroup = new THREE.Group();

  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }); // Team Blue
  const goldAccentMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xddb18f, roughness: 0.6 });
  const willowMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.3 }); // English Willow

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), jerseyMat);
  torso.position.y = 1.25;
  torso.castShadow = true;
  batsmanGroup.add(torso);

  // Jersey Gold Accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.33), goldAccentMat);
  stripe.position.set(0, 1.35, 0);
  batsmanGroup.add(stripe);

  // Head with Helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
  head.position.set(0, 1.78, 0);
  batsmanGroup.add(head);

  // Helmet Shell & Visor
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.7), jerseyMat);
  helmet.position.set(0, 1.82, 0);
  batsmanGroup.add(helmet);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 }));
  grille.position.set(0, 1.74, 0.15);
  batsmanGroup.add(grille);

  // Legs with Cricket Batting Pads
  [-0.16, 0.16].forEach(x => {
    // Upper leg
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), pantsMat);
    thigh.position.set(x, 0.75, 0);
    thigh.castShadow = true;
    batsmanGroup.add(thigh);

    // Shin Pad
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 0.22), padMat);
    pad.position.set(x, 0.32, 0.03);
    pad.castShadow = true;
    batsmanGroup.add(pad);
  });

  // Articulated Arms & Bat Assembly
  const batPivot = new THREE.Group();
  batPivot.position.set(0.18, 1.35, 0.1);

  // Hands & Batting Gloves
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.16), padMat);
  glove.position.set(0, -0.22, 0);
  batPivot.add(glove);

  // Cricket Bat (Blade, Handle, Grip)
  const batGroup = new THREE.Group();
  batGroup.position.set(0, -0.25, 0);

  // Handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  handle.position.y = -0.15;
  batGroup.add(handle);

  // Blade
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.68, 0.04), willowMat);
  blade.position.set(0, -0.62, 0);
  blade.castShadow = true;
  batGroup.add(blade);

  // Bat Colored Rubber Grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.15, 8), goldAccentMat);
  grip.position.y = -0.12;
  batGroup.add(grip);

  batPivot.add(batGroup);
  batsmanGroup.add(batPivot);

  // Default Stance: side-on facing bowler (bowler is in -Z direction)
  batsmanGroup.rotation.y = Math.PI / 2; // Facing off-side, looking towards bowler
  batPivot.rotation.x = 0.5; // Bat tapped behind toes

  return {
    mesh: batsmanGroup,
    batPivot,
    batGroup,
    playSwingAnimation(shotType = 'DRIVE', callback = null) {
      // Dynamic shot swing
      const startTime = performance.now();
      const duration = 320; // ms

      const animateSwing = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);

        if (progress < 0.4) {
          // Downswing into impact
          const p = progress / 0.4;
          batPivot.rotation.x = 0.5 - p * 1.8;
          if (shotType === 'PULL') batPivot.rotation.y = -p * 1.2;
          else if (shotType === 'CUT') batPivot.rotation.y = p * 1.0;
        } else {
          // Follow-through
          const p = (progress - 0.4) / 0.6;
          batPivot.rotation.x = -1.3 + (1 - p) * 0.3;
          if (progress >= 1.0) {
            // Reset to ready stance
            setTimeout(() => {
              batPivot.rotation.set(0.5, 0, 0);
              if (callback) callback();
            }, 180);
            return;
          }
        }
        requestAnimationFrame(animateSwing);
      };
      requestAnimationFrame(animateSwing);
    }
  };
}

// =========================================================================
// 4. 3D Bowler Figure
// =========================================================================
export function createBowlerModel() {
  const group = new THREE.Group();

  const jerseyMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 }); // Team Gold/Orange
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xddb18f, roughness: 0.6 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), jerseyMat);
  torso.position.y = 1.25;
  torso.castShadow = true;
  group.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
  head.position.set(0, 1.76, 0);
  group.add(head);

  // Legs
  [-0.14, 0.14].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.18), pantsMat);
    leg.position.set(x, 0.44, 0);
    leg.castShadow = true;
    group.add(leg);
  });

  // Bowling Arm with pivot
  const armPivot = new THREE.Group();
  armPivot.position.set(0.28, 1.48, 0);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), jerseyMat);
  arm.position.y = -0.3;
  arm.castShadow = true;
  armPivot.add(arm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skinMat);
  hand.position.y = -0.65;
  armPivot.add(hand);

  group.add(armPivot);

  group.position.set(0, 0, -11.0); // Bowling crease

  return {
    mesh: group,
    armPivot,
    playDeliveryAction(callback = null) {
      const startTime = performance.now();
      const duration = 650; // ms

      const animateArm = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);

        // Windup & 360-degree bowling arm revolution
        armPivot.rotation.x = -progress * Math.PI * 2;

        if (progress < 1.0) {
          requestAnimationFrame(animateArm);
        } else {
          armPivot.rotation.x = 0;
          if (callback) callback();
        }
      };
      requestAnimationFrame(animateArm);
    }
  };
}

// =========================================================================
// 5. Pink / White Seam Leather Cricket Ball
// =========================================================================
export function createCricketBall() {
  const group = new THREE.Group();

  // Pink Leather Ball (High visibility under stadium floodlights)
  const ballGeo = new THREE.SphereGeometry(0.16, 24, 24);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e, // Radiant Pink leather
    roughness: 0.28,
    metalness: 0.12
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  group.add(ball);

  // White Raised Stitching Seam
  const seamGeo = new THREE.TorusGeometry(0.161, 0.012, 8, 32);
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const seam = new THREE.Mesh(seamGeo, seamMat);
  group.add(seam);

  return {
    mesh: group,
    ball
  };
}
