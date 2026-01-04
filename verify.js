import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

    console.log("🔵 Décodeur chargé");

    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    // Récupération hashes serveur
    async function getServerHashes() {
        console.log("📡 Récupération des hashes serveur...");
        const { data, error } = await supabase.from("frame_hashes").select("hash");
        if (error) return console.error(error), [];

        console.group("📦 Hashes serveur");
        data.forEach((h, i) => console.log(i, h.hash));
        console.groupEnd();

        return data.map(h => h.hash);
    }

    // Hash d’une frame
    async function hashFrame(canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // Extraction frames vidéo
    async function extractVideoHashes(videoBlob) {
        console.log("🎞️ Extraction frames vidéo");

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
                        console.group("🎥 Hashes vidéo");
                        hashes.forEach((h, i) => console.log(i, h));
                        console.groupEnd();
                        resolve(hashes);
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const hash = await hashFrame(canvas);
                    hashes.push(hash);
                    console.log("📸 Hash frame :", hash);
                }, INTERVAL);
            });
        });
    }

    // Vérification intégrité (60 %)
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "Analyse en cours...";

        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;
        videoHashes.forEach(hash => {
            if (serverHashes.includes(hash)) matchCount++, console.log("✅ MATCH hash :", hash);
            else console.log("❌ NO MATCH hash :", hash);
        });

        const ratio = matchCount / videoHashes.length;
        const percent = (ratio * 100).toFixed(2);

        if (ratio >= 0.6) {
            resultDiv.textContent = `✅ Vidéo VALIDE\n${matchCount}/${videoHashes.length} frames (${percent} %)`;
        } else {
            resultDiv.textContent = `❌ Vidéo NON valide\n${matchCount}/${videoHashes.length} frames (${percent} %)`;
        }
    }

    // Bouton vérifier
    verifyBtn.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return resultDiv.textContent = "Veuillez sélectionner une vidéo.";
        console.log("🎥 Vidéo sélectionnée :", file.name);
        await verifyVideo(file);
    });

});
