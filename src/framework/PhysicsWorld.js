import * as CANNON from 'cannon-es';

/**
 * Physics World Manager based on Cannon-es
 * Manages rigid bodies, collisions, materials, and step simulation.
 */
export class PhysicsWorld {
  constructor(options = {}) {
    this.gravity = options.gravity || new CANNON.Vec3(0, -9.82, 0);
    this.world = new CANNON.World({
      gravity: this.gravity
    });

    // Broadphase & Solver setup
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 10;

    // Default Material
    this.defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.2
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
    this.world.defaultContactMaterial = defaultContactMaterial;

    // Track active meshes mapped to bodies
    this.bindings = [];
  }

  setGravity(x, y, z) {
    this.world.gravity.set(x, y, z);
  }

  createBox(size = { x: 1, y: 1, z: 1 }, mass = 1, pos = { x: 0, y: 0, z: 0 }, material = null) {
    const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const shape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass,
      shape,
      material: material || this.defaultMaterial,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z)
    });
    this.world.addBody(body);
    return body;
  }

  createSphere(radius = 1, mass = 1, pos = { x: 0, y: 0, z: 0 }, material = null) {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass,
      shape,
      material: material || this.defaultMaterial,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z)
    });
    this.world.addBody(body);
    return body;
  }

  createGroundPlane(material = null) {
    const shape = new CANNON.Plane();
    const body = new CANNON.Body({
      mass: 0, // static
      shape,
      material: material || this.defaultMaterial
    });
    // Rotate to face upwards (XZ plane)
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(body);
    return body;
  }

  bind(mesh, body) {
    this.bindings.push({ mesh, body });
  }

  unbind(body) {
    this.bindings = this.bindings.filter(b => b.body !== body);
    this.world.removeBody(body);
  }

  step(dt) {
    // Fixed step: 1/60 with delta time clamping
    const fixedTimeStep = 1 / 60;
    const maxSubSteps = 3;
    this.world.step(fixedTimeStep, Math.min(dt, 0.1), maxSubSteps);

    // Sync Three.js meshes
    for (let i = 0; i < this.bindings.length; i++) {
      const { mesh, body } = this.bindings[i];
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  clear() {
    this.bindings.length = 0;
    while (this.world.bodies.length > 0) {
      this.world.removeBody(this.world.bodies[0]);
    }
  }
}
