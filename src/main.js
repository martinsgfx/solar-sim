import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------- Scene setup ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 25, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement); // drag to rotate, scroll to zoom

// ---------- Sun + glow ----------
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(5, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffdd55 })
);
scene.add(sun);
scene.add(new THREE.PointLight(0xffffff, 3000));
scene.add(new THREE.AmbientLight(0xffffff, 0.2));

// Draws a soft radial gradient (bright center, fading edges) onto a canvas
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255, 230, 150, 1)");
  g.addColorStop(0.25, "rgba(255, 180, 60, 0.6)");
  g.addColorStop(0.6, "rgba(255, 120, 20, 0.15)");
  g.addColorStop(1.0, "rgba(255, 100, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeGlow(scale, opacity) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending, // colors add up, so it looks like light
      transparent: true,
      depthWrite: false,
      opacity,
    })
  );
  sprite.scale.set(scale, scale, 1);
  sun.add(sprite); // sprites always face the camera
  return sprite;
}

const innerGlow = makeGlow(22, 1);
const outerGlow = makeGlow(50, 0.5);

// ---------- Earth + Moon ----------
// Pivot that makes Earth orbit the Sun
const earthOrbit = new THREE.Group();
scene.add(earthOrbit);

// Earth + Moon travel together, offset from the Sun
const earthSystem = new THREE.Group();
earthSystem.position.x = 25;
earthOrbit.add(earthSystem);

// Earth itself (tilted, spins on its own axis)
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1.5, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0x2a6fdb, flatShading: true })
);
earth.rotation.z = THREE.MathUtils.degToRad(23.5); // axial tilt
earthSystem.add(earth);

// Pivot that makes the Moon orbit Earth
const moonOrbit = new THREE.Group();
earthSystem.add(moonOrbit);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
);
moon.position.x = 4;
moonOrbit.add(moon);

// ---------- Orbit lines ----------
function makeOrbitLine(radius, color, opacity) {
  const points = [];
  const segments = 128; // more segments = smoother circle
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineLoop(geometry, material); // LineLoop joins the last point back to the first
}

const earthPath = makeOrbitLine(25, 0x4488ff, 0.5); // matches earthSystem.position.x
scene.add(earthPath); // stays centered on the Sun

const moonPath = makeOrbitLine(4, 0xaaaaaa, 0.6); // matches moon.position.x
earthSystem.add(moonPath); // child of earthSystem, so it follows Earth

// ---------- Camera views ----------
const ZERO = new THREE.Vector3(0, 0, 0);

const views = {
  overview: { pos: new THREE.Vector3(0, 25, 45), follow: false },
  top: { pos: new THREE.Vector3(0, 70, 0.1), follow: false },
  earth: { offset: new THREE.Vector3(6, 3, 8), follow: true },
};

const earthPos = new THREE.Vector3();
const prevEarthPos = new THREE.Vector3();
let followEarth = false;
let tween = null;

function setView(name) {
  const v = views[name];
  followEarth = false; // pause following while we glide to the new view
  tween = {
    t: 0,
    view: v,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
  };
}

// ---------- UI buttons ----------
const ui = document.createElement("div");
ui.style.cssText = "position:fixed;top:12px;left:12px;display:flex;gap:8px;";
[
  ["overview", "1 · Overview"],
  ["top", "2 · Top-down"],
  ["earth", "3 · Follow Earth"],
].forEach(([name, label]) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = "padding:8px 12px;border-radius:8px;border:0;cursor:pointer;";
  b.onclick = () => setView(name);
  ui.appendChild(b);
});
document.body.appendChild(ui);

// ---------- Keyboard ----------
addEventListener("keydown", (e) => {
  if (e.key === "1") setView("overview");
  if (e.key === "2") setView("top");
  if (e.key === "3") setView("earth");
  if (e.key.toLowerCase() === "o") {
    // toggle orbit lines
    earthPath.visible = !earthPath.visible;
    moonPath.visible = !moonPath.visible;
  }
});

// ---------- Animation ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  earthOrbit.rotation.y += 0.002; // Earth around Sun
  earth.rotation.y += 0.02; // Earth around its axis
  moonOrbit.rotation.y += 0.01; // Moon around Earth

  // Gentle pulsing glow
  const pulse = Math.sin(time * 2) * 0.5;
  innerGlow.scale.set(22 + pulse, 22 + pulse, 1);
  outerGlow.scale.set(50 + pulse * 2, 50 + pulse * 2, 1);

  // Camera
  earth.getWorldPosition(earthPos);

  if (tween) {
    tween.t = Math.min(tween.t + 0.02, 1);
    const k = tween.t * tween.t * (3 - 2 * tween.t); // smooth ease in/out
    const toTarget = tween.view.follow ? earthPos : ZERO;
    const toPos = tween.view.follow
      ? earthPos.clone().add(tween.view.offset)
      : tween.view.pos;
    camera.position.lerpVectors(tween.fromPos, toPos, k);
    controls.target.lerpVectors(tween.fromTarget, toTarget, k);
    if (tween.t === 1) {
      followEarth = tween.view.follow;
      tween = null;
    }
  } else if (followEarth) {
    // Move the camera along with Earth so it stays in frame
    camera.position.add(earthPos.clone().sub(prevEarthPos));
    controls.target.copy(earthPos);
  }
  prevEarthPos.copy(earthPos);

  controls.update();
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});


const link = document.createElement("a");
link.href = "/three-body.html";
link.textContent = "Three-body problem →";
link.style.cssText = "position:fixed;top:12px;right:12px;color:#8ab4ff;font-family:system-ui;";
document.body.appendChild(link);