import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

    console.log("Décodeur chargé");

    const fileInput = document.getElementById("uploadedVideo");
    const verifyBtn = document.getElementById("verifyBtn");
    const resultDiv = document.getElementById("result");
    const videoContainer = document.getElementById("videoContainer");

    /* =========================
       RÉCUPÉRATION DES HASHES SERVEUR
       ========================= */
    async function getServerHashes() {
        console.log("Récupération des hashes depuis Supabase...");

        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash");

        if (error) {
            console.error("Erreur Supabase :", error);
            return [];
        }

        console.log("Nombre de hashes serveur :", data.length);
        return data.map(h => h.hash);
    }

    /* =========================
       HASH D’UNE FRAME (IDENTIQUE ENCODEUR)
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
       EXTRACTION DES FRAMES VIDÉO
       ========================= */
    async function extractVideoHashes(videoBlob) {
        console.log("Extraction des frames vidéo...");

        return new Promise(resolve => {

            const video = document.createElement("video");
            video.src = URL.createObjectURL(videoBlob);
            video.muted = true;

            videoContainer.innerHTML = "";
            video.controls = true;
            videoContainer.appendChild(video);

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            const hashes = [];
            const INTERVAL = 500; // même valeur que l’encodeur

            video.addEventListener("loadedmetadata", () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                console.log("Durée vidéo :", video.duration, "secondes");

                video.play();

                const timer = setInterval(async () => {
                    if (video.ended) {
                        clearInterval(timer);
                        console.log("Fin extraction frames :", hashes.length);
                        resolve(hashes);
                        return;
                    }

                    console.log("Capture frame à", video.currentTime.toFixed(2), "s");
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const hash = await hashFrame(canvas);
                    hashes.push(hash);

                }, INTERVAL);
            });
        });
    }

    /* =========================
       VÉRIFICATION INTÉGRITÉ (SEUIL 60 %)
       ========================= */
    async function verifyVideo(videoBlob) {
        resultDiv.textContent = "Analyse de la vidéo en cours...";

        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;

        videoHashes.forEach((hash, index) => {
            if (serverHashes.includes(hash)) {
                console.log("MATCH frame", index);
                matchCount++;
            } else {
                console.log("NO MATCH frame", index);
            }
        });

        const ratio = matchCount / videoHashes.length;
        const percent = (ratio * 100).toFixed(2);

        console.log("Résultat :", matchCount, "/", videoHashes.length, percent + "%");

        if (ratio >= 0.6) {
            resultDiv.textContent =
                `Vidéo considérée comme VALIDE
                (${matchCount}/${videoHashes.length} frames – ${percent} %)`;
        } else {
            resultDiv.textContent =
                `Vidéo NON valide
                (${matchCount}/${videoHashes.length} frames – ${percent} %)`;
        }
    }

    /* =========================
       BOUTON DE VÉRIFICATION
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
