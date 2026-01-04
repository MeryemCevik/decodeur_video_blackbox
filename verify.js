import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

    console.log("🔵 Décodeur chargé");

    const video = document.getElementById("preview");
    const uploadBtn = document.getElementById("uploadBtn");
    const statusDiv = document.getElementById("status");

    /* =========================
       RÉCUPÉRATION DES HASHES
       ========================= */
    async function getServerHashes() {
        console.log("📡 Récupération des hashes serveur...");
        const { data, error } = await supabase
            .from("frame_hashes")
            .select("hash");

        if (error) {
            console.error("❌ Erreur récupération hashes :", error);
            return [];
        }

        console.log(`✅ ${data.length} hashes récupérés`);
        return data.map(h => h.hash);
    }

    /* =========================
       HASH D’UNE FRAME
       ========================= */
    async function hashFrame(canvas) {
        console.log("🧮 Hash d'une frame...");
        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/png")
        );

        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        const hash = hashArray
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        console.log("➡️ Hash généré :", hash);
        return hash;
    }

    /* =========================
       EXTRACTION DES FRAMES
       ========================= */
    async function extractVideoHashes(videoBlob) {
        console.log("🎞️ Début extraction frames vidéo");

        return new Promise(resolve => {

            const tempVideo = document.createElement("video");
            tempVideo.src = URL.createObjectURL(videoBlob);
            tempVideo.muted = true;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            const hashes = [];
            const INTERVAL = 500;

            tempVideo.addEventListener("loadedmetadata", () => {
                console.log("📐 Métadonnées vidéo chargées");
                console.log("Durée :", tempVideo.duration, "s");

                canvas.width = tempVideo.videoWidth;
                canvas.height = tempVideo.videoHeight;

                tempVideo.play();

                const interval = setInterval(async () => {
                    if (tempVideo.ended) {
                        clearInterval(interval);
                        console.log("⏹️ Fin vidéo atteinte");
                        console.log("📦 Hashes extraits :", hashes.length);
                        resolve(hashes);
                        return;
                    }

                    console.log("📸 Capture frame à", tempVideo.currentTime.toFixed(2), "s");
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
        console.log("🔍 Vérification intégrité vidéo");
        statusDiv.textContent = "Analyse en cours...";

        const serverHashes = await getServerHashes();
        const videoHashes = await extractVideoHashes(videoBlob);

        console.log("📊 Comparaison hashes...");
        let matchCount = 0;

        videoHashes.forEach((h, index) => {
            if (serverHashes.includes(h)) {
                console.log(`✅ MATCH frame ${index}`);
                matchCount++;
            } else {
                console.warn(`❌ NO MATCH frame ${index}`);
            }
        });

        const ratio = ((matchCount / videoHashes.length) * 100).toFixed(2);

        console.log("🎯 Résultat final :", matchCount, "/", videoHashes.length);

        statusDiv.textContent =
            `Intégrité : ${matchCount}/${videoHashes.length} frames (${ratio} %)`;
    }

    /* =========================
       CHARGEMENT VIDÉO
       ========================= */
    uploadBtn.addEventListener("click", () => {
        console.log("📂 Sélection vidéo conducteur");

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "video/webm,video/*";

        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) {
                console.warn("⚠️ Aucun fichier sélectionné");
                return;
            }

            console.log("🎥 Vidéo chargée :", file.name);
            video.src = URL.createObjectURL(file);
            video.controls = true;

            await verifyVideoIntegrity(file);
        };

        input.click();
    });

});
