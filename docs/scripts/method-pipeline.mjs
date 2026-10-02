import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sequenceState } from './method-timeline.mjs?v=kimodo-stop-142';
import { createCameraPath, fitCameraDistances, followCamera } from './method-camera.mjs?v=kimodo-final-front-4';

const figure = document.querySelector('#method-pipeline');
const surface = figure.querySelector('.pipeline-stages');
const status = figure.querySelector('.pipeline-status');
const assetRoot = new URL('../media/method-pipeline/', import.meta.url);
const loader = new GLTFLoader();
const modelCache = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, views, stages, loading = false, visible = false;
let elapsed = 0, previous = null, animation = 0, finished = false;
let cycleDuration = 0;
const variantColors = [0xc2814f, 0xd2a044, 0x79956f, 0x668da2, 0x9a74a5];

async function getFile(name) {
  const response = await fetch(new URL(name, assetRoot), name === 'manifest.json' ? { cache: 'no-store' } : undefined);
  if (!response.ok) throw new Error(`Unable to load ${name}: ${response.status}`);
  return response;
}

async function binary(name, ArrayType) {
  const response = await getFile(name);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new ArrayType(await new Response(stream).arrayBuffer());
}

async function model(name) {
  if (!modelCache.has(name)) {
    modelCache.set(name, name.endsWith('.gz')
      ? binary(name, Uint8Array).then(data => loader.parseAsync(data.buffer, assetRoot.href))
      : loader.loadAsync(new URL(name, assetRoot).href));
  }
  return (await modelCache.get(name)).scene.clone(true);
}

function materialize(root, kind, variant = 0, variants = 1) {
  root.traverse(node => {
    if (!node.isMesh) return;
    if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
    node.material = kind === 'object'
      ? new THREE.MeshStandardMaterial({ color: 0xc2814f, flatShading: true, roughness: .82, metalness: .03 })
      : new THREE.MeshStandardMaterial({
          color: variants > 1 ? new THREE.Color(variantColors[variant]).lerp(new THREE.Color(0xffffff), .55) : 0xffffff,
          vertexColors: true, roughness: .58, metalness: .22,
        });
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

async function makeView(stage, index) {
  const element = surface.children[index];
  const viewport = element.querySelector('.pipeline-viewport');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eae9e3');
  scene.fog = new THREE.Fog('#eae9e3', 10, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8d79, 2.7));
  const light = new THREE.DirectionalLight(0xfff6e6, 3.4);
  light.position.set(-3, -4, 7);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 18 });
  light.shadow.bias = -.0003;
  light.shadow.normalBias = .015;
  scene.add(light);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe5e5dc, roughness: 1 }));
  floor.receiveShadow = true;
  floor.position.z = -.035;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, 0xc5c9bd, 0xd7d9cf);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -.03;
  grid.material.transparent = true;
  grid.material.opacity = .6;
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(38, 1, .02, 60);
  camera.up.set(0, 0, 1);
  const definitions = stage.trajectories ?? [{ id: stage.id, frames: stage.frames, poses: stage.poses }];
  const poseSets = await Promise.all(definitions.map(definition => binary(definition.poses, Float32Array)));
  poseSets.forEach((poses, i) => {
    if (poses.length !== definitions[i].frames * stage.stride || !poses.every(Number.isFinite)) throw new Error('Invalid motion data');
  });
  const view = { stage, element, viewport, scene, camera, frame: -1, tracks: [] };
  if (stage.robot) {
    const [objects, robots] = await Promise.all([
      Promise.all(definitions.map(() => model(stage.object))),
      Promise.all(definitions.map(() => model(stage.robot))),
    ]);
    for (let i = 0; i < definitions.length; i++) {
      const object = objects[i], robot = robots[i], bodies = [];
      materialize(object, 'object', i, definitions.length);
      materialize(robot, 'robot', i, definitions.length);
      scene.add(object);
      for (const name of stage.bodyNames) {
        const group = new THREE.Group();
        robot.traverse(node => { if (node.isMesh && node.name.split('__')[0] === name) group.add(node.clone()); });
        scene.add(group);
        bodies.push(group);
      }
      view.tracks.push({ definition: definitions[i], poses: poseSets[i], object, bodies });
    }
  } else {
    const object = await model(stage.object);
    materialize(object, 'object');
    scene.add(object);
    const [vertices, faces] = await Promise.all([binary(stage.vertices, Uint16Array), binary(stage.faces, Uint16Array)]);
    if (vertices.length !== stage.frames * stage.vertexCount * 3) throw new Error('Invalid human motion data');
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(faces, 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stage.vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const human = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x88a6be, roughness: .72, side: THREE.DoubleSide }));
    human.frustumCulled = false;
    human.castShadow = true;
    human.receiveShadow = true;
    scene.add(human);
    Object.assign(view, { vertices, human });
    view.tracks.push({ definition: definitions[0], poses: poseSets[0], object, bodies: [] });
  }
  element.dataset.trajectories = definitions.length;
  if (stage.robot) view.cameraPath = createCameraPath(stage, view.tracks);
  return view;
}

function applyFrame(view, frame) {
  if (view.frame === frame) return;
  view.frame = frame;
  view.element.dataset.frame = frame;
  const { stage } = view;
  for (const track of view.tracks) {
    const { poses, bodies, object, definition } = track;
    const trackFrame = Math.min(frame, definition.frames - 1);
    let offset = trackFrame * stage.stride;
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].position.fromArray(poses, offset + i * 3);
      const q = offset + bodies.length * 3 + i * 4;
      bodies[i].quaternion.set(poses[q + 1], poses[q + 2], poses[q + 3], poses[q]);
    }
    offset += bodies.length * 7;
    object.position.fromArray(poses, offset);
    object.quaternion.set(poses[offset + 4], poses[offset + 5], poses[offset + 6], poses[offset + 3]);
  }
  if (view.human) {
    const position = view.human.geometry.attributes.position;
    const start = frame * stage.vertexCount * 3;
    for (let i = 0; i < position.array.length; i++) position.array[i] = view.vertices[start + i] * stage.scale[i % 3] + stage.offset[i % 3];
    position.needsUpdate = true;
    view.human.geometry.computeVertexNormals();
  }
  if (view.cameraPath && view.cameraDistances) followCamera(view.camera, view.cameraPath, frame, view.cameraDistances);
}

function draw() {
  if (!views) return;
  const rect = surface.getBoundingClientRect();
  renderer.setScissorTest(false);
  // Scene backgrounds affect the clear state; reset it before clearing the gaps.
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const view of views) {
    const box = view.viewport.getBoundingClientRect();
    const x = box.left - rect.left, y = rect.bottom - box.bottom;
    renderer.setViewport(x, y, box.width, box.height);
    renderer.setScissor(x, y, box.width, box.height);
    renderer.render(view.scene, view.camera);
  }
}

function clipCanvasToCards() {
  // The shared canvas is a sibling of the cards, so their overflow cannot clip it.
  const surfaceBox = surface.getBoundingClientRect();
  const paths = views.map(({ element }) => {
    const box = element.getBoundingClientRect();
    const x = box.left - surfaceBox.left, y = box.top - surfaceBox.top;
    const right = x + box.width, bottom = y + box.height;
    const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius), box.width / 2, box.height / 2);
    return `M ${x + radius} ${y} H ${right - radius} A ${radius} ${radius} 0 0 1 ${right} ${y + radius}
      V ${bottom - radius} A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}
      H ${x + radius} A ${radius} ${radius} 0 0 1 ${x} ${bottom - radius}
      V ${y + radius} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
  });
  renderer.domElement.style.clipPath = `path("${paths.join(' ').replace(/\s+/g, ' ')}")`;
}

function resize() {
  if (!views) return;
  renderer.setSize(surface.clientWidth, surface.clientHeight, false);
  clipCanvasToCards();
  for (const view of views) {
    const camera = view.camera;
    camera.aspect = view.viewport.clientWidth / view.viewport.clientHeight;
    view.cameraDistances = fitCameraDistances(view.cameraPath, camera);
    followCamera(camera, view.cameraPath, view.frame, view.cameraDistances);
    camera.updateProjectionMatrix();
  }
  draw();
}

function update() {
  const state = sequenceState(stages, elapsed);
  state.forEach((item, i) => {
    const view = views[i];
    applyFrame(view, item.frame);
    view.element.classList.toggle('is-active', item.active);
    view.element.classList.toggle('is-complete', item.complete);
    view.element.querySelector('.pipeline-progress span').style.transform = `scaleX(${item.progress})`;
  });
  finished = state.every(item => item.complete);
  figure.dataset.state = finished ? 'complete' : 'playing';
  draw();
}

function tick(now) {
  animation = 0;
  if (!visible || document.hidden || finished) { previous = null; return; }
  if (previous !== null) elapsed = (elapsed + (now - previous) / 1000) % cycleDuration;
  previous = now;
  update();
  if (!finished) animation = requestAnimationFrame(tick);
}

function resume() {
  if (views && visible && !document.hidden && !finished && !animation) {
    previous = null;
    animation = requestAnimationFrame(tick);
  }
}

function respectMotionPreference() {
  if (!views || !reducedMotion.matches) return;
  elapsed = stages.reduce((sum, stage) => sum + (stage.playbackFrames ?? stage.frames) / stage.fps, 0);
  update();
}

async function initialize() {
  if (loading) return;
  loading = true;
  try {
    stages = (await (await getFile('manifest.json')).json()).stages;
    cycleDuration = stages.reduce((sum, stage) => sum + (stage.playbackFrames ?? stage.frames) / stage.fps, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    surface.append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      cancelAnimationFrame(animation);
      animation = 0;
      finished = true;
      status.hidden = false;
      status.textContent = 'Motion display interrupted. Reload the page to view the sequence.';
    });
    views = await Promise.all(stages.map(makeView));
    // SMPL-X and retargeting share the same motion and camera for direct comparison.
    views.find(view => view.stage.id === 'smplx').cameraPath = views.find(view => view.stage.id === 'retarget').cameraPath;
    status.hidden = true;
    update();
    new ResizeObserver(resize).observe(surface);
    resize();
    respectMotionPreference();
    resume();
  } catch (error) {
    console.error('Method sequence:', error);
    figure.dataset.state = 'error';
    renderer?.dispose();
    renderer?.domElement.remove();
    status.textContent = 'The motion sequence could not load. Please reload the page to try again.';
  }
}

new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) initialize();
}, { rootMargin: '250px' }).observe(figure);
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (!visible) { cancelAnimationFrame(animation); animation = 0; previous = null; }
  resume();
}, { threshold: .15 }).observe(figure);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(animation); animation = 0; previous = null; }
  resume();
});
reducedMotion.addEventListener('change', respectMotionPreference);
