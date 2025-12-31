import { supabase } from "./supabaseClient.js";

const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");

// ---------------- SHA256 ----------------
async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ---------------- Vérification ----------------
verifyBtn.onclick = async () => {
  const input = document.getElementById("uploadedVideo");
  if(!input.files.length){ alert("Sélectionne une vidéo !"); return; }

  resultDiv.textContent = "Vérification en cours...";

  const file = input.files[0];
  const hashVideo = await sha256(file);

  // Récupérer tous les hashes stockés
  const { data, error } = await supabase.from("frame_hashes").select("hash");
  if(error){ resultDiv.textContent = "Erreur lecture hash : " + error.message; return; }

  const hashes = data.map(d => d.hash);

  if(hashes.includes(hashVideo)){
    resultDiv.textContent = "✅ La vidéo correspond à celle enregistrée par l'assurance.";
  } else {
    resultDiv.textContent = "❌ La vidéo ne correspond pas ou a été modifiée.";
  }
};
