import * as THREE from '../demo/vendor/three/build/three.module.js';

// A front three-quarter view keeps both hands visible as the actor turns.
const sideAngle = THREE.MathUtils.degToRad(25);
const elevation = THREE.MathUtils.degToRad(12);
const up = new THREE.Vector3(0, 0, 1);

export function createCameraPath(stage, tracks) {
  const frames = stage.playbackFrames ?? stage.frames;
  const count = stage.bodyNames.length;
  const wristIndices = ['left_wrist_yaw_link', 'right_wrist_yaw_link'].map(name => stage.bodyNames.indexOf(name));
  const point = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const samples = [];
  const groupView = stage.id === 'kimodo' && tracks.length > 1;
  const viewElevation = groupView ? THREE.MathUtils.degToRad(18) : elevation;
  // Fit the visible geometry, including finger tips and the top of the head.
  const localBounds = tracks.map(track => track.bodies.map(body => new THREE.Box3().setFromObject(body)));
  const objectBounds = groupView ? tracks.map(track => new THREE.Box3().setFromObject(track.object)) : [];
  for (let frame = 0; frame < frames; frame++) {
    const target = new THREE.Vector3();
    const heading = new THREE.Vector3();
    const points = [];
    for (let t = 0; t < tracks.length; t++) {
      const track = tracks[t];
      const offset = Math.min(frame, track.definition.frames - 1) * stage.stride;
      const root = new THREE.Vector3().fromArray(track.poses, offset);
      const focus = root.clone();
      const hands = new THREE.Vector3();
      let handCount = 0;
      for (const index of wristIndices) {
        if (index < 0) continue;
        hands.add(point.fromArray(track.poses, offset + index * 3));
        handCount++;
      }
      if (handCount) focus.lerp(hands.multiplyScalar(1 / handCount), .3);
      focus.z = root.z + .18;
      target.add(focus);
      const q = offset + count * 3;
      rotation.set(track.poses[q + 1], track.poses[q + 2], track.poses[q + 3], track.poses[q]);
      heading.add(forward.set(1, 0, 0).applyQuaternion(rotation).setZ(0).normalize());
      for (let i = 0; i < count; i++) {
        const box = localBounds[t][i];
        if (box.isEmpty()) continue;
        const position = new THREE.Vector3().fromArray(track.poses, offset + i * 3);
        const bq = q + i * 4;
        rotation.set(track.poses[bq + 1], track.poses[bq + 2], track.poses[bq + 3], track.poses[bq]);
        for (let corner = 0; corner < 8; corner++) {
          point.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z);
          point.applyQuaternion(rotation).add(position);
          // Prioritize upper body and hands; allow the lower legs to leave the close-up.
          if (point.z >= root.z - .25) points.push(point.clone());
        }
      }
      // Include the entire object in the final composition, alongside the robot.
      if (groupView && frame === frames - 1) {
        const box = objectBounds[t];
        const objectOffset = offset + count * 7;
        const position = new THREE.Vector3().fromArray(track.poses, objectOffset);
        rotation.set(track.poses[objectOffset + 4], track.poses[objectOffset + 5], track.poses[objectOffset + 6], track.poses[objectOffset + 3]);
        if (!box.isEmpty()) for (let corner = 0; corner < 8; corner++) {
          point.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z);
          points.push(point.clone().applyQuaternion(rotation).add(position));
        }
      }
    }
    const angle = groupView ? THREE.MathUtils.degToRad(10) : sideAngle;
    heading.normalize().applyAxisAngle(up, angle);
    samples.push({ target: target.multiplyScalar(1 / tracks.length), heading, points });
  }
  // Symmetric smoothing is deterministic when paused, resized, or showing a final frame.
  const radius = Math.max(1, Math.round(stage.fps * .12));
  // Kimodo uses one stationary view of the entire clip, including its final hold.
  // Face the final robot pose with a small side offset to reveal hand depth.
  // Center on the motion's average focus to retain the earlier variants.
  const fixedTarget = groupView
    ? samples.reduce((sum, sample) => sum.add(sample.target), new THREE.Vector3()).multiplyScalar(1 / frames)
    : null;
  return samples.map((sample, frame) => {
    const target = new THREE.Vector3();
    const direction = new THREE.Vector3();
    let weightSum = 0;
    for (let i = Math.max(0, frame - radius); i <= Math.min(frames - 1, frame + radius); i++) {
      const weight = radius + 1 - Math.abs(i - frame);
      target.addScaledVector(samples[i].target, weight);
      direction.addScaledVector(samples[i].heading, weight);
      weightSum += weight;
    }
    target.multiplyScalar(1 / weightSum);
    if (groupView) {
      target.copy(fixedTarget);
      direction.copy(samples[frames - 1].heading);
    }
    direction.normalize().multiplyScalar(Math.cos(viewElevation));
    direction.z = Math.sin(viewElevation);
    const right = new THREE.Vector3().crossVectors(up, direction).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(direction, right);
    const projected = sample.points.map(p => {
      point.copy(p).sub(target);
      return [point.dot(right), point.dot(cameraUp), point.dot(direction)];
    });
    return { target, direction, projected };
  });
}

export function fitCameraDistances(path, camera, followSpread = false) {
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const horizontal = vertical * camera.aspect;
  const distances = path.map(sample => {
    let distance = 1.8;
    for (const [x, y, depth] of sample.projected) {
      distance = Math.max(distance, depth + (Math.abs(x) + .035) / (horizontal * .9), depth + (Math.abs(y) + .035) / (vertical * .9));
    }
    return distance;
  });
  // Keep individual actors at a constant scale. The five variants start spread
  // apart, so move closer as they converge instead of fitting their widest pose forever.
  if (!followSpread) return distances.fill(Math.max(...distances));
  const radius = 15;
  return distances.map((distance, frame) => {
    let sum = 0, weightSum = 0;
    for (let i = Math.max(0, frame - radius); i <= Math.min(distances.length - 1, frame + radius); i++) {
      const weight = radius + 1 - Math.abs(i - frame);
      sum += distances[i] * weight;
      weightSum += weight;
    }
    return Math.max(distance, sum / weightSum);
  });
}

export function followCamera(camera, path, frame, distances) {
  const index = Math.min(Math.max(frame, 0), path.length - 1);
  const sample = path[index];
  camera.position.copy(sample.target).addScaledVector(sample.direction, distances[index]);
  camera.lookAt(sample.target);
}
