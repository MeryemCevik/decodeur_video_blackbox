import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    const DHASH_WIDTH = 9;
    const DHASH_HEIGHT = 8;
    const MAX_HAMMING = 15;

    function hammingDistance(hash1, hash2) {
        let dist = 0;
        for (let i = 0; i < hash1.length; i++) if (hash1[i] !== hash2[i]) dist++;
        return dist;
    }

    async function computeDHash(canvas) {
        const ctx = canvas.getContext("2d");
        const imgData = ctx.getImageData(0, 0, DHASH_WIDTH, DHASH_HEIGHT);
        let hash = "";
        for (let y = 0; y < DHASH_HEIGHT; y++) {
            for (let x = 0; x < DHASH_WIDTH - 1; x++) {
                const idx = (y * DHASH_WIDTH + x) * 4;
                const lum1 = 0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2];
                const idx2 = (y * DHASH_WIDTH + x + 1) * 4;
                const lum2 = 0.299 * imgData.data[idx2] + 0.587 * imgData.data[idx2 + 1] + 0.114 * imgData.data[idx2 + 2];
                hash += lum1 > lum2 ? "1" : "0";
            }
        }
        return hash;
    }

    async function extractVideoHashes(videoBlob) {
        return new Promise(resolve => {
            const video = document.createElement("video");
            video.src = URL.createObjectURL(videoBlob);
            video.muted = true;
            videoContainer.innerHTML = "";
            videoContainer.appendChild(video);

            const canvas = document.createElement("canvas");
            canvas.width = DHASH_WIDTH;
            canvas.height = DHASH_HEIGHT;

            const hashes = [];
            const INTERVAL = 500;

            video.addEventListener("loadedmetadata", () => {
                video.play();
                const timer = setInterval(async () => {
                    if (video.ended) { clearInterval(timer); resolve(hashes); return; }
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(video, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
                    const hash = await computeDHash(canvas);
                    hashes.push({ hash, created_at: new Date().toISOString() });
                }, INTERVAL);
            });
        });
    }

    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash, created_at")
            .order("created_at", { ascending: true });
        if (error) { console.error(error); return []; }
        return data;
    }

    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "🔍 Analyse en cours...";
        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;
        let lastIndex = 0;

        for (let i = 0; i < videoHashes.length; i++) {
            const vFrame = videoHashes[i];
            let matched = false;

            // Compare seulement aux frames suivantes
            for (let j = lastIndex; j < serverHashes.length; j++) {
                if (hammingDistance(vFrame.hash, serverHashes[j].hash) <= MAX_HAMMING) {
                    matchCount++;
                    lastIndex = j + 1; // ne pas regarder en arrière
                    matched = true;
                    console.log(`✅ MATCH frame ${i} hash=${vFrame.hash}`);
                    break;
                }
            }

            if (!matched) console.log(`❌ NO MATCH frame ${i} hash=${vFrame.hash}`);
        }

        // Affiche juste le nombre de frames matchées
        resultDiv.textContent = `Frames matchées : ${matchCount} / ${videoHashes.length}`;
    }

    verifyBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) { resultDiv.textContent = "Veuillez sélectionner une vidéo."; return; }
        await verifyVideo(file);
    });
});
