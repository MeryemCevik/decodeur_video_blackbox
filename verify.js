import { supabase } from "./supabaseClient.js";

// DOM
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

// Log helper
function log(msg) {
    console.log(msg);
    resultDiv.innerHTML += msg + "<br>";
}

/* =========================
   HASH D’UNE FRAME (IDENTIQUE À L’ENCODEUR)
   ========================= */
async function hashFrame(video, time) {
    return new Promise(resolve => {
        const SIZE = 128;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        video.currentTime = time;
        video.onseeked = async () => {
            ctx.drawImage(video, 0, 0, SIZE, SIZE);

            // grayscale (IMPORTANT)
            const img = ctx.getImageData(0, 0, SIZE, SIZE);
            for (let i = 0; i < img.data.length; i += 4) {
                const g =
                    img.data[i] * 0.299 +
                    img.data[i + 1] * 0.587 +
                    img.data[i + 2] * 0.114;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
            }
            ctx.putImageData(img, 0, 0);

            const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
            const buffer = await blob.arrayBuffer();

            const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
            const hashHex = [...new Uint8Array(hashBuffer)]
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");

            resolve(hashHex);
        };
    });
}

/* =========================
   VÉRIFICATION VIDÉO
   ========================= */
async function verifyVideo(file) {
    resultDiv.innerHTML = "";
    videoContainer.innerHTML = "";

    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    videoContainer.appendChild(video);

    await video.play();
    video.pause();

    log(`Durée vidéo : ${video.duration.toFixed(2)} s`);

    // Récupération des hashes assureur
    const { data: storedHashes, error } = await supabase
        .from("frame_hashes")
        .select("hash")
        .order("created_at");

    if (error || !storedHashes.length) {
        log("Aucun hash stocké côté assureur");
        return;
    }

    log(`Hashes stockés : ${storedHashes.length}`);

    let matched = 0;
    let total = 0;
    let index = 0;

    for (let t = 0; t < video.duration; t += 0.5) {
        const computedHash = await hashFrame(video, t);
        const storedHash = storedHashes[index]?.hash;

        log(`Frame ${index} @ ${t.toFixed(2)}s`);
        log(`→ calculé : ${computedHash}`);
        log(`→ stocké  : ${storedHash}`);

        if (computedHash === storedHash) {
            log("✔ MATCH<br>");
            matched++;
        } else {
            log("✘ MISMATCH<br>");
        }

        total++;
        index++;
    }

    const percent = Math.round((matched / total) * 100);
    log(`<strong>Résultat final : ${matched} / ${total} (${percent}%)</strong>`);

    resultDiv.innerHTML +=
        percent >= 70
            ? "<br><strong>Intégrité OK</strong>"
            : "<br><strong>Vidéo altérée</strong>";
}

/* =========================
   EVENT
   ========================= */
verifyBtn.addEventListener("click", () => {
    if (!uploadedVideo.files.length) {
        alert("Veuillez sélectionner une vidéo");
        return;
    }
    verifyVideo(uploadedVideo.files[0]);
});
