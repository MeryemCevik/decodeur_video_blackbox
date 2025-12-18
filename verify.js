import { supabase } from "./supabaseClient.js";

const videoInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 300; // 3.3 fps pour la reconstruction
const SIMILARITY_THRESHOLD = 95; // % de similarité requis

// -------------------
// 1️⃣ Calcul SHA-256 depuis Blob
// -------------------
async function calculateSHA256FromBlob(blob) {
  try {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error("Erreur calcul hash:", error);
    return null;
  }
}

// -------------------
// 2️⃣ Similarité entre hashs (pourcentage)
// -------------------
function hashSimilarity(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;
  
  let matches = 0;
  const minLength = Math.min(hash1.length, hash2.length);
  
  for (let i = 0; i < minLength; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }
  
  return (matches / minLength) * 100;
}

// -------------------
// 3️⃣ Extraction des frames de la vidéo utilisateur
// -------------------
async function extractUserVideoFrames(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    
    video.onloadeddata = async () => {
      const frames = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      // Extraire frames à intervalles réguliers
      const extractInterval = 200; // ms (5 fps)
      const duration = video.duration * 1000; // en ms
      const totalFrames = Math.floor(duration / extractInterval);
      
      console.log(`Extraction de ${totalFrames} frames...`);
      
      for (let i = 0; i < totalFrames; i++) {
        const time = (i * extractInterval) / 1000;
        video.currentTime = time;
        
        await new Promise(resolve => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
              if (blob) {
                const hash = await calculateSHA256FromBlob(blob);
                frames.push({
                  timestamp: time * 1000,
                  blob,
                  hash,
                  index: i,
                  dataURL: canvas.toDataURL('image/jpeg', 0.5)
                });
              }
              resolve();
            }, 'image/jpeg', 0.5);
          };
        });
      }
      
      URL.revokeObjectURL(url);
      resolve(frames);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Erreur chargement vidéo"));
    };
  });
}

// -------------------
// 4️⃣ Récupération des hashs depuis la table frame_hashes
// -------------------
async function getStoredHashes() {
  try {
    // Récupérer les 1000 derniers hashs (ajustez selon vos besoins)
    const { data, error } = await supabase
      .from("frame_hashes")
      .select("hash, timestamp, frame_path")
      .order("timestamp", { ascending: false })
      .limit(1000);
    
    if (error) throw error;
    
    console.log(`${data.length} hashs récupérés depuis la base`);
    return data;
    
  } catch (error) {
    console.error("Erreur récupération hashs:", error);
    return [];
  }
}

// -------------------
// 5️⃣ Vérification d'intégrité
// -------------------
async function verifyVideoIntegrity(userFrames) {
  resultDiv.innerHTML = "<div class='loading'>🔄 Analyse en cours...</div>";
  
  // Récupérer les hashs stockés
  const storedHashes = await getStoredHashes();
  
  if (storedHashes.length === 0) {
    return {
      matched: 0,
      total: userFrames.length,
      percentage: 0,
      message: "Aucun hash trouvé dans la base de données"
    };
  }
  
  let matchedFrames = 0;
  const matches = [];
  
  // Comparer chaque frame utilisateur avec les hashs stockés
  for (const userFrame of userFrames) {
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const stored of storedHashes) {
      const similarity = hashSimilarity(userFrame.hash, stored.hash);
      
      if (similarity > bestSimilarity && similarity >= SIMILARITY_THRESHOLD) {
        bestSimilarity = similarity;
        bestMatch = stored;
      }
    }
    
    if (bestMatch) {
      matchedFrames++;
      matches.push({
        userFrame,
        stored: bestMatch,
        similarity: bestSimilarity
      });
    }
  }
  
  const integrityPercentage = (matchedFrames / userFrames.length) * 100;
  
  return {
    matched: matchedFrames,
    total: userFrames.length,
    percentage: integrityPercentage,
    matches: matches,
    message: integrityPercentage > 80 ? 
      "✅ Vidéo intègre - Correspondance élevée" :
      integrityPercentage > 50 ?
      "⚠️ Vidéo partiellement corrompue - Correspondance moyenne" :
      "❌ Vidéo altérée - Faible correspondance"
  };
}

// -------------------
// 6️⃣ Reconstruction de la vidéo à partir des frames stockées
// -------------------
async function reconstructFromStoredFrames() {
  videoContainer.innerHTML = "";
  
  try {
    // Récupérer les frames les plus récentes
    const { data: hashes, error } = await supabase
      .from("frame_hashes")
      .select("frame_path")
      .order("timestamp", { ascending: true })
      .limit(50); // Limiter à 50 frames pour la démo
    
    if (error) throw error;
    
    if (hashes.length === 0) {
      videoContainer.innerHTML = "<p>Aucune frame disponible</p>";
      return;
    }
    
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    canvas.style.border = "2px solid #333";
    videoContainer.appendChild(canvas);
    
    const ctx = canvas.getContext("2d");
    const info = document.createElement("p");
    info.textContent = `Reconstruction de ${hashes.length} frames...`;
    videoContainer.appendChild(info);
    
    // Télécharger et afficher chaque frame
    for (let i = 0; i < hashes.length; i++) {
      const framePath = hashes[i].frame_path;
      
      if (!framePath) continue;
      
      try {
        // Télécharger la frame depuis storage
        const { data, error } = await supabase.storage
          .from("videos")
          .download(framePath);
        
        if (error) continue;
        
        const url = URL.createObjectURL(data);
        const img = new Image();
        
        await new Promise(resolve => {
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Ajouter info overlay
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(10, 10, 180, 40);
            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.fillText(`Frame: ${i + 1}/${hashes.length}`, 20, 30);
            
            setTimeout(() => {
              URL.revokeObjectURL(url);
              resolve();
            }, FRAME_INTERVAL);
          };
          
          img.src = url;
        });
        
        info.textContent = `Frame ${i + 1}/${hashes.length}`;
        
      } catch (err) {
        console.error("Erreur frame:", err);
        continue;
      }
    }
    
    info.textContent = "✅ Reconstruction terminée";
    
  } catch (error) {
    console.error("Erreur reconstruction:", error);
    videoContainer.innerHTML = "<p>Erreur lors de la reconstruction</p>";
  }
}

// -------------------
// 7️⃣ Gestion événements
// -------------------
videoInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    alert("Veuillez sélectionner un fichier vidéo");
    return;
  }
  
  resultDiv.innerHTML = "<div class='loading'>📹 Extraction des frames...</div>";
  verifyBtn.disabled = true;
  
  try {
    const frames = await extractUserVideoFrames(file);
    window.userFrames = frames; // Stocker globalement
    
    resultDiv.innerHTML = `
      <div class='success'>
        ✅ ${frames.length} frames extraites<br>
        <small>Taille vidéo: ${(file.size / 1024 / 1024).toFixed(2)} MB</small>
      </div>
    `;
    verifyBtn.disabled = false;
    
  } catch (error) {
    resultDiv.innerHTML = `
      <div class='error'>
        ❌ Erreur extraction: ${error.message}
      </div>
    `;
  }
};

verifyBtn.onclick = async () => {
  if (!window.userFrames || window.userFrames.length === 0) {
    resultDiv.innerHTML = "<div class='error'>❌ Veuillez d'abord sélectionner une vidéo</div>";
    return;
  }
  
  try {
    const result = await verifyVideoIntegrity(window.userFrames);
    
    let resultHTML = `
      <div class="result-card">
        <h3>📊 Résultats de vérification</h3>
        <div class="stats">
          <div class="stat">
            <span class="stat-label">Frames correspondantes:</span>
            <span class="stat-value ${result.percentage > 80 ? 'good' : result.percentage > 50 ? 'medium' : 'bad'}">
              ${result.matched} / ${result.total}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Intégrité:</span>
            <span class="stat-value ${result.percentage > 80 ? 'good' : result.percentage > 50 ? 'medium' : 'bad'}">
              ${result.percentage.toFixed(1)}%
            </span>
          </div>
        </div>
        <div class="message ${result.percentage > 80 ? 'good' : result.percentage > 50 ? 'medium' : 'bad'}">
          ${result.message}
        </div>
    `;
    
    // Afficher quelques détails si disponible
    if (result.matches.length > 0) {
      resultHTML += `
        <details>
          <summary>Voir les détails (${Math.min(10, result.matches.length)} premières correspondances)</summary>
          <div class="matches">
      `;
      
      result.matches.slice(0, 10).forEach((match, idx) => {
        resultHTML += `
          <div class="match">
            <span>Frame ${idx + 1}:</span>
            <span>${match.similarity.toFixed(1)}% de similarité</span>
          </div>
        `;
      });
      
      resultHTML += `</div></details>`;
    }
    
    resultHTML += `</div>`;
    
    resultDiv.innerHTML = resultHTML;
    
    // Lancer la reconstruction
    await reconstructFromStoredFrames();
    
  } catch (error) {
    resultDiv.innerHTML = `
      <div class="error">
        ❌ Erreur de vérification: ${error.message}
      </div>
    `;
    console.error(error);
  }
};