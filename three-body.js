import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------- Settings ----------
const G = 1; // gravitational constant (simulation units)
const SOFTENING = 0.01; // stops the force exploding when two bodies get very close
const DT = 0.001; // physics time step (small = more accurate)
const SCALE = 10; // multiply positions by this when drawing so the scene is bigger
const MAX_TRAIL = 1500; // number of points kept in each trail
const COLORS = [0xff5555, 0x55ff88, 0x5599ff];

// ---------- Scene setup ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 18, 28);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// ---------- Depth cues ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// A floor grid gives your eye a reference plane when you rotate the view
const grid = new THREE.GridHelper(80, 40, 0x335577, 0x1a2a3a);
grid.position.y = -15;
scene.add(grid);

// Stars spread through 3D space: they shift against each other as you orbit (parallax)
const starPositions = [];
for (let i = 0; i < 800; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(80 + Math.random() * 120);
  starPositions.push(v.x, v.y, v.z);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8 })));

// ---------- Starting conditions ----------
// Each body: { m: mass, pos: Vector3, vel: Vector3 }

// A famous exact solution: three equal masses chase each other along a figure 8.
function figureEightFlat() {
  const x = 0.97000436, y = -0.24308753;
  const vx = 0.93240737, vy = 0.86473146;
  return [
    { m: 1, pos: new THREE.Vector3(x, y, 0), vel: new THREE.Vector3(vx / 2, vy / 2, 0) },
    { m: 1, pos: new THREE.Vector3(-x, -y, 0), vel: new THREE.Vector3(vx / 2, vy / 2, 0) },
    { m: 1, pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(-vx, -vy, 0) },
  ];
}

// The figure-eight really is flat, so we tilt the whole thing in 3D.
// Rotating positions AND velocities by the same angle keeps the physics identical.
function figureEight() {
  const list = figureEightFlat();
  const axis = new THREE.Vector3(1, 0.3, 0).normalize();
  list.forEach((b) => {
    b.pos.applyAxisAngle(axis, 0.9);
    b.vel.applyAxisAngle(axis, 0.9);
  });
  return list;
}

// Random positions and velocities. Almost always chaotic.
function randomSystem() {
  const rand = () => (Math.random() - 0.5) * 2; // -1 to 1
  const list = [0, 1, 2].map(() => ({
    m: 1,
    pos: new THREE.Vector3(rand() * 1.5, rand() * 1.5, rand() * 1.5),
    vel: new THREE.Vector3(rand() * 0.5, rand() * 0.5, rand() * 0.5),
  }));
  // Remove overall drift so the system stays near the middle of the screen
  const centerPos = new THREE.Vector3();
  const centerVel = new THREE.Vector3();
  list.forEach((b) => {
    centerPos.add(b.pos);
    centerVel.add(b.vel);
  });
  centerPos.divideScalar(3);
  centerVel.divideScalar(3);
  list.forEach((b) => {
    b.pos.sub(centerPos);
    b.vel.sub(centerVel);
  });
  return list;
}

// ---------- Physics ----------
// Newton's law: every body pulls on every other body.
function computeAccelerations(bodies) {
  const acc = bodies.map(() => new THREE.Vector3());
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const d = new THREE.Vector3().subVectors(bodies[j].pos, bodies[i].pos);
      const distSq = d.lengthSq() + SOFTENING * SOFTENING;
      const invDist3 = 1 / (distSq * Math.sqrt(distSq));
      // equal and opposite pulls
      acc[i].addScaledVector(d, G * bodies[j].m * invDist3);
      acc[j].addScaledVector(d, -G * bodies[i].m * invDist3);
    }
  }
  return acc;
}

// Leapfrog (velocity Verlet): much more stable for orbits than simple Euler.
function step(bodies, dt) {
  let acc = computeAccelerations(bodies);
  bodies.forEach((b, i) => {
    b.vel.addScaledVector(acc[i], dt / 2); // half kick
    b.pos.addScaledVector(b.vel, dt); // drift
  });
  acc = computeAccelerations(bodies);
  bodies.forEach((b, i) => {
    b.vel.addScaledVector(acc[i], dt / 2); // half kick
  });
}

// ---------- Visuals ----------
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = makeGlowTexture();

// One mesh (with glow) per body
const meshes = COLORS.map((color) => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 32, 32),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35, // lower = more visible shading
      roughness: 0.5,
    })
  );
  // Each body is also a light, so the bodies light up each other's sides
  mesh.add(new THREE.PointLight(color, 400));
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  glow.scale.set(3.5, 3.5, 1);
  mesh.add(glow);
  scene.add(mesh);
  return mesh;
});

// Trails: a line whose points we update every frame
function makeTrail(color) {
  const positions = new Float32Array(MAX_TRAIL * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })
  );
  line.frustumCulled = false;
  scene.add(line);
  return { line, positions, count: 0 };
}
const trails = COLORS.map(makeTrail);

function pushTrailPoint(trail, pos) {
  if (trail.count < MAX_TRAIL) {
    trail.count++;
  } else {
    trail.positions.copyWithin(0, 3); // drop the oldest point
  }
  const i = (trail.count - 1) * 3;
  trail.positions[i] = pos.x * SCALE;
  trail.positions[i + 1] = pos.y * SCALE;
  trail.positions[i + 2] = pos.z * SCALE;
  trail.line.geometry.attributes.position.needsUpdate = true;
  trail.line.geometry.setDrawRange(0, trail.count);
}

// ---------- State + controls ----------
let bodies = figureEight();
let paused = false;
let speed = 2;

function loadSystem(newBodies) {
  bodies = newBodies;
  trails.forEach((t) => {
    t.count = 0;
    t.line.geometry.setDrawRange(0, 0);
  });
}

document.getElementById("btn-eight").onclick = () => loadSystem(figureEight());
document.getElementById("btn-chaos").onclick = () => loadSystem(randomSystem());
document.getElementById("btn-pause").onclick = (e) => {
  paused = !paused;
  e.target.textContent = paused ? "Resume" : "Pause";
};
document.getElementById("speed").oninput = (e) => {
  speed = Number(e.target.value);
};

// ---------- Animation ----------
function animate() {
  requestAnimationFrame(animate);

  if (!paused) {
    // several small physics steps per drawn frame keeps it accurate
    const steps = speed * 8;
    for (let i = 0; i < steps; i++) step(bodies, DT);
  }

  bodies.forEach((b, i) => {
    meshes[i].position.copy(b.pos).multiplyScalar(SCALE);
    if (!paused) pushTrailPoint(trails[i], b.pos);
  });

  controls.update();
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});