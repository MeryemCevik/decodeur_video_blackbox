import { supabase } from "./supabaseClient.js";

/* =========================
   DOM
   ========================= */
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

/* =========================
   HASH CANVAS (même que encodeur)
   ========================= */
async function hashCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = imageData.data.buffer;
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/* =========================
   HASH FRAME
   ========================= */
async function hashFrame(video, time) {
    return new Promise(resolve => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");

        const onSeeked = async () => {
            video.removeEventListener("seeked", onSeeked);
            await new Promise(r => setTimeout(r, 80)); // laisser frame se stabiliser

            ctx.drawImage(video, 0, 0, 32, 32);
            const hash = await hashCanvas(canvas);
            console.log(`[DECODEUR] ${time.toFixed(2)}s → ${hash.slice(0,16)}…`);
            resolve(hash);
        };

        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(time, video.duration - 0.1);
    });
}

/* =========================
   RÉCUPÉRATION HASHES ENCODEUR
   ========================= */
async function getStoredHashes() {
    const { data, error } = await supabase
        .from("frame_hashes")
        .select("hash");

    if (error) throw error;

    console.log(`[DECODEUR] ${data.length} hashes récupérés`);
    return data.map(d => d.hash);
}

/* =========================
   VÉRIFICATION VIDÉO
   ========================= */
async function verifyVideo(file) {
    resultDiv.textContent = "Vérification en cours…";
    videoContainer.innerHTML = "";

    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    videoContainer.appendChild(video);

    await new Promise(r => video.addEventListener("loadedmetadata", r));
    video.pause();

    console.log("[DECODEUR] Durée vidéo :", video.duration);

    const storedHashes = await getStoredHashes();

    let total = 0;
    let matched = 0;
    const interval = 0.5;

    for (let t = 0; t < video.duration; t += interval) {
        total++;
        const hash = await hashFrame(video, t);

        if (storedHashes.includes(hash)) {
            matched++;
            console.log(`✔ MATCH à ${t.toFixed(2)}s`);
        } else {
            console.warn(`✘ MISMATCH à ${t.toFixed(2)}s`);
        }

        resultDiv.textContent = `${matched} / ${total}`;
    }

    const percent = Math.round((matched / total) * 100);
    console.log(`[DECODEUR] Résultat final : ${percent}%`);

    resultDiv.textContent =
        percent >= 70
            ? `Intégrité OK (${percent}%)`
            : `Vidéo altérée (${percent}%)`;
}

verifyBtn.addEventListener("click", () => {
    if (uploadedVideo.files.length) {
        verifyVideo(uploadedVideo.files[0]);
    }
});
