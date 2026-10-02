import {Group, Vector3} from '../vendor/three/build/three.module.js';

// The fixed URDF joint origin precedes the measured hinge rotation.
export class KinematicRobot {
 constructor(model){
  if(model.format!=='urdf-fk-v1')throw Error('Unsupported robot kinematics');
  this.links=new Map(model.links.map(name=>{const link=new Group();link.name=name;return [name,link];}));
  this.root=this.links.get(model.root);this.joints=[];
  for(const joint of model.joints){
   const origin=new Group(),q=joint.quaternion,child=this.links.get(joint.child);
   origin.position.fromArray(joint.position);origin.quaternion.set(q[1],q[2],q[3],q[0]);
   this.links.get(joint.parent).add(origin);origin.add(child);
   if(joint.qIndex>=0)this.joints.push({link:child,axis:new Vector3(...joint.axis),index:joint.qIndex});
  }
 }
 update(state){
  const q=state.rootQuat;
  this.root.position.fromArray(state.rootPos);this.root.quaternion.set(q[1],q[2],q[3],q[0]).normalize();
  for(const joint of this.joints)joint.link.quaternion.setFromAxisAngle(joint.axis,state.jointPos[joint.index]);
  this.root.updateMatrixWorld(true);
 }
}
