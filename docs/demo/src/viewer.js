import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KinematicRobot} from './kinematics.js';
import {loadRobotMeshes} from './robot-meshes.js';
export class Viewer {
 constructor(container){
  this.container=container;this.bodyIds=[];this.objectId=-1;this.disposed=false;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eae9e3');this.scene.fog=new THREE.Fog('#eae9e3',10,30);
  this.camera=new THREE.PerspectiveCamera(38,1,.02,60);this.camera.up.set(0,0,1);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  container.prepend(this.renderer.domElement);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=1;this.controls.maxDistance=10;this.controls.maxPolarAngle=Math.PI*.48;this.controls.target.set(0,0,.7);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x8c8d79,2.7));
  const light=new THREE.DirectionalLight(0xfff6e6,3.4);light.position.set(-3,-4,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:18});light.shadow.bias=-.0003;light.shadow.normalBias=.015;this.scene.add(light);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe5e5dc,roughness:1}));plane.receiveShadow=true;plane.position.z=-.035;this.scene.add(plane);
  const grid=new THREE.GridHelper(40,80,0xc5c9bd,0xd7d9cf);grid.rotation.x=Math.PI/2;grid.position.z=-.03;grid.material.transparent=true;grid.material.opacity=.6;this.scene.add(grid);
  this.resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.state)this.resetCamera();});this.resize.observe(container);
  this.animate=()=>{if(this.disposed)return;this.animation=requestAnimationFrame(this.animate);this.controls.update();this.renderer.render(this.scene,this.camera);};this.animate();
 }
 async loadRobot(config){
  this.config=config;const url=new URL(`./assets/${config.files.robot}`,document.baseURI);
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error(`Could not load robot kinematics (${response.status})`);
  const model=await response.json();
  if(JSON.stringify(model.jointNames)!==JSON.stringify(config.jointNames))throw Error('Robot joint order mismatch');
  this.robot=new KinematicRobot(model);this.scene.add(this.robot.root);
  await loadRobotMeshes(this.robot,model,url);
 }
 async selectObject(id,bodyIds,objectId){
  this.bodyIds=bodyIds;this.objectId=objectId;
  if(this.currentObject===id)return;
  const token=this.loadToken=Symbol();const gltf=await new GLTFLoader().loadAsync(`./assets/${this.config.objects.find(o=>o.id===id).files.visual}`);
  if(token!==this.loadToken)return;
  if(this.object){this.scene.remove(this.object);this.object.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});}
  this.object=gltf.scene;this.object.traverse(n=>{if(n.isMesh){if(!n.geometry.attributes.normal)n.geometry.computeVertexNormals();n.material=new THREE.MeshStandardMaterial({color:0xc2814f,flatShading:true,roughness:.82,metalness:.03});n.castShadow=true;n.receiveShadow=true;n.userData.isObject=true;}});
  this.scene.add(this.object);this.currentObject=id;
 }
 update(state){
  this.state=state;
  if(this.robot)this.robot.update(state);
  if(this.object){this.object.position.fromArray(state.objectPos);const q=state.objectQuat;this.object.quaternion.set(q[1],q[2],q[3],q[0]);}
 }
 resetCamera(){
  if(!this.state)return;
  const bounds=new THREE.Box3();
  if(this.robot)bounds.expandByObject(this.robot.root);
  if(this.object)bounds.expandByObject(this.object);
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());
  const vertical=THREE.MathUtils.degToRad(this.camera.fov);
  const horizontal=2*Math.atan(Math.tan(vertical/2)*this.camera.aspect);
  const distance=Math.max(2,sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.08);
  this.controls.maxDistance=Math.max(10,distance*2);
  this.controls.target.copy(sphere.center);
  this.camera.position.copy(sphere.center).add(new THREE.Vector3(2.9,-3.1,1.65).normalize().multiplyScalar(distance));
  this.controls.update();
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.animation);this.resize.disconnect();this.controls.dispose();this.scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();if(Array.isArray(n.material))n.material.forEach(m=>m.dispose());else n.material.dispose();}});this.renderer.dispose();this.renderer.domElement.remove();}
}
