import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 300;

// ---------------- SHA256 ----------------
async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------- Extraire frames de la vidéo uploadée ----------------
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

        currentTime += FRAME_INTERVAL / 1000;
        if (currentTime < video.duration) {
          video.currentTime = currentTime;
        } else {
          resolve(frames);
        }
      });
    });
  });
}

// ---------------- Récupérer frames stockées ----------------
async function getStoredFrames() {
  const { data, error } = await supabase.storage.from("videos").list("", { limit: 1000 });
  if (error) throw error;

  // garder uniquement les fichiers dans frames/
  const frames = data
    .filter(f => f.name.startsWith("frames/") && f.name.endsWith(".jpg"))
    .map(f => f.name);

  if (frames.length === 0) throw new Error("Aucune frame trouvée dans le storage");
  return frames;
}

// Télécharger une frame stockée (retourne un Blob)
async function downloadFrame(path) {
  const { data, error } = await supabase.storage.from("videos").download(path);
  if (error) throw error;
  return data;
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

  try {
    // 1️⃣ frames de la vidéo uploadée
    const uploadedFrames = await extractFrames(input.files[0]);

    // 2️⃣ hashes stockés
    const storedHashes = (await supabase.from("frame_hashes").select("hash")).data.map(d => d.hash);

    // 3️⃣ vérifier chaque frame
    let validCount = 0;
    for (const blob of uploadedFrames) {
      const hash = await sha256(blob);
      if (storedHashes.includes(hash)) validCount++;
    }

    resultDiv.textContent = `Frames valides : ${validCount} / ${uploadedFrames.length}`;

    // 4️⃣ affichage vidéo saccadée
    await playFrames(uploadedFrames);

  } catch (e) {
    resultDiv.textContent = "Erreur : " + e.message;
  }
};
