import { supabase } from "./supabaseClient.js";

// DOM
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// HASH FRAME (aligné encodeur)
async function hashFrame(video, time) {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        const onSeeked = async () => {
            video.removeEventListener("seeked", onSeeked);

            // laisser le frame se stabiliser
            await new Promise(r => setTimeout(r, 50));

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

                console.log(`Frame ${time.toFixed(2)}s → ${hashHex.slice(0,16)}...`);
                resolve(hashHex);
            }, "image/png");
        };

        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(time, video.duration - 0.05);
    });
}

// Récupération hashes encodeur
async function getStoredHashes() {
    const { data, error } = await supabase
        .from("frame_hashes")
        .select("hash");

    if (error) throw error;

    console.log("Hashes encodeur récupérés :", data.length);
    return data.map(d => d.hash);
}

// VÉRIFICATION
async function verifyVideo(file) {
    resultDiv.textContent = "Vérification en cours...";
    videoContainer.innerHTML = "";

    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.width = 400;
    videoContainer.appendChild(video);

    await new Promise(r => video.addEventListener("loadedmetadata", r));
    video.pause();

    console.log("Durée vidéo :", video.duration);

    const storedHashes = await getStoredHashes();
    if (!storedHashes.length) {
        resultDiv.textContent = "Aucun hash enregistré.";
        return;
    }

    const interval = 0.5; // EXACTEMENT comme encodeur
    let totalFrames = 0;
    let matchedFrames = 0;

    for (let t = 0; t < video.duration; t += interval) {
        totalFrames++;

        const hash = await hashFrame(video, t);

        if (storedHashes.includes(hash)) {
            matchedFrames++;
            console.log(`✔ Match à ${t.toFixed(2)}s`);
        } else {
            console.warn(`✘ Mismatch à ${t.toFixed(2)}s`);
        }

        resultDiv.textContent = `Frames valides : ${matchedFrames} / ${totalFrames}`;
    }

    const ratio = matchedFrames / totalFrames;
    const percent = Math.round(ratio * 100);

    console.log(`Résultat final : ${matchedFrames}/${totalFrames} (${percent}%)`);

    if (ratio >= 0.7) {
        resultDiv.textContent =
            `Frames valides : ${matchedFrames} / ${totalFrames} (${percent}%) — Intégrité OK ✅`;
    } else {
        resultDiv.textContent =
            `Frames valides : ${matchedFrames} / ${totalFrames} (${percent}%) — Vidéo altérée ❌`;
    }
}

// EVENT
verifyBtn.addEventListener("click", async () => {
    if (!uploadedVideo.files.length) {
        alert("Veuillez sélectionner une vidéo");
        return;
    }
    await verifyVideo(uploadedVideo.files[0]);
});
