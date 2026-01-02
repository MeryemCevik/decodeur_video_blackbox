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

        const onSeeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.removeEventListener('seeked', onSeeked);

            canvas.toBlob(async (blob) => {
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                console.log(`Hash frame à ${time.toFixed(2)}s : ${hashHex.slice(0,16)}...`);
                resolve(hashHex);
            }, 'image/png');
        };

        video.addEventListener('seeked', onSeeked);
        video.currentTime = Math.min(time, video.duration - 0.05);
    });
}

// Récupération des hashes stockés
async function getStoredHashes() {
    const { data, error } = await supabase.from('frame_hashes').select('hash');
    if (error) {
        console.error("Erreur récupération hashes:", error);
        throw new Error("Erreur récupération hashes depuis Supabase");
    }
    console.log("Hashes récupérés :", data.length);
    return data.map(d => d.hash);
}

// Fonction principale
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

    // ATTENTE des metadata
    await new Promise(resolve => videoElem.addEventListener('loadedmetadata', resolve));
    console.log("Video metadata loaded, durée :", videoElem.duration);

    // Si duration = Infinity (problème .webm)
    if (!isFinite(videoElem.duration)) {
        console.warn("Durée vidéo = Infinity, attendre un peu...");
        await new Promise(r => setTimeout(r, 500));
        console.log("Nouvelle durée :", videoElem.duration);
    }

    const storedHashes = await getStoredHashes();
    if (!storedHashes.length) {
        console.warn("Aucun hash stocké !");
        resultDiv.textContent = "Erreur : aucun hash stocké pour comparaison.";
        return;
    }

    const fps = 2;
    let validFrames = 0;
    const totalFrames = Math.ceil(videoElem.duration * fps);

    // Affichage compteur en direct
    resultDiv.textContent = `Vérification : 0 / ${totalFrames}`;

    for (let t = 0; t < videoElem.duration; t += 1 / fps) {
        const hash = await hashFrame(videoElem, t);

        // Comparaison stricte
        const found = storedHashes.includes(hash);
        if (found) validFrames++;

        // DEBUG : afficher mismatch partiel
        if (!found) {
            const matchPartial = storedHashes.some(h => h.startsWith(hash.slice(0, 8)));
            if (matchPartial) console.log(`Frame ${t.toFixed(2)}s : hash proche trouvé (premiers caractères match)`);
            else console.log(`Frame ${t.toFixed(2)}s : hash non trouvé du tout`);
        }

        // Update compteur live
        resultDiv.textContent = `Vérification : ${validFrames} / ${totalFrames}`;
    }

    console.log(`Frames valides : ${validFrames} / ${totalFrames}`);
    resultDiv.textContent += ` | ${validFrames === totalFrames ? "Intégrité OK ✅" : "Frames modifiées ❌"}`;
}

// Bouton
verifyBtn.addEventListener("click", async () => {
    if (!uploadedVideo.files.length) {
        alert("Veuillez sélectionner une vidéo");
        return;
    }
    await verifyVideo(uploadedVideo.files[0]);
});

// Statut réseau debug
window.addEventListener('online', () => console.log("Connexion réseau : en ligne"));
window.addEventListener('offline', () => console.log("Connexion réseau : hors ligne"));
