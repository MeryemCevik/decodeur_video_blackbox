import { supabase } from "./supabaseClient.js";

// DOM
const uploadedVideo = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");

// Extraction frames et hash
async function hashWebMFrames(videoBlob) {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise(r => video.onloadedmetadata = r);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    const fps = 2; // 1 frame toutes les 500ms
    const step = 1/fps;
    const hashes = [];

    for(let t=0; t<video.duration; t+=step){
        video.currentTime = t;
        await new Promise(r => video.onseeked = r);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise(r=>canvas.toBlob(r, "image/png"));
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b=>b.toString(16).padStart(2,"0")).join("");

        hashes.push({time: t, hash: hashHex});
        console.log(`[DECODEUR] Frame ${t.toFixed(2)}s → Hash calculé : ${hashHex}`);
    }
    URL.revokeObjectURL(url);
    return hashes;
}

// Récupérer hashes stockés
async function getStoredHashes(){
    const { data } = await supabase.from("frame_hashes").select("hash");
    return data.map(d=>d.hash);
}

// Vérification vidéo
async function verifyVideo(file){
    resultDiv.textContent="Vérification en cours…";
    const videoHashes = await hashWebMFrames(file);
    const storedHashes = await getStoredHashes();

    let matched = 0;

    videoHashes.forEach((vh,i)=>{
        // Tolérance → match avec n'importe quel hash proche
        const match = storedHashes.find(sh=>sh===vh.hash);
        if(match) {
            matched++;
            console.log(`✔ Frame ${i} → Match !`);
        } else console.warn(`✘ Frame ${i} → Mismatch`);
    });

    const percent = Math.round((matched/videoHashes.length)*100);
    console.log(`[DECODEUR] Résultat final : ${percent}% de correspondance`);
    resultDiv.textContent = percent>=70 ? `Intégrité OK (${percent}%)` : `Vidéo altérée (${percent}%)`;
}

verifyBtn.addEventListener("click", ()=>{
    if(uploadedVideo.files.length) verifyVideo(uploadedVideo.files[0]);
});
