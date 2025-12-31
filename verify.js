import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const result = document.getElementById("result");
const container = document.getElementById("videoContainer");

const HASH_SIZE = 32;
const FRAME_DELAY = 300;
const HAMMING_LIMIT = 10;

// ---------------- HASH ----------------
async function visualHashFromURL(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = HASH_SIZE;
      c.height = HASH_SIZE;
      const ctx = c.getContext("2d");
      ctx.drawImage(img,0,0,HASH_SIZE,HASH_SIZE);
      const d = ctx.getImageData(0,0,HASH_SIZE,HASH_SIZE).data;

      let gray = [];
      for(let i=0;i<d.length;i+=4)
        gray.push((d[i]+d[i+1]+d[i+2])/3);

      const avg = gray.reduce((a,b)=>a+b,0)/gray.length;
      resolve(gray.map(v=>v>=avg?"1":"0").join(""));
    };
  });
}

function hamming(a,b){
  let d=0;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++;
  return d;
}

// ---------------- DATA ----------------
async function getHashes(){
  const { data } = await supabase
    .from("frame_hashes")
    .select("hash");
  return data.map(d=>d.hash);
}

async function getFrames(){
  const { data } = await supabase
    .storage
    .from("videos")
    .list("frames", { limit: 1000 });

  return data
    .filter(f=>f.name.endsWith(".jpg"))
    .map(f=>`frames/${f.name}`);
}

async function downloadFrame(path){
  const { data } = await supabase
    .storage
    .from("videos")
    .download(path);

  return URL.createObjectURL(data);
}

// ---------------- VERIFY ----------------
async function verify(){
  const hashes = await getHashes();
  const frames = await getFrames();

  if(frames.length === 0)
    throw new Error("Aucune frame trouvée");

  let valid = 0;
  const urls = [];

  for(const f of frames){
    const url = await downloadFrame(f);
    urls.push(url);
    const h = await visualHashFromURL(url);

    if(hashes.some(s => hamming(h,s) <= HAMMING_LIMIT))
      valid++;
  }

  return { valid, total: frames.length, urls };
}

// ---------------- PLAY ----------------
async function play(urls){
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  for(const u of urls){
    const img = new Image();
    img.src = u;
    await new Promise(r=>{
      img.onload=()=>{
        ctx.drawImage(img,0,0,640,360);
        setTimeout(r, FRAME_DELAY);
      };
    });
  }
}

// ---------------- UI ----------------
verifyBtn.onclick = async () => {
  result.textContent = "Vérification...";
  try{
    const { valid, total, urls } = await verify();
    result.textContent = `Frames valides : ${valid}/${total}`;
    await play(urls);
  }catch(e){
    result.textContent = e.message;
  }
};
