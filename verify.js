import { supabase } from "./supabaseClient.js";

// DOM Elements
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// HASH D’UNE VIDEO WEBM
async function hashWebMFrames(videoBlob) {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    // Attendre que les métadonnées soient chargées
    await new Promise(resolve => video.onloadedmetadata = resolve);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    const fps = 2; // 1 frame toutes les 500ms
    const step = 1 / fps;
    const hashes = [];

    for (let t = 0; t < video.duration; t += step) {
        video.currentTime = t;
        await new Promise(resolve => video.onseeked = resolve);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
        const buffer = await blob.arrayBuffer();

        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        hashes.push(hashHex);
        console.log(`[DECODEUR] Frame ${t.toFixed(2)}s → Hash calculé : ${hashHex}`);
    }

    URL.revokeObjectURL(url);
    return hashes;
}

// Récupérer les hashs stockés sur Supabase
async function getStoredHashes() {
    const { data } = await supabase
        .from("frame_hashes")
        .select("hash");

    console.log(`[DECODEUR] ${data.length} hashes récupérés depuis Supabase`);
    data.forEach((d, i) => console.log(`Stored hash ${i}: ${d.hash}`));

    return data.map(d => d.hash);
}

// Vérification de la vidéo
async function verifyVideo(file) {
    resultDiv.textContent = "Vérification en cours…";
    videoContainer.innerHTML = "";

    const videoElement = document.createElement("video");
    videoElement.src = URL.createObjectURL(file);
    videoElement.muted = true;
    videoContainer.appendChild(videoElement);

    await new Promise(resolve => videoElement.onloadedmetadata = resolve);

    console.log("[DECODEUR] Durée vidéo :", videoElement.duration);

    // Calculer les hashes de la vidéo uploadée
    const videoHashes = await hashWebMFrames(file);

    // Récupérer les hashes stockés
    const storedHashes = await getStoredHashes();

    // Comparaison
    let total = videoHashes.length;
    let matched = 0;

    videoHashes.forEach((hash, i) => {
        const matchIndex = storedHashes.indexOf(hash);
        if (matchIndex >= 0) {
            matched++;
            console.log(`✔ Frame ${i} → Match ! (hash vidéo: ${hash}, hash stocké: ${storedHashes[matchIndex]})`);
        } else {
            console.warn(`✘ Frame ${i} → Mismatch (hash vidéo: ${hash})`);
        }
        resultDiv.textContent = `${matched} / ${total}`;
    });

    const percent = Math.round((matched / total) * 100);
    console.log(`[DECODEUR] Résultat final : ${percent}% de correspondance`);

    resultDiv.textContent =
        percent >= 70
            ? `Intégrité OK (${percent}%)`
            : `Vidéo altérée (${percent}%)`;
}

// Event listener
verifyBtn.addEventListener("click", () => {
    if (uploadedVideo.files.length) {
        verifyVideo(uploadedVideo.files[0]);
    }
});
