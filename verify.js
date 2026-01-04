import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------
    // DOM Elements
    // -------------------------------
    const fileInput = document.getElementById("uploadedVideo"); // Input vidéo du conducteur
    const verifyBtn = document.getElementById("verifyBtn"); // Bouton pour lancer la vérification
    const resultDiv = document.getElementById("result"); // Zone d'affichage des résultats
    const videoContainer = document.getElementById("videoContainer"); // Zone pour afficher la vidéo

    // -------------------------------
    // Paramètres D-Hash
    // -------------------------------
    const DHASH_WIDTH = 9;
    const DHASH_HEIGHT = 8;
    const MAX_HAMMING = 15; // Seuil de distance de Hamming pour considérer deux frames similaires

    // -------------------------------
    // Calcul de la distance de Hamming
    // -------------------------------
    function hammingDistance(hash1, hash2) {
        let dist = 0;
        for (let i = 0; i < hash1.length; i++) 
            if (hash1[i] !== hash2[i]) dist++;
        return dist;
    }

    // -------------------------------
    // Calcul D-Hash pour une frame
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
    // Extraction des hashs depuis la vidéo fournie
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
            const INTERVAL = 500; // Capture une frame toutes les 0,5s

            video.addEventListener("loadedmetadata", () => {
                video.play();
                const timer = setInterval(async () => {
                    // Quand la vidéo est finie, on résout la promesse
                    if (video.ended) { clearInterval(timer); resolve(hashes); return; }

                    // Capture frame dans le canvas et calcul D-Hash
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(video, 0, 0, DHASH_WIDTH, DHASH_HEIGHT);
                    const hash = await computeDHash(canvas);
                    hashes.push({ hash, created_at: new Date().toISOString() }); // timestamp pour chaque frame
                }, INTERVAL);
            });
        });
    }

    // -------------------------------
    // Récupération des hashs stockés côté serveur
    // -------------------------------
    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash, created_at")
            .order("created_at", { ascending: true }); // Tri chronologique
        if (error) { console.error(error); return []; }
        return data;
    }

    // -------------------------------
    // Vérification de la vidéo fournie par le conducteur
    // -------------------------------
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "🔍 Analyse en cours...";
        
        // Récupération des hashs serveur et extraction des hashs vidéo
        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;
        let lastIndex = 0; // permet d'éviter de comparer une frame avec une frame déjà vérifiée

        for (let i = 0; i < videoHashes.length; i++) {
            const vFrame = videoHashes[i];
            let matched = false;

            // Comparer la frame à toutes les frames suivantes côté serveur
            for (let j = lastIndex; j < serverHashes.length; j++) {
                if (hammingDistance(vFrame.hash, serverHashes[j].hash) <= MAX_HAMMING) {
                    matchCount++;
                    lastIndex = j + 1; // ne pas revenir en arrière
                    matched = true;
                    console.log(`✅ MATCH frame ${i} hash=${vFrame.hash}`);
                    break;
                }
            }

            if (!matched) console.log(`❌ NO MATCH frame ${i} hash=${vFrame.hash}`);
        }

        // -------------------------------
        // Affichage du résultat : nombre de frames matchées
        // -------------------------------
        resultDiv.textContent = `Frames matchées : ${matchCount} / ${videoHashes.length}`;
    }

    // -------------------------------
    // Event listener pour le bouton vérifier
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
