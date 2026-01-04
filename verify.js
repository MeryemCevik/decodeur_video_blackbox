// verify.js
import { supabase } from "./supabaseClient.js";

const uploadedVideoInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

verifyBtn.addEventListener("click", async () => {
    const file = uploadedVideoInput.files[0];
    if (!file) {
        resultDiv.textContent = "Veuillez sélectionner une vidéo.";
        return;
    }

    // Affiche la vidéo
    videoContainer.innerHTML = "";
    const videoEl = document.createElement("video");
    videoEl.src = URL.createObjectURL(file);
    videoEl.controls = true;
    videoContainer.appendChild(videoEl);

    resultDiv.textContent = "Calcul des hashes et vérification…";

    // Extraction des frames et calcul SHA-256
    const hashes = await hashVideoBlob(file);

    // Récupération des hashes stockés dans Supabase
    let { data: storedHashes, error } = await supabase
        .from("frame_hashes")
        .select("*");

    if (error) {
        console.error("Erreur récupération hashes :", error);
        resultDiv.textContent = "Erreur lors de la récupération des hashes.";
        return;
    }

    // Comparaison frame par frame
    const mismatches = [];
    for (let i = 0; i < hashes.length; i++) {
        const stored = storedHashes.find(h => h.frame_index === i);
        if (!stored || stored.hash !== hashes[i].hash) {
            mismatches.push(i);
        }
    }

    if (mismatches.length === 0) {
        resultDiv.textContent = "✅ Intégrité vérifiée : toutes les frames correspondent !";
    } else {
        resultDiv.innerHTML = `⚠️ Mismatch sur ${mismatches.length} frame(s) : ${mismatches.join(", ")}`;
    }
});

// Fonction pour extraire frames et calculer SHA-256
async function hashVideoBlob(videoBlob) {
    return new Promise((resolve) => {
        const offscreenVideo = document.createElement("video");
        offscreenVideo.src = URL.createObjectURL(videoBlob);
        offscreenVideo.muted = true;
        offscreenVideo.play();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        let hashes = [];
        let frameIndex = 0;

        offscreenVideo.addEventListener("loadedmetadata", () => {
            canvas.width = offscreenVideo.videoWidth;
            canvas.height = offscreenVideo.videoHeight;

            const fps = 2; // extraction toutes les 0.5s pour matcher l'encodeur
            offscreenVideo.currentTime = 0;

            offscreenVideo.addEventListener("seeked", async function processFrame() {
                ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                hashes.push({ frame_index: frameIndex, hash: hashHex });
                frameIndex++;

                if (offscreenVideo.currentTime + 1 / fps <= offscreenVideo.duration) {
                    offscreenVideo.currentTime += 1 / fps;
                } else {
                    resolve(hashes);
                }
            });

            // Déclenche la première frame
            offscreenVideo.currentTime = 0;
        });
    });
}
