import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 300;
const HAMMING_THRESHOLD = 8;

// -------------------
// aHash simple
// -------------------
async function aHashFromURL(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 8; c.height = 8;
      ctx.drawImage(img,0,0,8,8);
      const data = ctx.getImageData(0,0,8,8).data;
      const gray = [];
      for(let i=0;i<data.length;i+=4) gray.push((data[i]+data[i+1]+data[i+2])/3);
      const avg = gray.reduce((a,b)=>a+b,0)/gray.length;
      resolve(gray.map(v=>v>=avg?"1":"0").join(''));
    };
  });
}

function hammingDistance(h1,h2) {
  let d=0;
  for(let i=0;i<h1.length;i++) if(h1[i]!==h2[i]) d++;
  return d;
}

// -------------------
// Récupère les hashes
// -------------------
async function getStoredHashes() {
  const { data, error } = await supabase.from("frame_hashes").select("hash");
  if(error) throw error;
  return data.map(d=>d.hash);
}

// -------------------
// Liste frames stockées
// -------------------
async function getStoredFrames() {
  const { data, error } = await supabase.storage.from("videos").list("frames");
  if(error) throw error;
  return data.map(f=>f.name);
}

// -------------------
// Télécharger frame
// -------------------
async function downloadFrame(name) {
  const { data, error } = await supabase.storage.from("videos").download(`frames/${name}`);
  if(error) throw error;
  return URL.createObjectURL(data);
}

// -------------------
// Vérifier toutes les frames
// -------------------
async function verifyFrames() {
  const storedHashes = await getStoredHashes();
  const frameNames = await getStoredFrames();

  let validCount = 0;
  const framesURLs = [];

  for(const name of frameNames){
    const frameURL = await downloadFrame(name);
    framesURLs.push(frameURL);

    const hash = await aHashFromURL(frameURL);
    for(const stored of storedHashes){
      if(hammingDistance(hash, stored) <= HAMMING_THRESHOLD){
        validCount++;
        break;
      }
    }
  }

  return { validCount, total: frameNames.length, framesURLs };
}

// -------------------
// Jouer vidéo saccadée
// -------------------
async function playFrames(frames){
  videoContainer.innerHTML="";
  const canvas = document.createElement("canvas");
  canvas.width=640; canvas.height=360;
  videoContainer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  for(const frame of frames){
    const img = new Image();
    img.src = frame;
    await new Promise(res => { img.onload = ()=>{ ctx.drawImage(img,0,0,640,360); setTimeout(res,FRAME_INTERVAL); }; });
  }
}

// -------------------
// Bouton Vérifier
// -------------------
verifyBtn.onclick = async () => {
  resultDiv.textContent = "Vérification en cours...";
  videoContainer.innerHTML = "";
  try{
    const { validCount,total,framesURLs } = await verifyFrames();
    resultDiv.textContent = `Frames valides : ${validCount} / ${total}`;
    await playFrames(framesURLs);
  }catch(e){
    resultDiv.textContent = "Erreur : "+e.message;
  }
};
