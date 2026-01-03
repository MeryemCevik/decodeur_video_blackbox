import { supabase } from "./supabaseClient.js";

async function extractFrames(videoBlob, intervalMs = 500) {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(videoBlob);
        video.muted = true;
        video.preload = "metadata";

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const frames = [];
        let currentTime = 0;

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            function seek() {
                if (currentTime > video.duration) {
                    resolve(frames);
                    return;
                }
                video.currentTime = currentTime;
            }

            video.onseeked = async () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
                const buffer = await blob.arrayBuffer();

                const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
                const hashHex = Array.from(new Uint8Array(hashBuffer))
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");

                frames.push(hashHex);

                currentTime += intervalMs / 1000;
                seek();
            };

            seek();
        };
    });
}

async function verifyVideo() {
    const file = document.getElementById("uploadedVideo").files[0];
    if (!file) return alert("Choisissez une vidéo");

    const extracted = await extractFrames(file);

    const { data } = await supabase
        .from("frame_hashes")
        .select("hash")
        .order("id");

    const stored = data.map(h => h.hash);

    let matches = 0;
    extracted.forEach((h, i) => {
        if (stored[i] === h) matches++;
    });

    const ratio = matches / extracted.length;

    document.getElementById("result").innerHTML = `
        <p>Correspondance : ${(ratio * 100).toFixed(1)}%</p>
        <p>${ratio === 1 ? "✔ Vidéo authentique" : "✘ Vidéo altérée"}</p>
    `;
}

document.getElementById("verifyBtn").onclick = verifyVideo;
