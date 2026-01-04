import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

    console.log("Décodeur chargé");

    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    /* =========================
       RÉCUPÉRATION DES HASHES
       ========================= */
    async function getServerHashes() {
        console.log("Récupération des hashes serveur...");

        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash");

        if (error) {
            console.error("Erreur Supabase :", error);
            return [];
        }

        console.log("Hashes récupérés :", data.length);
        return data.map(h => h.hash);
    }

    /* =========================
       HASH D’UNE FRAME
       ========================= */
    async function hashFrame(canvas) {
        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/png")
        );

        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        return hashArray
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    /* =========================
       EXTRACTION DES FRAMES
       ========================= */
    async function extractVideoHashes(videoBlob) {
        console.log("Extraction des frames vidéo");

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

                console.log("Durée vidéo :", video.duration, "s");

                video.play();

                const timer = setInterval(async () => {
                    if (video.ended) {
                        clearInterval(timer);
                        console.log("Fin extraction :", hashes.length);
                        resolve(hashes);
                        return;
                    }

                    console.log("Frame à", video.currentTime.toFixed(2), "s");
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const hash = await hashFrame(canvas);
                    hashes.push(hash);

                }, INTERVAL);
            });
        });
    }

    /* =========================
       VÉRIFICATION (SEUIL 60 %)
       ========================= */
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "Analyse en cours...";

        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;

        videoHashes.forEach((h, i) => {
            if (serverHashes.includes(h)) {
                console.log("MATCH frame", i);
                matchCount++;
            } else {
                console.log("NO MATCH frame", i);
            }
        });

        const ratio = matchCount / videoHashes.length;
        const percent = (ratio * 100).toFixed(2);

        if (ratio >= 0.6) {
            resultDiv.textContent =
                `Vidéo VALIDE
                 ${matchCount}/${videoHashes.length} frames (${percent} %)`;
        } else {
            resultDiv.textContent =
                `Vidéo NON valide
                 ${matchCount}/${videoHashes.length} frames (${percent} %)`;
        }
    }

    /* =========================
       BOUTON VÉRIFIER
       ========================= */
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
