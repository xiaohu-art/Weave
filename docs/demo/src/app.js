const $=id=>document.getElementById(id);
let worker,viewer,config,state,paused=true,ready=false,loading=false,viewReady,readyToken=0;
const send=message=>worker?.postMessage(message);
function setStatus(text){$('status').textContent=text;}
function setPaused(value){paused=value;$('pause').textContent=value?'Play':'Pause';$('pause').setAttribute('aria-label',value?'Play replay':'Pause replay');document.body.classList.toggle('running',!value&&ready);}
function failure(message){loading=false;ready=false;state=null;readyToken++;setPaused(true);$('controls').inert=true;$('start-screen').hidden=false;$('start-screen').querySelector('h1').textContent='The demo could not start.';$('start-screen').querySelector('p').textContent=message;$('load').textContent='Retry loading';$('load').disabled=false;$('load').hidden=false;setStatus('Unable to load');worker?.terminate();viewer?.dispose();viewer=null;}
function clipParts(clipId){
 const match=clipId.match(/^(.+)_(v\d+)_rollout$/);
 if(!match)throw Error(`Invalid rollout name: ${clipId}`);
 return {motion:match[1],variant:match[2]};
}
function variantOptions(objectId,motionId,preferredVariant){
 const object=config.objects.find(o=>o.id===objectId);
 const clips=object.clips.filter(c=>clipParts(c.id).motion===motionId);
 $('variant').replaceChildren(...clips.map(c=>new Option(clipParts(c.id).variant,c.id)));
 $('variant').value=(clips.find(c=>clipParts(c.id).variant===preferredVariant)||clips[0]).id;
}
function motionOptions(objectId,clipId){
 const object=config.objects.find(o=>o.id===objectId);
 const selected=clipParts(clipId||object.defaultClip||object.clips[0].id);
 const motions=[...new Set(object.clips.map(c=>clipParts(c.id).motion))];
 $('motion').replaceChildren(...motions.map(id=>new Option(id,id)));
 $('motion').value=selected.motion;variantOptions(objectId,selected.motion,selected.variant);
}
function selectClip(){
 state=null;ready=false;setPaused(true);$('controls').inert=true;
 send({type:'select',objectId:$('object').value,clipId:$('variant').value});
}
function update(s){state=s;viewer?.update(s);$('elapsed').textContent=(s.time||0).toFixed(2);}
async function start(){
 if(loading)return;loading=true;$('load').disabled=true;$('load').hidden=true;$('start-screen').querySelector('h1').textContent='Loading recorded motion…';$('start-screen').querySelector('p').textContent='Preparing the scene at the first frame.';setStatus('Loading 3D viewer…');
 try{
  const {Viewer}=await import('./viewer.js?v=20260911-root-joints');viewer=new Viewer($('stage'));
  worker=new Worker(new URL('./replay-worker.js?v=20260911-root-joints',import.meta.url),{type:'module'});
  worker.onerror=event=>failure(event.message||'The browser could not start the replay worker.');
  worker.onmessage=async({data:m})=>{
   try{
    if(m.type==='status'){setStatus(m.text);}
    else if(m.type==='manifest'){config=m.config;$('object').replaceChildren(...config.objects.map(o=>new Option(o.label,o.id)));motionOptions(config.objects[0].id);viewReady=viewer.loadRobot(config);viewReady.catch(error=>failure(error.message));}
    else if(m.type==='ready'){
     const token=++readyToken;await viewReady;await viewer.selectObject(m.objectId,[], -1);if(token!==readyToken)return;
     $('object').value=m.objectId;motionOptions(m.objectId,m.clipId);
     update(m.state);viewer.resetCamera();ready=true;loading=false;$('controls').inert=false;$('start-screen').hidden=true;
     for(const id of ['metrics','hint'])$(id).hidden=false;setPaused(true);setStatus('Paused');
    }else if(m.type==='frame'){update(m.state);}
    else if(m.type==='reset'){update(m.state);setPaused(m.paused);setStatus(m.paused?'Paused':'Playing · recorded rollout');}
    else if(m.type==='paused'){setPaused(m.paused??true);setStatus(m.text);}
    else if(m.type==='error'){failure(m.message);}
   }catch(error){failure(error.message);}
  };
  worker.postMessage({type:'init'});
 }catch(error){failure(error.message||'WebGL is not available in this browser.');}
}
$('load').addEventListener('click',start);
$('object').addEventListener('change',()=>{motionOptions($('object').value);selectClip();});
$('motion').addEventListener('change',()=>{
 const preferredVariant=clipParts($('variant').value).variant;
 variantOptions($('object').value,$('motion').value,preferredVariant);selectClip();
});
$('variant').addEventListener('change',selectClip);
function pause(){if(!ready)return;send({type:'pause',value:!paused});}
function reset(){if(!ready)return;send({type:'reset'});}
$('pause').addEventListener('click',pause);$('reset').addEventListener('click',reset);$('camera').addEventListener('click',()=>viewer.resetCamera());
$('stage').addEventListener('keydown',e=>{if(!ready||e.target!==$('stage'))return;if(e.code==='Space'){e.preventDefault();pause();}else if(e.code==='KeyR')reset();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&!paused){send({type:'pause',value:true});}});
window.addEventListener('pagehide',()=>{worker?.terminate();viewer?.dispose();});

start();
