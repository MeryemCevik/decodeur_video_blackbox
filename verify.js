import { supabase } from "./supabaseClient.js";

const fileInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");
const videoIdInput = document.getElementById("videoIdInput");

// Extraction des frames depuis la vidéo fournie
async function extractFrames(videoBlob, intervalMs = 500) {
    return new Promise((resolve) => {
        const videoEl = document.createElement("video");
        videoEl.src = URL.createObjectURL(videoBlob);
        videoEl.muted = true;
        videoEl.preload = "metadata";

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const hashes = [];
        let currentTime = 0;

        videoEl.onloadedmetadata = () => {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;

            function seek() {
                if (currentTime > videoEl.duration) {
                    resolve(hashes);
                    return;
                }
                videoEl.currentTime = currentTime;
            }

            videoEl.onseeked = async () => {
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
                const buffer = await blob.arrayBuffer();

                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashHex = Array.from(new Uint8Array(hashBuffer))
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");

                hashes.push(hashHex);

                currentTime += intervalMs / 1000;
                seek();
            };

            seek();
        };
    });
}

async function verifyVideo() {
    const file = fileInput.files[0];
    const videoId = videoIdInput.value.trim();

    if (!videoId) {
        alert("Saisis le video_id.");
        return;
    }

    if (!file) {
        alert("Choisis une vidéo.");
        return;
    }

    resultDiv.textContent = "Extraction des frames…";

    const extractedHashes = await extractFrames(file, 500);

    const { data } = await supabase
        .from("frame_hashes")
        .select("frame_index, hash")
        .eq("video_id", videoId)
        .order("frame_index");

    if (!data || data.length === 0) {
        resultDiv.textContent = "Aucun hash trouvé pour ce video_id.";
        return;
    }

    const storedHashes = data.map(r => r.hash);

    const minLen = Math.min(extractedHashes.length, storedHashes.length);
    let matches = 0;

    for (let i = 0; i < minLen; i++) {
        if (extractedHashes[i] === storedHashes[i]) matches++;
    }

    const ratio = matches / minLen;

    resultDiv.innerHTML = `
        <p>Frames comparées : ${minLen}</p>
        <p>Correspondances exactes : ${matches}</p>
        <p>Taux de match : ${(ratio * 100).toFixed(1)}%</p>
        <p>Intégrité : ${
            ratio === 1 ? "<span style='color:green'>100% – OK</span>" :
                          "<span style='color:red'>Altération détectée</span>"
        }</p>
    `;

    videoContainer.innerHTML = "";
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    vid.controls = true;
    vid.width = 400;
    videoContainer.appendChild(vid);
}

verifyBtn.addEventListener("click", verifyVideo);
