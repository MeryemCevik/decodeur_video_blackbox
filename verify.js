import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
    console.log("Décodeur chargé");

    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    const TIME_THRESHOLD = 1000; // ms tolérance pour created_at

    // Récup hashes serveur
    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash, created_at");

        if (error) {
            console.error("Erreur récupération hashes:", error);
            return [];
        }

        console.log(`Hashes serveur récupérés : ${data.length}`);
        return data;
    }

    // Hash d'une frame
    async function hashFrame(canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // Extraction des frames + hash + created_at approximatif
    async function extractVideoHashes(videoBlob) {
        return new Promise(resolve => {
            const video = document.createElement("video");
            video.src = URL.createObjectURL(videoBlob);
            video.muted = true;
            video.controls = true;
            videoContainer.innerHTML = "";
            videoContainer.appendChild(video);

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            const hashes = [];
            const INTERVAL = 500;

            video.addEventListener("loadedmetadata", () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                video.play();

                const timer = setInterval(async () => {
                    if (video.ended) {
                        clearInterval(timer);
                        resolve(hashes);
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const hash = await hashFrame(canvas);
                    const created_at = new Date().toISOString();
                    hashes.push({ hash, created_at });
                }, INTERVAL);
            });
        });
    }

    // Vérification intégrité
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "Analyse en cours...";
        const serverData = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;

        videoHashes.forEach((vFrame, i) => {
            const matched = serverData.find(sFrame => 
                sFrame.hash === vFrame.hash &&
                Math.abs(new Date(sFrame.created_at) - new Date(vFrame.created_at)) <= TIME_THRESHOLD
            );
            if (matched) {
                console.log(`✅ MATCH frame ${i} hash=${vFrame.hash}`);
                matchCount++;
            } else {
                console.log(`❌ NO MATCH frame ${i} hash=${vFrame.hash}`);
            }
        });

        const ratio = matchCount / videoHashes.length;
        const percent = (ratio * 100).toFixed(2);

        if (ratio >= 0.6) {
            resultDiv.textContent = `Vidéo VALIDE\n${matchCount}/${videoHashes.length} frames (${percent} %)`;
        } else {
            resultDiv.textContent = `Vidéo NON valide\n${matchCount}/${videoHashes.length} frames (${percent} %)`;
        }
    }

    // Bouton vérifier
    verifyBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) {
            resultDiv.textContent = "Veuillez sélectionner une vidéo.";
            return;
        }
        console.log("Vidéo sélectionnée :", file.name);
        await verifyVideo(file);
    });
});
