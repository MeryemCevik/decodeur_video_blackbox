import { supabase } from "./supabaseClient.js";

// DOM Elements
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// Fonction pour calculer SHA-256 d'une frame
async function hashFrame(video, time) {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        // Ecouteur unique pour seeked
        const onSeeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.removeEventListener('seeked', onSeeked);

            canvas.toBlob(async (blob) => {
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                console.log(`Hash frame à ${time.toFixed(2)}s :`, hashHex.slice(0,16), "..."); // debug
                resolve(hashHex);
            }, 'image/png');
        };

        video.addEventListener('seeked', onSeeked);
        video.currentTime = Math.min(time, video.duration - 0.05); // éviter dépassement
    });
}

// Récupérer les hashes stockés côté Supabase
async function getStoredHashes() {
    const { data, error } = await supabase.from('frame_hashes').select('hash');
    if (error) {
        console.error("Erreur récupération hashes:", error);
        throw new Error("Erreur récupération hashes depuis Supabase");
    }
    console.log("Hashes stockés récupérés :", data.length, "hashes");
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

    // ATTENDRE la metadata pour la durée
    await new Promise(resolve => videoElem.addEventListener('loadedmetadata', resolve));
    console.log("Durée de la vidéo :", videoElem.duration, "s");

    const storedHashes = await getStoredHashes();
    if (!storedHashes.length) {
        console.warn("Aucun hash stocké pour comparaison ! Vérifier l'encodeur.");
        resultDiv.textContent = "Erreur : aucun hash stocké pour comparaison.";
        return;
    }

    const fps = 2; // frames par seconde pour vérification
    let validFrames = 0;
    const totalFrames = Math.ceil(videoElem.duration * fps);
    console.log("Total frames à vérifier (estimé) :", totalFrames);

    // Boucle sur les frames
    for (let t = 0; t < videoElem.duration; t += 1 / fps) {
        try {
            const hash = await hashFrame(videoElem, t);
            // Vérification stricte
            if (storedHashes.includes(hash)) {
                validFrames++;
            } else {
                console.warn(`Frame à ${t.toFixed(2)}s non trouvée dans Supabase`);
            }
        } catch (err) {
            console.error("Erreur lors du hash d'une frame :", err);
        }
    }

    console.log(`Frames valides : ${validFrames} / ${totalFrames}`);
    resultDiv.textContent = `Frames valides : ${validFrames} / ${totalFrames} | ${validFrames === totalFrames ? "Intégrité OK ✅" : "Frames modifiées ❌"}`;
}

// Bouton vérifier
verifyBtn.addEventListener("click", async () => {
    if (!uploadedVideo.files.length) {
        alert("Veuillez sélectionner une vidéo");
        return;
    }
    await verifyVideo(uploadedVideo.files[0]);
});

// Statut réseau optionnel (debug)
window.addEventListener('online', () => console.log("Connexion réseau : en ligne"));
window.addEventListener('offline', () => console.log("Connexion réseau : hors ligne"));
