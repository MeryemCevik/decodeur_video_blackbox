import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------
    // DOM Elements
    // -------------------------------
    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    // -------------------------------
    // Constants
    // -------------------------------
    const DHASH_WIDTH = 9;
    const DHASH_HEIGHT = 8;
    const MAX_HAMMING = 15; // Tolérance pour différences légères
    const MAX_TIMESTAMP_DIFF = 5 * 60 * 1000; // 5 minutes max entre timestamps

    // -------------------------------
    // Distance de Hamming
    // -------------------------------
    function hammingDistance(hash1, hash2) {
        let dist = 0;
        for (let i = 0; i < hash1.length; i++) if (hash1[i] !== hash2[i]) dist++;
        return dist;
    }

    // -------------------------------
    // Calcul D-Hash
    // -------------------------------
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

    // -------------------------------
    // Extraction des frames de la vidéo
    // -------------------------------
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
            const INTERVAL = 500; // 2 frames/sec

            video.addEventListener("loadedmetadata", () => {
                video.play();
                const timer = setInterval(async () => {
                    if (video.ended) { 
                        clearInterval(timer); 
                        resolve(hashes); 
                        return; 
                    }
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(video, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
                    const hash = await computeDHash(canvas);
                    const created_at = new Date().toISOString();
                    hashes.push({ hash, created_at });
                }, INTERVAL);
            });
        });
    }

    // -------------------------------
    // Récupération des hashs côté serveur
    // -------------------------------
    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash, created_at")
            .order("created_at", { ascending: true });

        if (error) {
            console.error(error);
            return [];
        }

        // Filtrage éventuel des doublons côté serveur
        const uniqueHashes = [];
        let lastHash = "";
        for (const h of data) {
            if (h.hash !== lastHash) {
                uniqueHashes.push(h);
                lastHash = h.hash;
            }
        }
        return uniqueHashes;
    }

    // -------------------------------
    // Vérification de la vidéo
    // -------------------------------
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "🔍 Analyse en cours...";
        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;
        let lastIndex = 0;

        for (let i = 0; i < videoHashes.length; i++) {
            const vFrame = videoHashes[i];
            let matched = false;

            // Comparaison avec les frames serveur à partir de lastIndex
            for (let j = lastIndex; j < serverHashes.length; j++) {
                const sFrame = serverHashes[j];

                // Optionnel : vérifie si le timestamp est cohérent (±5 min)
                const tsDiff = Math.abs(new Date(vFrame.created_at) - new Date(sFrame.created_at));
                if (tsDiff > MAX_TIMESTAMP_DIFF) continue;

                // Vérifie la similarité via Hamming
                if (hammingDistance(vFrame.hash, sFrame.hash) <= MAX_HAMMING) {
                    matchCount++;
                    lastIndex = j + 1; // ne pas revenir en arrière
                    matched = true;
                    console.log(`✅ MATCH frame ${i} hash=${vFrame.hash} avec serveur hash=${sFrame.hash}`);
                    break;
                }
            }

            if (!matched) console.log(`❌ NO MATCH frame ${i} hash=${vFrame.hash}`);
        }

        // Résultat final : nombre de frames matchées
        resultDiv.textContent = `Frames matchées : ${matchCount} / ${videoHashes.length}`;
    }

    // -------------------------------
    // Event listener
    // -------------------------------
    verifyBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) { 
            resultDiv.textContent = "Veuillez sélectionner une vidéo."; 
            return; 
        }
        await verifyVideo(file);
    });
});
