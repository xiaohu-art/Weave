import {BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

// The exporter copies the original binary STL files, gzip-compressed without modification.
function binaryStl(buffer){
 const data=new DataView(buffer);
 if(data.byteLength<84)throw Error('Truncated binary STL');
 const triangles=data.getUint32(80,true);
 if(data.byteLength!==84+triangles*50)throw Error('Invalid binary STL length');
 const positions=new Float32Array(triangles*9);
 for(let i=0;i<triangles;i++)for(let j=0;j<9;j++)positions[i*9+j]=data.getFloat32(84+i*50+12+j*4,true);
 const raw=new BufferGeometry();raw.setAttribute('position',new Float32BufferAttribute(positions,3));
 const geometry=mergeVertices(raw,1e-7);raw.dispose();geometry.computeVertexNormals();
 return geometry;
}

export async function loadRobotMeshes(robot,model,modelUrl){
 const geometries=new Map();
 // Limit parallel requests for the per-link STL files.
 const files=[...new Set(model.visuals.map(visual=>visual.mesh))];
 let next=0;
 const load=async()=>{
  while(next<files.length){
   const name=files[next++],response=await fetch(new URL(name,modelUrl));
   if(!response.ok)throw Error(`Could not load robot mesh ${name} (${response.status})`);
   const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
   geometries.set(name,binaryStl(buffer));
  }
 };
 await Promise.all(Array.from({length:6},load));
 for(const visual of model.visuals){
  const material=new MeshStandardMaterial({roughness:.58,metalness:.22});
  material.color.setRGB(...visual.color.slice(0,3));
  const mesh=new Mesh(geometries.get(visual.mesh),material),q=visual.quaternion;
  mesh.position.fromArray(visual.position);mesh.quaternion.set(q[1],q[2],q[3],q[0]);mesh.scale.fromArray(visual.scale);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.bodyName=visual.link;
  robot.links.get(visual.link).add(mesh);
 }
}
