// Recorded root pose, all actual joint angles, and rigid object pose. No simulation.
export class MotionReplay {
 constructor(config,clip,frames){
  this.jointCount=config.jointNames.length;this.clip=clip;this.frames=frames;
  if(config.format!=='root-joints-v1'||!Number.isInteger(clip.frames)||clip.frames<1||!Number.isFinite(clip.fps)||clip.fps<=0||clip.stride!==this.jointCount+14||frames.length!==clip.frames*clip.stride||!frames.every(Number.isFinite))throw Error('Invalid rollout data');
 }
 readState(time=0){
  // Hold the last frame for one source-frame interval before looping to frame 0.
  const frame=Math.floor(Math.max(0,time)*this.clip.fps+1e-7)%this.clip.frames;
  let offset=frame*this.clip.stride;
  const take=count=>{const values=this.frames.slice(offset,offset+count);offset+=count;return values;};
  const rootPos=take(3),rootQuat=take(4),jointPos=take(this.jointCount),objectPos=take(3),objectQuat=take(4);
  return {rootPos,rootQuat,jointPos,objectPos,objectQuat,frame,time:frame/this.clip.fps};
 }
}
