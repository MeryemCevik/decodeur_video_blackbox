import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 300;
const CANVAS_SIZE = 32;
const HAMMING_THRESHOLD = 10; // tolérance ± bits

// ---------------- Visual Hash ----------------
async function visualHash(blob) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const data = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
      const gray = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push((data[i]+data[i+1]+data[i+2])/3);
      }
      const avg = gray.reduce((a,b)=>a+b,0)/gray.length;
      const hash = gray.map(v => v >= avg ? "1":"0").join('');
      resolve(hash);
    };
  });
}

// ---------------- Hamming Distance ----------------
function hammingDistance(h1,h2){
  let d=0;
  for(let i=0;i<h1.length;i++) if(h1[i]!==h2[i]) d++;
  return d;
}

// ---------------- Extraire frames ----------------
async function extractFrames(file) {
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.play();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];

    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let currentTime = 0;
      video.currentTime = 0;

      video.addEventListener("seeked", async function capture() {
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.7));
        frames.push(blob);

        currentTime += FRAME_INTERVAL/1000;
        if(currentTime < video.duration) video.currentTime = currentTime;
        else resolve(frames);
      });
    });
  });
}

// ---------------- Jouer vidéo saccadée ----------------
async function playFrames(frames) {
  videoContainer.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360;
  videoContainer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  for(const blob of frames){
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise(r => { img.onload=()=>{ctx.drawImage(img,0,0,640,360); setTimeout(r,FRAME_INTERVAL);};});
  }
}

// ---------------- Vérification ----------------
verifyBtn.onclick = async () => {
  const input = document.getElementById("uploadedVideo");
  if(!input.files.length){ alert("Sélectionne une vidéo !"); return; }

  resultDiv.textContent = "Vérification en cours...";

  try{
    const frames = await extractFrames(input.files[0]);
    const storedHashes = (await supabase.from("frame_hashes").select("hash")).data.map(d=>d.hash);

    let validCount = 0;
    for(const frame of frames){
      const hash = await visualHash(frame);
      for(const stored of storedHashes){
        if(hammingDistance(hash, stored) <= HAMMING_THRESHOLD){
          validCount++;
          break;
        }
      }
    }

    resultDiv.textContent = `Frames valides : ${validCount} / ${frames.length}`;
    await playFrames(frames);

  }catch(e){
    resultDiv.textContent = "Erreur : "+e.message;
  }
};
