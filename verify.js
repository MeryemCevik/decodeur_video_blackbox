import { supabase } from "./supabaseClient.js";

const videoInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 300;
const HAMMING_THRESHOLD = 8;

// Canvas extraction
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

// -------------------
// aHash perceptuel
// -------------------
async function aHashFromDataURL(dataURL) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = dataURL;
    img.onload = () => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 8;
      c.height = 8;

      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;

      const gray = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push((data[i] + data[i + 1] + data[i + 2]) / 3);
      }

      const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
      const hash = gray.map(v => (v >= avg ? "1" : "0")).join("");
      resolve(hash);
    };
  });
}

// -------------------
// Distance de Hamming
// -------------------
function hammingDistance(h1, h2) {
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) d++;
  }
  return d;
}

// -------------------
// Hashs stockés
// -------------------
async function getStoredHashes() {
  const { data } = await supabase
    .from("frame_hashes")
    .select("hash");
  return data.map(d => d.hash);
}

// -------------------
// Extraction frames vidéo
// -------------------
function extractFrames(videoEl) {
  return new Promise(resolve => {
    const frames = [];

    videoEl.onloadedmetadata = () => {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      videoEl.play();

      const capture = setInterval(() => {
        if (videoEl.ended) {
          clearInterval(capture);
          resolve(frames);
        } else {
          ctx.drawImage(videoEl, 0, 0);
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }, FRAME_INTERVAL);
    };
  });
}

// -------------------
// Vérification vidéo
// -------------------
async function verifyVideo(videoFile) {
  const videoEl = document.createElement("video");
  videoEl.src = URL.createObjectURL(videoFile);
  videoEl.muted = true;

  const frames = await extractFrames(videoEl);
  const storedHashes = await getStoredHashes();

  let validCount = 0;

  for (const frame of frames) {
    const hash = await aHashFromDataURL(frame);

    for (const stored of storedHashes) {
      if (hammingDistance(hash, stored) <= HAMMING_THRESHOLD) {
        validCount++;
        break;
      }
    }
  }

  return { validCount, total: frames.length, frames };
}

// -------------------
// Lecture saccadée
// -------------------
async function playFrames(frames) {
  videoContainer.innerHTML = "";
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  videoContainer.appendChild(c);
  const ctx = c.getContext("2d");

  for (const frame of frames) {
    const img = new Image();
    img.src = frame;
    await new Promise(res => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, c.width, c.height);
        setTimeout(res, FRAME_INTERVAL);
      };
    });
  }
}

// -------------------
// Bouton vérifier
// -------------------
verifyBtn.onclick = async () => {
  if (!videoInput.files[0]) return;

  resultDiv.textContent = "Vérification en cours...";

  const { validCount, total, frames } =
    await verifyVideo(videoInput.files[0]);

  resultDiv.textContent =
    `Frames valides : ${validCount} / ${total}`;

  await playFrames(frames);
};
