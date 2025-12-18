import { supabase } from "./supabaseClient.js";

// ----------------------------
// Éléments HTML
// ----------------------------
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// Paramètres
const FRAME_INTERVAL = 300;
const HAMMING_THRESHOLD = 5;

// ----------------------------
// aHash perceptuel
// ----------------------------
async function aHashFromURL(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;

    img.onload = () => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 8;
      c.height = 8;

      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;

      const gray = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push(
          (data[i] + data[i + 1] + data[i + 2]) / 3
        );
      }

      const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
      const hash = gray.map(v => (v >= avg ? "1" : "0")).join("");

      resolve(hash);
    };
  });
}

// ----------------------------
// Distance de Hamming
// ----------------------------
function hammingDistance(h1, h2) {
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) d++;
  }
  return d;
}

// ----------------------------
// Hashs stockés par l’assureur
// ----------------------------
async function getStoredHashes() {
  const { data, error } = await supabase
    .from("frame_hashes")
    .select("hash");

  if (error) throw error;
  return data.map(d => d.hash);
}

// ----------------------------
// Liste des frames stockées
// ----------------------------
async function getStoredFrames() {
  const { data, error } = await supabase
    .storage
    .from("videos")
    .list("frames");

  if (error) throw error;
  return data.map(f => f.name);
}

// ----------------------------
// Télécharger une frame
// ----------------------------
async function downloadFrame(frameName) {
  const { data, error } = await supabase
    .storage
    .from("videos")
    .download(`frames/${frameName}`);

  if (error) throw error;
  return URL.createObjectURL(data);
}

// ----------------------------
// Vérification intégrité
// ----------------------------
async function verifyFrames() {
  const storedHashes = await getStoredHashes();
  const frameNames = await getStoredFrames();

  let validCount = 0;
  const framesURLs = [];

  for (const name of frameNames) {
    const frameURL = await downloadFrame(name);
    framesURLs.push(frameURL);

    const hash = await aHashFromURL(frameURL);

    for (const storedHash of storedHashes) {
      if (hammingDistance(hash, storedHash) <= HAMMING_THRESHOLD) {
        validCount++;
        break;
      }
    }
  }

  return {
    validCount,
    total: frameNames.length,
    framesURLs
  };
}

// ----------------------------
// Reconstitution vidéo saccadée
// ----------------------------
async function playFrames(frames) {
  videoContainer.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  videoContainer.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  for (const frame of frames) {
    const img = new Image();
    img.src = frame;

    await new Promise(resolve => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setTimeout(resolve, FRAME_INTERVAL);
      };
    });
  }
}

// ----------------------------
// Bouton Vérifier
// ----------------------------
verifyBtn.onclick = async () => {
  resultDiv.textContent = "Vérification en cours...";
  videoContainer.innerHTML = "";

  try {
    const { validCount, total, framesURLs } =
      await verifyFrames();

    resultDiv.textContent =
      `Frames valides : ${validCount} / ${total}`;

    await playFrames(framesURLs);

  } catch (e) {
    resultDiv.textContent = "Erreur : " + e.message;
  }
};
