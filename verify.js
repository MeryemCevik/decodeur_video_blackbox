import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 200; // ms
const CANVAS_SIZE = 32;

// ---------------- SHA256 ----------------
async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------- Extraire frames ----------------
async function extractFrames(file) {
  return new Promise(res => {
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

        currentTime += FRAME_INTERVAL / 1000;
        if (currentTime < video.duration) video.currentTime = currentTime;
        else res(frames);
      });
    });
  });
}

// ---------------- Jouer vidéo saccadée ----------------
async function playFrames(frames) {
  videoContainer.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  videoContainer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  for (const blob of frames) {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise(r => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 640, 360);
        setTimeout(r, FRAME_INTERVAL);
      };
    });
  }
}

// ---------------- Vérification ----------------
verifyBtn.onclick = async () => {
  const input = document.getElementById("uploadedVideo");
  if (!input.files.length) {
    alert("Sélectionne une vidéo !");
    return;
  }

  resultDiv.textContent = "Vérification en cours...";
  const file = input.files[0];

  try {
    // 1️⃣ Récupérer tous les hashes stockés
    const { data, error } = await supabase.from("frame_hashes").select("hash");
    if (error) {
      resultDiv.textContent = "Erreur lecture hash : " + error.message;
      return;
    }
    const hashes = data.map(d => d.hash);

    // 2️⃣ Extraire frames de la vidéo reçue
    const frames = await extractFrames(file);

    // 3️⃣ Comparer frame par frame
    let validCount = 0;
    for (const frame of frames) {
      const hash = await sha256(frame);
      if (hashes.includes(hash)) validCount++;
    }

    resultDiv.textContent = `Frames valides : ${validCount} / ${frames.length}`;

    // 4️⃣ Jouer vidéo saccadée
    await playFrames(frames);

  } catch (e) {
    resultDiv.textContent = "Erreur : " + e.message;
  }
};
