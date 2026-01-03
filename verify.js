import { supabase } from "./supabaseClient.js";
import pHash from 'imghash';
import hamming from 'hamming-distance'; // npm install hamming-distance

const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

async function hashWebMFrames(videoBlob) {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise(resolve => video.onloadedmetadata = resolve);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    const fps = 2; // 2 fps
    const step = 1 / fps;
    const hashes = [];

    for (let t = 0; t < video.duration; t += step) {
        video.currentTime = t;
        await new Promise(resolve => video.onseeked = resolve);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
        const hash = await pHash.hash(blob, 16); // hash perceptuel
        hashes.push(hash);
        console.log(`[DECODEUR] Frame ${t.toFixed(2)}s → Hash calculé : ${hash}`);
    }

    URL.revokeObjectURL(url);
    return hashes;
}

// Récupérer les hashes stockés
async function getStoredHashes() {
    const { data } = await supabase
        .from("frame_hashes")
        .select("hash");

    return data.map(d => d.hash);
}

// Vérification avec tolérance
async function verifyVideo(file) {
    resultDiv.textContent = "Vérification en cours…";
    videoContainer.innerHTML = "";

    const videoElement = document.createElement("video");
    videoElement.src = URL.createObjectURL(file);
    videoElement.muted = true;
    videoContainer.appendChild(videoElement);
    await new Promise(resolve => videoElement.onloadedmetadata = resolve);

    const videoHashes = await hashWebMFrames(file);
    const storedHashes = await getStoredHashes();

    let total = videoHashes.length;
    let matched = 0;
    const tolerance = 5; // distance Hamming tolérée

    videoHashes.forEach((hash, i) => {
        const matchIndex = storedHashes.findIndex(h => hamming(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex')) <= tolerance);
        if (matchIndex >= 0) {
            matched++;
            console.log(`✔ Frame ${i} → Match !`);
        } else {
            console.warn(`✘ Frame ${i} → Mismatch`);
        }
    });

    const percent = Math.round((matched / total) * 100);
    console.log(`[DECODEUR] Résultat final : ${percent}% de correspondance`);

    resultDiv.textContent =
        percent >= 70
            ? `Intégrité OK (${percent}%)`
            : `Vidéo altérée (${percent}%)`;
}

verifyBtn.addEventListener("click", () => {
    if (uploadedVideo.files.length) verifyVideo(uploadedVideo.files[0]);
});
