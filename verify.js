import { supabase } from "./supabaseClient.js";

// Récupération des éléments HTML
const videoInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// Intervalle entre chaque frame en ms pour créer la redondance
const FRAME_INTERVAL = 300;

// Canvas temporaire pour extraire les frames
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

/* ----------------------------
   1️⃣ Récupérer tous les hash stockés par l'assureur
---------------------------- */
async function getStoredHashes() {
  const { data, error } = await supabase.from("frame_hashes").select("hash");
  if (error) throw new Error(error.message);

  // On renvoie un tableau de hash uniquement
  return data.map(f => f.hash);
}

/* ----------------------------
   2️⃣ Extraire les frames d'une vidéo
---------------------------- */
function extractFrames(videoEl) {
  return new Promise(resolve => {
    const frames = [];

    // Quand la vidéo est prête, on commence la capture
    videoEl.addEventListener("loadedmetadata", () => {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;

      // Capture toutes les FRAME_INTERVAL ms
      const capture = setInterval(() => {
        if (videoEl.ended) {
          clearInterval(capture);
          resolve(frames); // renvoie le tableau de frames
        } else {
          // Dessine la frame actuelle sur le canvas
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

          // Convertit le canvas en image (dataURL)
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }, FRAME_INTERVAL);

      // Démarre la lecture
      videoEl.play();
    });
  });
}

/* ----------------------------
   3️⃣ Calculer le hash SHA-256 d'une frame
---------------------------- */
async function hashFrame(frameDataURL) {
  const [header, base64] = frameDataURL.split(',');
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

  // Génère le hash SHA-256
  const hashBuffer = await crypto.subtle.digest("SHA-256", array);

  // Convertit le hash en chaîne hexadécimale
  return [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join('');
}

/* ----------------------------
   4️⃣ Vérifier les frames d'une vidéo
---------------------------- */
async function verifyVideo(videoFile) {
  // Crée un URL local pour la vidéo
  const videoURL = URL.createObjectURL(videoFile);
  const videoEl = document.createElement("video");
  videoEl.src = videoURL;
  videoEl.muted = true;

  // 1️⃣ Extraire les frames
  const frames = await extractFrames(videoEl);

  // 2️⃣ Récupérer les hash stockés par l'assureur
  const storedHashes = await getStoredHashes();
  const storedHashSet = new Set(storedHashes);

  // 3️⃣ Vérifier chaque frame
  const results = [];
  for (const frameDataURL of frames) {
    const hash = await hashFrame(frameDataURL);
    const valid = storedHashSet.has(hash); // true si la frame est valide
    results.push({ hash, valid });
  }

  return { results, frames }; // on renvoie aussi les frames pour les afficher
}

/* ----------------------------
   5️⃣ Reconstituer la vidéo saccadée pour visualisation
---------------------------- */
async function playFrames(frames) {
  videoContainer.innerHTML = ""; // vide l'ancien contenu

  const videoCanvas = document.createElement("canvas");
  const ctx = videoCanvas.getContext("2d");
  videoContainer.appendChild(videoCanvas);

  videoCanvas.width = 640;
  videoCanvas.height = 360;

  // Affiche les frames une par une
  for (const frame of frames) {
    const img = new Image();
    img.src = frame;
    await new Promise(res => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, videoCanvas.width, videoCanvas.height);
        setTimeout(res, FRAME_INTERVAL);
      };
    });
  }
}

/* ----------------------------
   6️⃣ Gestion du clic sur le bouton
---------------------------- */
verifyBtn.onclick = async () => {
  if (!videoInput.files[0]) {
    alert("Sélectionne une vidéo !");
    return;
  }

  resultDiv.textContent = "Vérification en cours...";

  try {
    const videoFile = videoInput.files[0];

    // Vérification des frames et récupération des frames
    const { results, frames } = await verifyVideo(videoFile);

    // Calcul du nombre de frames valides
    const validCount = results.filter(r => r.valid).length;
    const total = results.length;
    resultDiv.textContent = `Frames valides : ${validCount} / ${total}`;

    // Reconstitution visuelle de la vidéo saccadée
    await playFrames(frames);

  } catch (e) {
    resultDiv.textContent = "Erreur : " + e.message;
  }
};
