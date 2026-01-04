// script.js pour le décodeur
import { supabase } from "./supabaseClient.js";

const video = document.getElementById("preview");
const recordBtn = document.getElementById("recordBtn");
const uploadBtn = document.getElementById("uploadBtn");
const status = document.getElementById("status");

let stream;
let frames = [];
let hashList = [];

// initialisation caméra
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
    } catch (err) {
        console.error("Erreur d'accès à la caméra :", err);
        status.textContent = "Erreur d'accès à la caméra.";
    }
}

// capture frame
async function captureFrame() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameData = canvas.toDataURL("image/jpeg");
    frames.push(frameData);

    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(frameData));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    hashList.push(hashHex);
    return hashHex;
}

// comparaison des hashs avec Supabase
async function verifyHashes() {
    status.textContent = "Vérification de l'intégrité...";
    const { data: storedHashes, error } = await supabase
        .from("frame_hashes")
        .select("hash");

    if (error) {
        console.error("Erreur récupération hashs :", error);
        return;
    }

    let matches = 0;
    for (let hash of hashList) {
        if (storedHashes.some(h => h.hash === hash)) matches++;
    }

    status.textContent = `Intégrité vérifiée : ${matches} frames correspondent sur ${hashList.length}.`;
}

// bouton pour démarrer l'enregistrement et la vérification
recordBtn.addEventListener("click", () => {
    frames = [];
    hashList = [];
    
    const captureInterval = setInterval(captureFrame, 200);

    // stop après 3 secondes (ou selon besoin)
    setTimeout(async () => {
        clearInterval(captureInterval);
        await verifyHashes();
    }, 3000);
});

// initialisation caméra
initCamera();
