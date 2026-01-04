import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

    const video = document.getElementById("preview");
    const uploadBtn = document.getElementById("uploadBtn");
    const statusDiv = document.getElementById("status");

    /* =========================
       RÉCUPÉRATION DES HASHES
       ========================= */
    async function getServerHashes() {
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash");

        if (error) {
            console.error("Erreur récupération hashes :", error);
            return [];
        }
        return data.map(h => h.hash);
    }

    /* =========================
       HASH FRAME (IDENTIQUE ENCODEUR)
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
        return new Promise(resolve => {

            const tempVideo = document.createElement("video");
            tempVideo.src = URL.createObjectURL(videoBlob);
            tempVideo.muted = true;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            const hashes = [];
            const INTERVAL = 500; // EXACTEMENT comme l’encodeur

            tempVideo.addEventListener("loadedmetadata", () => {
                canvas.width = tempVideo.videoWidth;
                canvas.height = tempVideo.videoHeight;

                tempVideo.play();

                const interval = setInterval(async () => {
                    if (tempVideo.ended) {
                        clearInterval(interval);
                        resolve(hashes);
                        return;
                    }

                    ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                    const hash = await hashFrame(canvas);
                    hashes.push(hash);

                }, INTERVAL);
            });
        });
    }

    /* =========================
       VÉRIFICATION INTÉGRITÉ
       ========================= */
    async function verifyVideoIntegrity(videoBlob) {
        statusDiv.textContent = "Analyse de la vidéo en cours...";

        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        let matchCount = 0;

        videoHashes.forEach(h => {
            if (serverHashes.includes(h)) {
                matchCount++;
            }
        });

        const ratio = ((matchCount / videoHashes.length) * 100).toFixed(2);

        statusDiv.textContent =
            `Résultat intégrité :
             ${matchCount}/${videoHashes.length} frames valides
             (${ratio} %)`;
    }

    /* =========================
       CHARGEMENT VIDÉO CONDUCTEUR
       ========================= */
    uploadBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "video/webm,video/*";

        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;

            video.src = URL.createObjectURL(file);
            video.controls = true;

            await verifyVideoIntegrity(file);
        };

        input.click();
    });

});
