import { supabase } from "./supabaseClient.js";

// DOM Elements
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// Fonction utilitaire pour calculer SHA-256 d'une frame
async function hashFrame(video, time) {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        video.currentTime = time;

        video.addEventListener('seeked', function onSeeked() {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.removeEventListener('seeked', onSeeked);

            canvas.toBlob(async (blob) => {
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                resolve(hashHex);
            }, 'image/png');
        });
    });
}

// Fonction pour récupérer les hashes depuis Supabase
async function getStoredHashes() {
    const { data, error } = await supabase
        .from('frame_hashes')
        .select('hash');

    if (error) throw new Error("Erreur récupération hashes : " + error.message);
    return data.map(d => d.hash);
}

// Fonction principale de vérification
async function verifyVideo(file) {
    resultDiv.textContent = "Vérification en cours...";
    videoContainer.innerHTML = "";

    const videoElem = document.createElement("video");
    videoElem.src = URL.createObjectURL(file);
    videoElem.crossOrigin = "anonymous";
    videoElem.muted = true;
    videoElem.playsInline = true;
    videoElem.width = 400;
    videoContainer.appendChild(videoElem);

    await videoElem.play().catch(() => {}); // pour s'assurer que metadata est chargé
    await new Promise(resolve => videoElem.addEventListener('loadedmetadata', resolve));

    const duration = videoElem.duration;
    const storedHashes = await getStoredHashes();

    const fps = 2; // nombre de frames par seconde à vérifier (on peut augmenter)
    let verified = true;

    for (let t = 0; t < duration; t += 1 / fps) {
        const hash = await hashFrame(videoElem, t);
        if (!storedHashes.includes(hash)) {
            verified = false;
            break;
        }
    }

    resultDiv.textContent = verified ? "Intégrité OK ✅" : "Frames modifiées ❌";
}

// Event listener
verifyBtn.addEventListener("click", async () => {
    if (!uploadedVideo.files.length) {
        alert("Veuillez sélectionner une vidéo");
        return;
    }
    await verifyVideo(uploadedVideo.files[0]);
});
