import { supabase } from "./supabaseClient.js";

const video = document.getElementById("preview");
const recordBtn = document.getElementById("recordBtn");
const uploadBtn = document.getElementById("uploadBtn");
const statusDiv = document.getElementById("status");

let mediaRecorder;
let recordedChunks = [];
let driverVideoBlob;

// Récupérer les hashes du serveur
async function getStoredHashes() {
    const { data, error } = await supabase.from("frame_hashes").select("*");
    if (error) {
        console.error("Erreur récupération hashes : ", error.message);
        return [];
    }
    return data.map(d => d.hash);
}

// Découpage vidéo en frames
async function extractFrames(blob) {
    const videoEl = document.createElement("video");
    videoEl.src = URL.createObjectURL(blob);
    await videoEl.play();

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;

    const frames = [];
    const INTERVAL = 200; // ms

    return new Promise(resolve => {
        const intervalId = setInterval(() => {
            if (videoEl.ended) {
                clearInterval(intervalId);
                resolve(frames);
                return;
            }
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async blob => {
                const hash = await generateHash(blob);
                frames.push(hash);
            }, "image/png");
        }, INTERVAL);
    });
}

// Fonction de hash identique à l'encodeur
async function generateHash(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Comparer les hashes pour vérifier intégrité
async function verifyVideo(blob) {
    const storedHashes = await getStoredHashes();
    const videoHashes = await extractFrames(blob);

    const matches = videoHashes.filter(h => storedHashes.includes(h));
    statusDiv.textContent = `Intégrité vérifiée : ${matches.length}/${videoHashes.length} frames correspondent`;
}

// Charger la vidéo du conducteur
uploadBtn.addEventListener("click", async () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "video/*";

    fileInput.onchange = async e => {
        driverVideoBlob = e.target.files[0];
        await verifyVideo(driverVideoBlob);
    };

    fileInput.click();
});
