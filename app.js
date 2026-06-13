(function(){
"use strict";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>t*t*(3-2*t);

const canvas=document.getElementById("three-canvas");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.98;

const scene=new THREE.Scene();
// soft vertical gradient sky so light buildings have something to separate against
(function(){
  const c=document.createElement("canvas");c.width=2;c.height=256;
  const cx=c.getContext("2d");
  const g=cx.createLinearGradient(0,0,0,256);
  g.addColorStop(0,"#a9bccb");g.addColorStop(.55,"#c6d3dd");g.addColorStop(1,"#dde4ea");
  cx.fillStyle=g;cx.fillRect(0,0,2,256);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;
  scene.background=t;
})();
scene.fog=new THREE.FogExp2(0xd0dae1,.006);
const camera=new THREE.PerspectiveCamera(18,1,1,400);

let gridMat=null; // assigned once the dot grid is built; resize() updates it safely
let composer=null,tiltPass=null,ssaoPass=null; // post-processing (SSAO + tilt-shift)

function resize(){
  const w=canvas.clientWidth||window.innerWidth;
  const h=canvas.clientHeight||window.innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  if(gridMat){
    gridMat.uniforms.uScale.value=h*0.9;
    gridMat.uniforms.uPix.value=renderer.getPixelRatio();
  }
  if(composer){
    const dpr=renderer.getPixelRatio();
    composer.setSize(w*dpr,h*dpr);
    if(ssaoPass) ssaoPass.setSize(w*dpr,h*dpr);
    if(tiltPass) tiltPass.uniforms.uResolution.value.set(w*dpr,h*dpr);
  }
}
window.addEventListener("resize",resize);
resize();

scene.add(new THREE.HemisphereLight(0xfff6e8,0xb9c2c8,.62));
const sun=new THREE.DirectionalLight(0xffffff,1.45);
sun.position.set(32,42,28);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=1;
sun.shadow.camera.far=500;
sun.shadow.camera.left=-90;
sun.shadow.camera.right=90;
sun.shadow.camera.top=90;
sun.shadow.camera.bottom=-90;
sun.shadow.bias=-.001;
sun.shadow.radius=4;
scene.add(sun);
const cool=new THREE.DirectionalLight(0xcfe4ff,.14);
cool.position.set(-30,24,-20);
scene.add(cool);

// soft procedural sky/ground environment so PBR materials catch real reflections
const pmrem=new THREE.PMREMGenerator(renderer);
(function(){
  const c=document.createElement("canvas");c.width=8;c.height=64;
  const cx=c.getContext("2d");
  const grd=cx.createLinearGradient(0,0,0,64);
  grd.addColorStop(0,"#dfe7ed");grd.addColorStop(.55,"#c9d3da");grd.addColorStop(1,"#b3bab4");
  cx.fillStyle=grd;cx.fillRect(0,0,8,64);
  const tex=new THREE.CanvasTexture(c);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  scene.environment=pmrem.fromEquirectangular(tex).texture;
  tex.dispose();pmrem.dispose();
})();

// mild, muted palette on PBR materials so they catch the environment reflections
const mat={
  ground:new THREE.MeshStandardMaterial({color:0xbdb9ac,roughness:.95,metalness:0}),
  cream:new THREE.MeshStandardMaterial({color:0xe9e3d6,roughness:.8,metalness:.02}),
  cream2:new THREE.MeshStandardMaterial({color:0xdcd4c4,roughness:.82,metalness:.02}),
  cream3:new THREE.MeshStandardMaterial({color:0xcabfa8,roughness:.85,metalness:.02}),
  gold:new THREE.MeshStandardMaterial({color:0xc9963a,roughness:.34,metalness:.55}),
  maroon:new THREE.MeshStandardMaterial({color:0x9c6a78,roughness:.7,metalness:.05}),
  glass:new THREE.MeshStandardMaterial({color:0xa9c6d2,roughness:.16,metalness:.25}),
  water:new THREE.MeshStandardMaterial({color:0x6fa6cc,roughness:.12,metalness:.35}),
  sand:new THREE.MeshStandardMaterial({color:0xdcc59c,roughness:.97,metalness:0}),
  dark:new THREE.MeshStandardMaterial({color:0x47505a,roughness:.55,metalness:.12}),
  rubber:new THREE.MeshStandardMaterial({color:0x33383f,roughness:.8,metalness:0}),
  orange:new THREE.MeshStandardMaterial({color:0xd99b63,roughness:.7,metalness:.05}),
  red:new THREE.MeshStandardMaterial({color:0xbf7d72,roughness:.7,metalness:.05}),
  green:new THREE.MeshStandardMaterial({color:0x9fb39a,roughness:.85,metalness:0}),
  bark:new THREE.MeshStandardMaterial({color:0xb3a892,roughness:.9,metalness:0}),
  sun:new THREE.MeshStandardMaterial({color:0xc9963a,emissive:0xc9963a,emissiveIntensity:.55,roughness:.3,metalness:.4})
};

function mesh(geo,m,shadow=true){
  const x=new THREE.Mesh(geo,m);
  if(shadow){x.castShadow=true;x.receiveShadow=true}
  return x;
}
function box(w,h,d,m){return mesh(new THREE.BoxGeometry(w,h,d),m)}
function cyl(rt,rb,h,s,m){return mesh(new THREE.CylinderGeometry(rt,rb,h,s),m)}
function cone(r,h,s,m){return mesh(new THREE.ConeGeometry(r,h,s),m)}
function sphere(r,w,h,m){return mesh(new THREE.SphereGeometry(r,w,h),m)}
function torus(r,t,rs,ts,m){return mesh(new THREE.TorusGeometry(r,t,rs,ts),m)}
function pos(o,x,y,z){o.position.set(x,y,z);return o}
function scl(o,x,y,z){o.scale.set(x,y,z);return o}
// thin flat ring band (for minaret bands, cornices)
function ring(r,t,m){return mesh(new THREE.TorusGeometry(r,t,8,20),m)}
// half-arch outline: a torus drawn over only the top 180deg
function arch(r,t,m){return mesh(new THREE.TorusGeometry(r,t,6,18,Math.PI),m)}

const ground=mesh(new THREE.PlaneGeometry(360,460),mat.ground,false);
ground.rotation.x=-Math.PI/2;
ground.position.set(0,-.1,-80);
ground.receiveShadow=true;
scene.add(ground);

function addTiles(g,w,d,countX,countZ,zoff){
  for(let i=0;i<countX;i++){
    for(let j=0;j<countZ;j++){
      const t=box(w,.16,d,mat.cream2);
      t.position.set((i-(countX-1)/2)*(w+1),.03,zoff+(j-(countZ-1)/2)*(d+1));
      t.receiveShadow=true;
      g.add(t);
    }
  }
}
function addPalm(g,x,z,h){
  const trunk=cyl(.17,.27,h,7,mat.bark);
  trunk.rotation.z=x<0?-.08:.08;
  g.add(pos(trunk,x,h/2,z));
  const crownY=h+.5;
  // small core so the center isn't empty
  const core=sphere(.4,7,5,mat.green);
  g.add(pos(core,x,crownY,z));
  // 8 leaf blades radiating outward and drooping down
  const blades=8;
  for(let i=0;i<blades;i++){
    const a=(i/blades)*Math.PI*2;
    const blade=box(2.1,.08,.5,mat.green);
    blade.position.set(x+Math.cos(a)*1.1,crownY-.12,z+Math.sin(a)*1.1);
    blade.rotation.y=-a;
    blade.rotation.z=.34; // droop
    g.add(blade);
  }
}

function hussainSagar(z){
  const g=new THREE.Group();
  // the lake — a wide blue water sheet the island sits in the middle of
  g.add(pos(box(44,.3,32,mat.water),0,.05,0));
  // central island — stepped stone plinth rising from the water
  g.add(pos(box(6.4,.7,6.4,mat.cream3),0,.55,0));
  g.add(pos(box(5.2,.7,5.2,mat.cream2),0,1.15,0));
  g.add(pos(box(3.6,.6,3.6,mat.cream),0,1.7,0));
  // (Buddha + distant skyline + characters are placed here once the glTF models load)
  g.position.z=z;
  scene.add(g);
  return g;
}

function collegeWorld(z){
  const g=new THREE.Group();
  g.add(pos(box(34,.22,24,mat.ground),0,0,0));
  addTiles(g,1.4,1.4,8,5,6);
  // lighter stone entrance path
  g.add(pos(box(4.2,.1,11,mat.cream3),0,.07,7.5));
  // entrance gateway arch (the SASTRA gate — gold accent)
  g.add(pos(box(.7,4.2,.7,mat.cream),-3.6,2.1,10.5));
  g.add(pos(box(.7,4.2,.7,mat.cream),3.6,2.1,10.5));
  g.add(pos(box(8.5,1.1,1,mat.cream2),0,4.6,10.5));
  g.add(pos(box(7.4,.5,.3,mat.gold),0,4.6,11.05));
  g.position.z=z;
  scene.add(g);
  return g;
}

function bengaluru(z){
  const g=new THREE.Group();
  g.add(pos(box(40,.22,28,mat.ground),0,0,0));
  // Namma Metro elevated viaduct running along MG Road (kept as a procedural detail)
  g.add(pos(box(36,.6,2.4,mat.cream2),0,4.2,11));
  for(let x=-16;x<=16;x+=5.3) g.add(pos(cyl(.5,.6,4,8,mat.cream3),x,2,11));
  g.position.z=z;
  scene.add(g);
  return g;
}

function asuWorld(z){
  const g=new THREE.Group();
  g.add(pos(box(40,.22,28,mat.sand),0,0,0)); // desert ground
  // ASU sun — a soft glowing sphere on the horizon (no spokes) + a faint halo
  const halo=new THREE.Mesh(new THREE.SphereGeometry(4.4,20,16),new THREE.MeshBasicMaterial({color:0xf4c463,transparent:true,opacity:.16,depthWrite:false}));
  g.add(pos(halo,16,9,-12));
  g.add(pos(sphere(2.6,28,22,mat.sun),16,9,-12));
  // maroon ASU ground accent
  g.add(pos(box(22,.12,1.2,mat.maroon),0,.18,-7));
  g.position.z=z;
  scene.add(g);
  return g;
}

function podium(z){
  const g=new THREE.Group();
  g.add(pos(box(30,.22,24,mat.ground),0,0,0));
  addTiles(g,2.2,2.2,9,7,-2);
  // finish gate (the single gold accent moment) the walker passes through
  g.add(pos(box(.6,7,.6,mat.gold),-5,3.5,3));
  g.add(pos(box(.6,7,.6,mat.gold),5,3.5,3));
  g.add(pos(box(11,.6,.6,mat.gold),0,7,3));
  // three-step podium
  g.add(pos(box(3.8,2,3.8,mat.cream2),-4,1,-3));    // 2nd place
  g.add(pos(box(3.8,3.2,3.8,mat.cream),0,1.6,-3));   // 1st place (center, tallest)
  g.add(pos(box(3.8,1.4,3.8,mat.cream3),4,.7,-3));   // 3rd place
  g.add(pos(box(3.9,.5,3.9,mat.gold),0,3.45,-3));    // gold cap on the winner's block
  // backdrop wall with a gold rule
  g.add(pos(box(16,8,.5,mat.cream2),0,4,-7));
  g.add(pos(box(14,.3,.6,mat.gold),0,5.5,-6.7));
  // floating accent cubes (confetti)
  [[-3,6,-1],[2,7,-2],[4,6.5,0],[-1,7.5,1]].forEach(([x,y,pz])=>g.add(pos(box(.3,.3,.3,mat.gold),x,y,pz)));
  g.position.z=z;
  scene.add(g);
  return g;
}

const Z=[0,-38,-76,-114,-152];
const worldHyderabad=hussainSagar(Z[0]);
const worldSastra=collegeWorld(Z[1]);
const worldBengaluru=bengaluru(Z[2]);
const worldASU=asuWorld(Z[3]);
const worldPodium=podium(Z[4]);

const curve=new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,1.2,3),
  new THREE.Vector3(-7,1.2,-16),
  new THREE.Vector3(3,1.4,Z[1]+7),
  new THREE.Vector3(-5,1.1,Z[1]-12),
  new THREE.Vector3(0,1.2,Z[2]+3),
  new THREE.Vector3(8,1.25,Z[2]-11),
  new THREE.Vector3(0,1.3,Z[3]+4),
  new THREE.Vector3(-6,1.2,Z[3]-12),
  new THREE.Vector3(0,1.25,Z[4]+2)
]);
const trailGeo=new THREE.TubeGeometry(curve,900,0.07,6,false);
const trailCount=trailGeo.index.count;
trailGeo.setDrawRange(0,0);
const route=new THREE.Mesh(trailGeo,new THREE.MeshStandardMaterial({
  color:0xc9963a,emissive:0xc9963a,emissiveIntensity:.6,roughness:.3,metalness:.1
}));
scene.add(route);

// ===== glTF models (Kenney kits + Buddha) =====
const gltfLoader=new THREE.GLTFLoader();
try{
  const draco=new THREE.DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  gltfLoader.setDRACOLoader(draco);
}catch(e){}
const ASSETS={
  buddha:"models/buddha.glb",
  bldA:"models/building-a.glb",bldB:"models/building-b.glb",bldC:"models/building-c.glb",bldD:"models/building-d.glb",bldE:"models/building-e.glb",
  skA:"models/building-skyscraper-a.glb",skB:"models/building-skyscraper-b.glb",skC:"models/building-skyscraper-c.glb",skD:"models/building-skyscraper-d.glb",skE:"models/building-skyscraper-e.glb",
  lowA:"models/low-detail-building-a.glb",lowB:"models/low-detail-building-b.glb",lowC:"models/low-detail-building-c.glb",lowD:"models/low-detail-building-d.glb",
  male:"models/character-male-a.glb",maleB:"models/character-male-b.glb",femA:"models/character-female-a.glb",femB:"models/character-female-b.glb",
  treeD:"models/tree_detailed.glb",treeO:"models/tree_oak.glb",treeF:"models/tree_fat.glb",palmT:"models/tree_palmDetailedTall.glb",palmS:"models/tree_palmTall.glb",flower:"models/flower_purpleA.glb",
  trainA:"models/train-a.glb",trainB:"models/train-b.glb",trainC:"models/train-c.glb",
  rock1:"models/rocksand1.glb",rock2:"models/rocksand2.glb",rock3:"models/rocksand3.glb",
  column:"models/column.glb",trophy:"models/trophy.glb",statue:"models/statue.glb",
  indA:"models/ind-a.glb",indH:"models/ind-h.glb",indM:"models/ind-m.glb"
};
const M={};
function loadAll(done){
  const keys=Object.keys(ASSETS);let n=0;
  if(!keys.length){done();return;}
  keys.forEach(k=>gltfLoader.load(ASSETS[k],
    g=>{M[k]=g;if(++n===keys.length)done();},
    undefined,
    ()=>{console.warn("model load failed:",k);if(++n===keys.length)done();}));
}
const _box=new THREE.Box3();
// clone a model, scale it to a target height, seat its base at y=0, centre it in x/z
function model(key,h){
  const src=M[key];if(!src)return new THREE.Group();
  const inner=THREE.SkeletonUtils.clone(src.scene);
  _box.setFromObject(inner);
  const cur=_box.max.y-_box.min.y;
  if(cur>0&&h)inner.scale.multiplyScalar(h/cur);
  _box.setFromObject(inner);
  inner.position.set(-(_box.min.x+_box.max.x)/2,-_box.min.y,-(_box.min.z+_box.max.z)/2);
  inner.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const wrap=new THREE.Group();wrap.add(inner);
  return wrap;
}
// animated characters + the Bengaluru metro train
let traveler=null,bengaluruTrain=null;
const mixers=[];
const charClock=new THREE.Clock();
function playClip(root,clips,name){
  const mx=new THREE.AnimationMixer(root);
  let cl=THREE.AnimationClip.findByName(clips,name);
  if(!cl&&clips)cl=clips.find(c=>new RegExp(name,"i").test(c.name));
  if(!cl&&clips)cl=clips[0];
  if(cl)mx.clipAction(cl).play();
  mixers.push(mx);
  return mx;
}
function addChar(parent,key,x,z,clip,rot){
  if(!M[key])return;
  const o=model(key,1.7);
  o.position.set(x,0,z);
  if(rot!==undefined)o.rotation.y=rot;
  parent.add(o);
  playClip(o,M[key].animations,clip||"idle");
}
// place a building/tree at (x,y,z) scaled to height h
function put(parent,key,x,z,h,rot){
  const o=model(key,h);o.position.set(x,0,z);if(rot!==undefined)o.rotation.y=rot;parent.add(o);return o;
}
// place a character (can sit at an arbitrary y, e.g. on a podium block)
function placeChar(parent,key,x,y,z,clip,rot){
  if(!M[key])return;
  const o=model(key,1.8);o.position.set(x,y,z);if(rot!==undefined)o.rotation.y=rot;parent.add(o);
  playClip(o,M[key].animations,clip||"idle");
}
function buildModels(){
  try{
    // --- HYDERABAD: Buddha + a clear, closer city skyline across the lake ---
    if(worldHyderabad){
      const G=worldHyderabad;
      const b=model("buddha",6.4);b.position.set(0,2.0,0);G.add(b);
      [[-18,-9,"bldA",8],[-13,-10,"indH",9.5],[-7,-10.5,"bldB",7.5],[-1,-11,"indA",10],[5,-10.5,"bldC",8],[11,-10,"indM",9],[17,-9,"bldD",8],[-22,-8,"bldE",6.5],[22,-8,"bldA",6.8]].forEach(([x,z,k,h])=>put(G,k,x,z,h));
      placeChar(G,"femA",-7,0,5,"idle",1.2);
      placeChar(G,"maleB",7,0,6,"idle",-1.4);
    }
    // --- SASTRA: a real campus — main hall, a colonnade, a courtyard statue, a quad ---
    if(worldSastra){
      const G=worldSastra;
      put(G,"bldB",0,-6,9.5);                          // main academic hall
      put(G,"indH",-12,-4,8); put(G,"indM",12,-4,8);   // wings
      put(G,"bldA",-10,5,6.5,.3); put(G,"bldC",10,5,6.5,-.3);
      for(let i=-3;i<=3;i++) put(G,"column",i*2.2,-1.5,3.6); // colonnade in front of the hall
      const st=model("statue",3.4);st.position.set(0,0,3.5);G.add(st); // courtyard statue
      [[-3,7,"treeO"],[3,7,"treeD"],[-3,11,"treeD"],[3,11,"treeO"]].forEach(([x,z,k])=>put(G,k,x,z,3.4));
      placeChar(G,"male",-2,0,8,"walk",.5);
      placeChar(G,"femA",2,0,6,"idle",-1.0);
      placeChar(G,"maleB",-1,0,10,"walk",2.6);
    }
    // --- BENGALURU: tech-park cluster + a metro train on the viaduct ---
    if(worldBengaluru){
      const G=worldBengaluru;
      [[0,-3,"skA",15],[-7,-1,"skB",12],[7,-2,"skC",13],[-5,-9,"skD",11],[6,-9,"skE",12.5],[-13,3,"bldB",8],[13,2,"bldC",8.5],[14,-6,"skA",10],[-14,-5,"skB",9.5]].forEach(([x,z,k,h])=>put(G,k,x,z,h));
      [-12,-4,4,12].forEach(x=>put(G,"treeD",x,14,3));
      placeChar(G,"femB",-3,0,8,"walk",.3);
      placeChar(G,"maleB",4,0,9,"walk",2.9);
      // assemble a 3-car train, centred on origin, sitting on the viaduct deck
      const train=new THREE.Group();let tx=0;
      ["trainA","trainB","trainC"].forEach(k=>{
        if(!M[k])return;
        const car=model(k,1.7);
        let bb=new THREE.Box3().setFromObject(car);
        if((bb.max.z-bb.min.z)>(bb.max.x-bb.min.x)){car.rotation.y=Math.PI/2;bb=new THREE.Box3().setFromObject(car);}
        const len=bb.max.x-bb.min.x;car.position.x=tx+len/2;tx+=len+0.15;train.add(car);
      });
      train.children.forEach(c=>c.position.x-=tx/2);
      train.position.set(0,4.5,11);G.add(train);bengaluruTrain=train;
    }
    // --- ASU: desert — Palm Walk, A-Mountain, scattered rocks (no homes) ---
    if(worldASU){
      const G=worldASU;
      for(let i=0;i<6;i++){const z=8-i*3;put(G,"palmT",-3.2,z,4.6);put(G,"palmS",3.2,z,4.6);}
      const mt=model("rock1",9);mt.position.set(-15,0,-9);G.add(mt); // A-Mountain butte
      const A=new THREE.Group();
      const la=box(.4,2.4,.4,mat.gold);la.position.set(-.5,1.2,0);la.rotation.z=.34;A.add(la);
      const ra=box(.4,2.4,.4,mat.gold);ra.position.set(.5,1.2,0);ra.rotation.z=-.34;A.add(ra);
      const ba=box(1.0,.4,.4,mat.gold);ba.position.set(0,1.15,0);A.add(ba);
      A.position.set(-15,8.4,-8);A.scale.setScalar(1.3);G.add(A);
      [[-6,6,"rock2"],[7,7,"rock3"],[10,-3,"rock2"],[-9,-2,"rock3"],[2,9,"rock2"]].forEach(([x,z,k])=>put(G,k,x,z,1.4));
      placeChar(G,"male",-2,0,5,"walk",.2);
      placeChar(G,"femA",2,0,3,"idle",-1.0);
    }
    // --- PODIUM: hero + trophy + a small crowd ---
    if(worldPodium){
      const G=worldPodium;
      placeChar(G,"male",-0.6,3.7,-3,"idle",0);
      const tr=model("trophy",1.5);tr.position.set(1.1,3.45,-3);G.add(tr);
      placeChar(G,"femA",-4,2.0,-3,"idle",.2);
      placeChar(G,"maleB",4,1.4,-3,"idle",-.2);
      placeChar(G,"femB",-3,0,4,"idle",2.6);
      placeChar(G,"maleB",4,0,4.5,"idle",-2.6);
    }
    // --- the hero walking the whole path ---
    if(M["male"]){
      traveler=model("male",1.75);
      scene.add(traveler);
      playClip(traveler,M["male"].animations,"walk");
    }
  }catch(e){console.warn("buildModels error:",e);}
}

// ---- world-locked ground dot grid (disabled for now — flip GRID_ENABLED to true) ----
const GRID_ENABLED=false;
const gridDots=(function(){
  const spacing=2.2,halfX=42,zNear=20,zFar=-170;
  const positions=[];
  for(let x=-halfX;x<=halfX;x+=spacing){
    for(let zz=zFar;zz<=zNear;zz+=spacing){
      positions.push(x,.06,zz);
    }
  }
  const posArr=new Float32Array(positions);
  const count=posArr.length/3;
  const bright=new Float32Array(count);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(posArr,3));
  geo.setAttribute("aBright",new THREE.BufferAttribute(bright,1));
  const m=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{
      uColor:{value:new THREE.Color(0x3a424b)},
      uScale:{value:(canvas.clientHeight||window.innerHeight)*0.9},
      uPix:{value:renderer.getPixelRatio()}
    },
    vertexShader:`
      attribute float aBright;
      uniform float uScale; uniform float uPix;
      varying float vA;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        float fade=1.0-smoothstep(45.0,100.0,-mv.z);
        float b=aBright;
        vA=(0.03+b*0.6)*fade;
        float size=(0.9+b*2.4)*uPix;
        gl_PointSize=size*(uScale/-mv.z);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform vec3 uColor; varying float vA;
      void main(){
        vec2 c=gl_PointCoord-vec2(0.5);
        float dd=dot(c,c);
        if(dd>0.25) discard;
        float edge=smoothstep(0.25,0.10,dd);
        gl_FragColor=vec4(uColor,vA*edge);
      }`
  });
  const pts=new THREE.Points(geo,m);
  pts.renderOrder=-1;
  if(GRID_ENABLED) scene.add(pts);
  gridMat=m;
  return {pts,m,geo,pos:posArr,bright,count};
})();
const gridRay=new THREE.Raycaster();
const gridPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-0.06);
const gridNDC=new THREE.Vector2(-2,-2);
const gridHit=new THREE.Vector3();
let gridActive=false;
const GRID_RADIUS=7,GRID_DECAY=0.90;
window.addEventListener("pointermove",e=>{
  gridNDC.x=(e.clientX/window.innerWidth)*2-1;
  gridNDC.y=-(e.clientY/window.innerHeight)*2+1;
  gridActive=true;
});
window.addEventListener("pointerleave",()=>{gridActive=false;});
function updateGrid(){
  if(!GRID_ENABLED) return;
  gridRay.setFromCamera(gridNDC,camera);
  const hit=gridActive&&gridRay.ray.intersectPlane(gridPlane,gridHit);
  const gp=gridDots.pos,gb=gridDots.bright,gc=gridDots.count;
  const cx=gridHit.x,cz=gridHit.z,r2=GRID_RADIUS*GRID_RADIUS;
  for(let i=0;i<gc;i++){
    if(hit){
      const dx=gp[i*3]-cx,dz=gp[i*3+2]-cz,d2=dx*dx+dz*dz;
      if(d2<r2){
        const v=1-Math.sqrt(d2)/GRID_RADIUS;
        if(v>gb[i]) gb[i]=v;
      }
    }
    gb[i]*=GRID_DECAY;
  }
  gridDots.geo.attributes.aBright.needsUpdate=true;
}

const targets=Z.map(z=>new THREE.Vector3(0,4.2,z));
const camOffset=new THREE.Vector3(46,52,46);
let raw=0,smooth=0,inStory=false;
let target=new THREE.Vector3().copy(targets[0]);
let look=new THREE.Vector3().copy(targets[0]);

const journey=document.getElementById("journey");
const hero=document.getElementById("hero");
const chapters=[...document.querySelectorAll(".chapter")];
const nav=[...document.querySelectorAll(".chapter-nav li")];
const progress=document.getElementById("progress");
const chapterCount=document.getElementById("chapterCount");
const dotfield=document.getElementById("dotfield");

function updateScroll(){
  const rect=journey.getBoundingClientRect();
  const heroRect=hero.getBoundingClientRect();
  const max=journey.offsetHeight-window.innerHeight;
  raw=max>0?clamp(-rect.top/max,0,1):0;
  inStory=rect.top<=0&&rect.bottom>=window.innerHeight;
  const inHero=heroRect.bottom>0&&heroRect.top<window.innerHeight;
  canvas.classList.toggle("visible",inHero||inStory);
  progress.style.width=(raw*100)+"%";
  const t=raw*(targets.length-1);
  const idx=clamp(Math.floor(t),0,targets.length-2);
  const frac=smoothstep(t-idx);
  target.lerpVectors(targets[idx],targets[idx+1],frac);
  const active=raw>=.995?targets.length-1:clamp(Math.round(raw*(targets.length-1)),0,targets.length-1);
  chapters.forEach((c,i)=>c.classList.toggle("active",i===active));
  nav.forEach((n,i)=>n.classList.toggle("active",i===active));
  chapterCount.classList.toggle("show",inStory);
  chapterCount.firstChild.textContent=String(active+1).padStart(2,"0");
  dotfield.classList.toggle("show",rect.bottom<window.innerHeight*.5);
}
window.addEventListener("scroll",updateScroll,{passive:true});
updateScroll();

// ---- post-processing: SSAO (ambient occlusion) for form definition + tilt-shift DOF ----
try{
  if(THREE.EffectComposer&&THREE.ShaderPass){
    composer=new THREE.EffectComposer(renderer);
    let firstAdded=false;
    try{
      if(THREE.SSAOPass){
        ssaoPass=new THREE.SSAOPass(scene,camera,1,1);
        ssaoPass.kernelRadius=6;    // soft contact shadows only — avoids the heavy black shade
        ssaoPass.minDistance=0.0008;
        ssaoPass.maxDistance=0.02;
        composer.addPass(ssaoPass);
        firstAdded=true;
      }
    }catch(ssaoErr){ ssaoPass=null; firstAdded=false; }
    if(!firstAdded && THREE.RenderPass) composer.addPass(new THREE.RenderPass(scene,camera));
    tiltPass=new THREE.ShaderPass({
      uniforms:{
        tDiffuse:{value:null},
        uResolution:{value:new THREE.Vector2(1,1)},
        uFocus:{value:0.5},    // vertical focus band centre (0=top,1=bottom)
        uRange:{value:0.26},   // half-height of the sharp band (wider = less blur)
        uStrength:{value:3.0}  // max blur in pixels at the edges
      },
      vertexShader:"varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:[
        "uniform sampler2D tDiffuse; uniform vec2 uResolution;",
        "uniform float uFocus; uniform float uRange; uniform float uStrength;",
        "varying vec2 vUv;",
        "void main(){",
        "  float d=abs(vUv.y-uFocus);",
        "  float blur=clamp((d-uRange)/0.42,0.0,1.0); blur*=blur;",
        "  vec2 px=uStrength*blur/uResolution;",
        "  vec4 col=texture2D(tDiffuse,vUv); float total=1.0;",
        "  for(int i=1;i<=12;i++){",
        "    float a=float(i)*2.39996323; float r=sqrt(float(i)/12.0);",
        "    vec2 off=vec2(cos(a),sin(a))*r*px;",
        "    col+=texture2D(tDiffuse,vUv+off); total+=1.0;",
        "  }",
        "  gl_FragColor=col/total;",
        "}"
      ].join("\n")
    });
    composer.addPass(tiltPass);
    const cw=canvas.clientWidth||window.innerWidth,ch=canvas.clientHeight||window.innerHeight,cdpr=renderer.getPixelRatio();
    composer.setSize(cw*cdpr,ch*cdpr);
    if(ssaoPass) ssaoPass.setSize(cw*cdpr,ch*cdpr);
    tiltPass.uniforms.uResolution.value.set(cw*cdpr,ch*cdpr);
  }
}catch(fxErr){ composer=null; }

function animate(time){
  requestAnimationFrame(animate);
  smooth+=(raw-smooth)*.055;
  look.lerp(target,.06);
  const float=Math.sin(time*.0008)*.4;
  camera.position.copy(look).add(camOffset);
  camera.position.x+=float;
  camera.lookAt(look.x,look.y+1.2,look.z);
  trailGeo.setDrawRange(0,Math.floor(clamp(smooth,0,1)*trailCount));
  const dt=charClock.getDelta();
  for(let i=0;i<mixers.length;i++) mixers[i].update(dt);
  if(traveler){
    const sm=clamp(smooth,0,1);
    const p=curve.getPoint(sm),tan=curve.getTangent(sm);
    traveler.position.set(p.x,0,p.z);
    traveler.rotation.y=Math.atan2(tan.x,tan.z);
  }
  if(bengaluruTrain) bengaluruTrain.position.x=((time*0.004)%34)-17;
  camera.updateMatrixWorld();
  updateGrid();
  if(composer) composer.render(); else renderer.render(scene,camera);
}
animate(0);
loadAll(buildModels);

setTimeout(()=>canvas.classList.add("loaded"),600);

if(window.Lenis){
  const lenis=new Lenis({duration:1.4,easing:t=>Math.min(1,1.001-Math.pow(2,-10*t))});
  lenis.on("scroll",()=>{updateScroll();reveal();});
  function raf(time){lenis.raf(time);requestAnimationFrame(raf);}
  requestAnimationFrame(raf);
}

const cursor=document.getElementById("cursor");
document.addEventListener("mousemove",e=>{
  cursor.style.left=e.clientX+"px";
  cursor.style.top=e.clientY+"px";
});
document.querySelectorAll("a,button,.sports-card,.work-item").forEach(el=>{
  el.addEventListener("mouseenter",()=>cursor.classList.add("big"));
  el.addEventListener("mouseleave",()=>cursor.classList.remove("big"));
});

const topbar=document.getElementById("topbar");
const reveals=[...document.querySelectorAll(".reveal")];
const navLinks=[...document.querySelectorAll(".nav-links a[href^='#']")];
const navSections=navLinks.map(a=>document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
function reveal(){
  topbar.classList.toggle("scrolled",window.scrollY>40);
  reveals.forEach(el=>{
    if(el.getBoundingClientRect().top<window.innerHeight*.88) el.classList.add("visible");
  });
  let active=0;
  navSections.forEach((s,i)=>{if(s.getBoundingClientRect().top<=80)active=i});
  navLinks.forEach((a,i)=>a.classList.toggle("active",i===active));
}
window.addEventListener("scroll",reveal,{passive:true});
reveal();

const projects={
  p1:{
    tag:"Generative AI · Live",
    title:"LekhaAI",
    desc:"Fine-tuned a FLUX diffusion model with LoRA for personalized AI invitation generation, shipped to production.",
    detail:"Fine-tuned FLUX on ~1,500 image–prompt pairs to improve layout quality and text rendering — about 25% higher visual fidelity and ~30% fewer text artifacts versus the base model. Containerized GPU inference on Azure ML (A100), GPT-4 prompt structuring, and a React + TypeScript frontend with an Azure Functions backend, deployed with CI/CD.",
    stack:["Python","PyTorch","Diffusers","Azure ML","Docker","React","TypeScript"],
    github:"https://github.com/Yashi248",
    demo:"https://www.lekhaai.com"
  },
  p2:{
    tag:"RAG · LLM",
    title:"RAG HR Assistant",
    desc:"Containerized RAG assistant for Workday HR workflows with low-latency semantic retrieval.",
    detail:"Indexed 10K+ HR records via RocksDB and FAISS for secure, low-latency retrieval. Boosted query accuracy by 83% with context-grounded semantic search and automated common HR queries, cutting manual support workload by an estimated 40%.",
    stack:["Python","SQL","RocksDB","FAISS","Docker","FastAPI"],
    github:"https://github.com/Yashi248",
    demo:"#"
  },
  p3:{
    tag:"Knowledge Graph",
    title:"Medical Chatbot",
    desc:"A Neo4j knowledge-graph chatbot linking diseases, symptoms, and treatments.",
    detail:"Designed a Neo4j knowledge graph linking diseases, symptoms, and treatments for intelligent query handling. Integrated NLP entity extraction and intent detection, improving query accuracy by 25%.",
    stack:["Python","Neo4j","Streamlit","Docker","NLTK","scikit-learn"],
    github:"https://github.com/Yashi248",
    demo:"#"
  }
};
const modal=document.getElementById("projectModal");
const modalClose=document.getElementById("modalClose");
const modalTag=document.getElementById("modalTag");
const modalTitle=document.getElementById("modalTitle");
const modalDesc=document.getElementById("modalDesc");
const modalDetail=document.getElementById("modalDetail");
const modalStack=document.getElementById("modalStack");
const modalGithub=document.getElementById("modalGithub");
const modalDemo=document.getElementById("modalDemo");
function openProject(id){
  const p=projects[id];
  if(!p)return;
  modalTag.textContent=p.tag;
  modalTitle.textContent=p.title;
  modalDesc.textContent=p.desc;
  modalDetail.textContent=p.detail;
  modalStack.innerHTML=p.stack.map(s=>"<span>"+s+"</span>").join("");
  modalGithub.href=p.github;
  modalDemo.href=p.demo;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}
function closeProject(){
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}
document.querySelectorAll("[data-project]").forEach(btn=>btn.addEventListener("click",()=>openProject(btn.dataset.project)));
modalClose.addEventListener("click",closeProject);
modal.addEventListener("click",e=>{if(e.target===modal)closeProject()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeProject()});

// floating dot field over the content sections, drifting toward the cursor
(function(){
  const df=document.getElementById("dotfield");
  if(!df) return;
  const ctx=df.getContext("2d");
  let dpr=Math.min(window.devicePixelRatio||1,2),W=0,H=0;
  const dots=[];
  const COUNT=window.innerWidth<760?28:54;
  const mp={x:-999,y:-999};
  function size(){
    W=df.clientWidth;H=df.clientHeight;
    df.width=W*dpr;df.height=H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function seed(){
    dots.length=0;
    for(let i=0;i<COUNT;i++) dots.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,r:Math.random()*1.6+.6});
  }
  window.addEventListener("resize",()=>{size();seed();});
  window.addEventListener("mousemove",e=>{mp.x=e.clientX;mp.y=e.clientY;});
  size();seed();
  function frame(){
    ctx.clearRect(0,0,W,H);
    for(const d of dots){
      const dx=mp.x-d.x,dy=mp.y-d.y,dist=Math.hypot(dx,dy);
      if(dist<160){d.vx+=dx/dist*.02;d.vy+=dy/dist*.02;}
      d.vx*=.96;d.vy*=.96;
      d.x+=d.vx;d.y+=d.vy;
      if(d.x<0)d.x=W;if(d.x>W)d.x=0;if(d.y<0)d.y=H;if(d.y>H)d.y=0;
      ctx.beginPath();
      ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
      ctx.fillStyle="rgba(201,150,58,.45)";
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
})();
