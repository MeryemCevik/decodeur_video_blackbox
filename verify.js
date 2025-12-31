import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");
const FRAME_INTERVAL = 200; // ms

// ---------------- SHA256 ----------------
async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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
  resultDiv.textContent = "Vérification en cours...";
  try {
    // 1️⃣ Récupérer tous les hashes stockés
    const { data: hashesData, error: hashError } = await supabase.from("frame_hashes").select("hash");
    if (hashError) { resultDiv.textContent = "Erreur lecture hash : " + hashError.message; return; }
    const hashes = hashesData.map(d => d.hash);

    // 2️⃣ Télécharger toutes les frames stockées
    const { data: frameFiles, error: frameError } = await supabase.storage.from("videos").list("frames");
    if (frameError) { resultDiv.textContent = "Erreur lecture frames : " + frameError.message; return; }

    const validFrames = [];
    for (const file of frameFiles) {
      const { data: blob, error } = await supabase.storage.from("videos").download(file.name);
      if (!error) {
        const hash = await sha256(blob);
        if (hashes.includes(hash)) validFrames.push(blob);
      }
    }

    resultDiv.textContent = `Frames valides : ${validFrames.length} / ${frameFiles.length}`;
    await playFrames(validFrames);

  } catch (e) {
    resultDiv.textContent = "Erreur : " + e.message;
  }
};
