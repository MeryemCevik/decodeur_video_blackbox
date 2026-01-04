import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    const DHASH_WIDTH = 9;
    const DHASH_HEIGHT = 8;
    const MAX_HAMMING = 15; // tolérance 15 bits
    const MAX_LOOKAHEAD = 50; // recherche seulement dans les 50 frames suivantes

    // Distance de Hamming entre deux D-Hash
    function hammingDistance(hash1, hash2) {
        let dist = 0;
        for (let i = 0; i < hash1.length; i++) if (hash1[i] !== hash2[i]) dist++;
        return dist;
    }

    // Calcul D-Hash d'une canvas
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

    // Extraction D-Hash par frame
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
            const INTERVAL = 1000;

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

    // Récupération hashes serveur triés par timestamp
    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash, created_at")
            .order("created_at", { ascending: true });
        if (error) { console.error(error); return []; }
        return data;
    }

    // Vérification vidéo
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "🔍 Analyse en cours...";
        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;
        let lastMatchedIndex = 0;

        videoHashes.forEach((vFrame, i) => {
            // Recherche seulement dans les 50 hashes suivants pour respecter chronologie
            const slice = serverHashes.slice(lastMatchedIndex, lastMatchedIndex + MAX_LOOKAHEAD);
            const match = slice.find(sFrame => hammingDistance(sFrame.hash, vFrame.hash) <= MAX_HAMMING);

            if (match) {
                matchCount++;
                lastMatchedIndex = serverHashes.indexOf(match) + 1;
                console.log(`✅ MATCH frame ${i} hash=${vFrame.hash}`);
            } else {
                console.log(`❌ NO MATCH frame ${i} hash=${vFrame.hash}`);
            }
        });

        const ratio = (matchCount / videoHashes.length) * 100;
        if (ratio >= 60) {
            resultDiv.textContent = `✅ Vidéo VALIDE (${matchCount}/${videoHashes.length} frames, ${ratio.toFixed(2)}%)`;
        } else {
            resultDiv.textContent = `❌ Vidéo NON valide (${matchCount}/${videoHashes.length} frames, ${ratio.toFixed(2)}%)`;
        }
    }

    verifyBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) { resultDiv.textContent = "Veuillez sélectionner une vidéo."; return; }
        await verifyVideo(file);
    });
});
