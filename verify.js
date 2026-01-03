import { supabase } from "./supabaseClient.js";

const fileInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

/* ============================================================
   1) EXTRACTION DES FRAMES DE LA VIDÉO FOURNIE PAR LE CONDUCTEUR
   ============================================================ */
async function extractFrames(videoBlob, intervalMs = 500) {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(videoBlob);
        video.muted = true;
        video.playsInline = true;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const frames = [];

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            let currentTime = 0;

            const capture = () => {
                if (currentTime > video.duration) {
                    resolve(frames);
                    return;
                }

                video.currentTime = currentTime;
            };

            video.ontimeupdate = async () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
                const buffer = await blob.arrayBuffer();

                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                frames.push({
                    timestamp: currentTime,
                    hash: hashHex
                });

                currentTime += intervalMs / 1000;
                capture();
            };

            capture();
        };
    });
}

/* ============================================================
   2) RÉCUPÉRATION DES HASHES STOCKÉS PAR L’ASSUREUR
   ============================================================ */
async function getStoredHashes() {
    const { data, error } = await supabase
        .from("frame_hashes")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Erreur récupération hashes:", error);
        return [];
    }

    return data.map(h => h.hash);
}

/* ============================================================
   3) COMPARAISON DES HASHES
   ============================================================ */
function compareHashes(extracted, stored) {
    let matches = 0;
    let missing = 0;

    const storedSet = new Set(stored);

    extracted.forEach(frame => {
        if (storedSet.has(frame.hash)) {
            matches++;
        } else {
            missing++;
        }
    });

    return {
        matches,
        missing,
        total: extracted.length,
        integrityOK: matches / extracted.length >= 0.8 // seuil 80%
    };
}

/* ============================================================
   4) PROCESSUS COMPLET DE VÉRIFICATION
   ============================================================ */
async function verifyVideo() {
    resultDiv.innerHTML = "Analyse en cours…";

    const file = fileInput.files[0];
    if (!file) {
        resultDiv.innerHTML = "Veuillez sélectionner une vidéo.";
        return;
    }

    /* 1) Extraction des frames */
    const extractedFrames = await extractFrames(file);
    console.log("Frames extraites :", extractedFrames.length);

    /* 2) Récupération des hashes stockés */
    const storedHashes = await getStoredHashes();
    console.log("Hashes stockés :", storedHashes.length);

    /* 3) Comparaison */
    const report = compareHashes(extractedFrames, storedHashes);

    /* 4) Affichage */
    resultDiv.innerHTML = `
        <h2>Résultat de la vérification</h2>
        <p><strong>Frames analysées :</strong> ${report.total}</p>
        <p><strong>Correspondances :</strong> ${report.matches}</p>
        <p><strong>Frames manquantes / altérées :</strong> ${report.missing}</p>
        <p><strong>Intégrité :</strong> 
            <span style="color:${report.integrityOK ? "green" : "red"}">
                ${report.integrityOK ? "VALIDÉE" : "NON VALIDÉE"}
            </span>
        </p>
    `;

    /* 5) Affichage vidéo */
    videoContainer.innerHTML = "";
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    vid.controls = true;
    vid.width = 400;
    videoContainer.appendChild(vid);
}

/* ============================================================
   5) ÉVÉNEMENTS
   ============================================================ */
verifyBtn.addEventListener("click", verifyVideo);
