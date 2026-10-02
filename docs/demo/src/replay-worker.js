import {MotionReplay} from './replay.js?v=20260911-root-joints';

let config,replay,paused=true,timer=null,generation=0,elapsed=0,started=0;
const buffers=new Map();
const status=text=>postMessage({type:'status',text});
async function get(path,compression){
 const url=new URL(`../assets/${path}`,import.meta.url);
 if(!buffers.has(path))buffers.set(path,fetch(url,path==='replay-manifest.json'?{cache:'no-store'}:undefined).then(async response=>{
  if(!response.ok)throw Error(`Could not load ${path} (${response.status})`);
  if(compression==='gzip'){
   if(typeof DecompressionStream==='undefined')throw Error('Please use a browser with gzip decompression support.');
   return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return response.arrayBuffer();
 }).catch(error=>{buffers.delete(path);throw error;}));
 const pending=buffers.get(path);buffers.delete(path);buffers.set(path,pending);
 while(buffers.size>4)buffers.delete(buffers.keys().next().value);
 return pending;
}
function stop(){
 if(!paused)elapsed+=(performance.now()-started)/1000;
 paused=true;clearTimeout(timer);timer=null;
}
function currentState(){return replay.readState(elapsed+(paused?0:(performance.now()-started)/1000));}
function tick(){
 if(paused||!replay)return;
 postMessage({type:'frame',state:currentState(),rate:1});
 timer=setTimeout(tick,1000/replay.clip.fps);
}
function play(){if(!paused||!replay)return;paused=false;started=performance.now();tick();}
async function select(objectId,clipId){
 const token=++generation;stop();status('Loading recorded motion…');
 const object=config.objects.find(o=>o.id===objectId);
 const clip=object?.clips.find(c=>c.id===(clipId||object.defaultClip));
 if(!clip)throw Error('Unknown rollout');
 const buffer=await get(clip.file,clip.compression);
 if(token!==generation)return;
 replay=new MotionReplay(config,clip,new Float32Array(buffer));elapsed=0;
 // Keep the first frame paused until the user checks Play.
 postMessage({type:'ready',objectId:object.id,clipId:clip.id,state:currentState()});
}
self.onmessage=async({data:m})=>{
 try{
  if(m.type==='init'){
   status('Loading rollout library…');
   config=JSON.parse(new TextDecoder().decode(await get('replay-manifest.json')));
   postMessage({type:'manifest',config});await select(config.objects[0].id,config.objects[0].defaultClip);
  }else if(m.type==='select')await select(m.objectId,m.clipId);
  else if(m.type==='pause'&&replay){
   if(m.value)stop();else play();
   postMessage({type:'paused',paused,text:paused?'Paused':'Playing · recorded rollout'});
  }else if(m.type==='reset'&&replay){
   const resume=!paused;stop();elapsed=0;postMessage({type:'reset',state:currentState(),paused:!resume});if(resume)play();
  }
 }catch(error){stop();postMessage({type:'error',message:error.message});}
};
