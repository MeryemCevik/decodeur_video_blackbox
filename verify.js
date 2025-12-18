import { supabase } from "./supabaseClient.js";

const videoInput = document.getElementById("uploadedVideo");
const verifyBtn = document.getElementById("verifyBtn");
const resultDiv = document.getElementById("result");
const videoContainer = document.getElementById("videoContainer");

const FRAME_INTERVAL = 200; // 5 fps pour la reconstruction
const HASH_THRESHOLD = 5; // Seuil de similarité pour SHA-256 (en %)

let userVideoFrames = [];

// -------------------
// 1️⃣ Calcul de hash SHA-256
// -------------------
async function calculateHashFromBlob(blob) {
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
// 2️⃣ Similarité de hash (pourcentage)
// -------------------
function hashSimilarity(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;
  
  let matches = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }
  
  return (matches / hash1.length) * 100;
}

// -------------------
// 3️⃣ Extraction des frames de la vidéo utilisateur
// -------------------
async function extractFramesFromVideo(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    
    video.onloadeddata = async () => {
      const frames = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Extraire une frame toutes les 100ms
      const duration = video.duration * 1000; // en ms
      const interval = 100; // ms
      
      for (let time = 0; time < duration; time += interval) {
        video.currentTime = time / 1000;
        
        await new Promise(resolve => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
              if (blob) {
                const hash = await calculateHashFromBlob(blob);
                frames.push({
                  timestamp: time,
                  blob,
                  hash,
                  dataURL: canvas.toDataURL('image/jpeg', 0.5)
                });
              }
              resolve();
            }, 'image/jpeg', 0.5);
          };
        });
      }
      
      URL.revokeObjectURL(video.src);
      resolve(frames);
    };
    
    video.onerror = reject;
  });
}

// -------------------
// 4️⃣ Récupération des hashes stockés par session
// -------------------
async function getStoredHashes(sessionId = null) {
  try {
    let query = supabase.from("frame_hashes").select("*");
    
    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }
    
    const { data, error } = await query.order("timestamp", { ascending: true });
    
    if (error) throw error;
    
    // Grouper par hash pour éviter les doublons
    const uniqueHashes = {};
    data.forEach(item => {
      if (!uniqueHashes[item.hash]) {
        uniqueHashes[item.hash] = {
          hash: item.hash,
          timestamp: item.timestamp,
          session_id: item.session_id,
          frame_path: item.frame_path
        };
      }
    });
    
    return Object.values(uniqueHashes);
  } catch (error) {
    console.error("Erreur récupération hashes:", error);
    return [];
  }
}

// -------------------
// 5️⃣ Récupération des frames stockées
// -------------------
async function getStoredFrames(sessionId = null) {
  try {
    // Lister tous les dossiers dans videos/
    const { data: folders, error: listError } = await supabase.storage
      .from("videos")
      .list("frames");
    
    if (listError) throw listError;
    
    let framePaths = [];
    
    // Si sessionId spécifiée, chercher dans ce dossier
    if (sessionId) {
      const sessionFolder = folders.find(f => f.name === sessionId);
      if (sessionFolder) {
        const { data: sessionFrames } = await supabase.storage
          .from("videos")
          .list(`frames/${sessionId}`);
        
        if (sessionFrames) {
          framePaths = sessionFrames
            .filter(f => f.name.endsWith('.jpg'))
            .map(f => `frames/${sessionId}/${f.name}`);
        }
      }
    } else {
      // Sinon, récupérer toutes les frames de toutes les sessions
      for (const folder of folders) {
        if (folder.name !== '.emptyFolderPlaceholder') {
          const { data: sessionFrames } = await supabase.storage
            .from("videos")
            .list(`frames/${folder.name}`);
          
          if (sessionFrames) {
            const paths = sessionFrames
              .filter(f => f.name.endsWith('.jpg'))
              .map(f => `frames/${folder.name}/${f.name}`);
            framePaths.push(...paths);
          }
        }
      }
    }
    
    return framePaths.slice(0, 100); // Limiter à 100 frames max pour les performances
  } catch (error) {
    console.error("Erreur récupération frames:", error);
    return [];
  }
}

// -------------------
// 6️⃣ Téléchargement d'une frame
// -------------------
async function downloadFrame(path) {
  try {
    const { data, error } = await supabase.storage
      .from("videos")
      .download(path);
    
    if (error) throw error;
    
    const url = URL.createObjectURL(data);
    const hash = await calculateHashFromBlob(data);
    
    return { url, hash, path };
  } catch (error) {
    console.error("Erreur téléchargement frame:", error);
    return null;
  }
}

// -------------------
// 7️⃣ Vérification d'intégrité
// -------------------
async function verifyIntegrity(userFrames) {
  resultDiv.innerHTML = "<p>Analyse en cours...</p>";
  
  // Détecter la session probable (basée sur le timestamp le plus proche)
  const userStartTime = userFrames[0]?.timestamp || 0;
  
  // Récupérer toutes les sessions disponibles
  const { data: sessions } = await supabase
    .from("frame_hashes")
    .select("session_id")
    .order("timestamp", { ascending: true });
  
  let bestSession = null;
  let bestMatchCount = 0;
  let verificationResults = [];
  
  // Tester chaque session
  const uniqueSessions = [...new Set(sessions?.map(s => s.session_id) || [])];
  
  for (const sessionId of uniqueSessions) {
    const storedHashes = await getStoredHashes(sessionId);
    
    if (storedHashes.length === 0) continue;
    
    let matchCount = 0;
    const sessionResults = [];
    
    // Comparer chaque frame utilisateur avec les hashs stockés
    for (const userFrame of userFrames) {
      let bestSimilarity = 0;
      let bestStoredHash = null;
      
      for (const storedHash of storedHashes) {
        const similarity = hashSimilarity(userFrame.hash, storedHash.hash);
        
        if (similarity > bestSimilarity && similarity > (100 - HASH_THRESHOLD)) {
          bestSimilarity = similarity;
          bestStoredHash = storedHash;
        }
      }
      
      if (bestStoredHash) {
        matchCount++;
        sessionResults.push({
          userFrame,
          storedHash: bestStoredHash,
          similarity: bestSimilarity,
          matched: true
        });
      } else {
        sessionResults.push({
          userFrame,
          matched: false
        });
      }
    }
    
    // Mettre à jour la meilleure session
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestSession = sessionId;
      verificationResults = sessionResults;
    }
  }
  
  return {
    bestSession,
    bestMatchCount,
    totalFrames: userFrames.length,
    integrityPercentage: (bestMatchCount / userFrames.length) * 100,
    results: verificationResults
  };
}

// -------------------
// 8️⃣ Reconstruction vidéo saccadée
// -------------------
async function reconstructVideo(framesData, sessionId) {
  videoContainer.innerHTML = "";
  
  // Récupérer les frames stockées de la session
  const framePaths = await getStoredFrames(sessionId);
  
  if (framePaths.length === 0) {
    videoContainer.innerHTML = "<p>Aucune frame disponible pour la reconstruction</p>";
    return;
  }
  
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  canvas.style.border = "2px solid #333";
  videoContainer.appendChild(canvas);
  
  const ctx = canvas.getContext("2d");
  const status = document.createElement("p");
  videoContainer.appendChild(status);
  
  // Trier les frames par timestamp (extrait du nom de fichier)
  const sortedFrames = await Promise.all(
    framePaths.map(async path => {
      const frameData = await downloadFrame(path);
      if (!frameData) return null;
      
      // Extraire timestamp du nom de fichier
      const timestampMatch = path.match(/frame_(\d+)_/);
      const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
      
      return { ...frameData, timestamp };
    })
  );
  
  // Filtrer les frames nulles et trier par timestamp
  const validFrames = sortedFrames.filter(f => f !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // Afficher les frames avec intervalle régulier
  status.textContent = `Reconstruction: ${validFrames.length} frames`;
  
  for (let i = 0; i < validFrames.length; i++) {
    const frame = validFrames[i];
    const img = new Image();
    
    await new Promise(resolve => {
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Ajouter overlay d'information
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(10, 10, 200, 60);
        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.fillText(`Frame: ${i + 1}/${validFrames.length}`, 20, 30);
        ctx.fillText(`Timestamp: ${new Date(frame.timestamp).toLocaleTimeString()}`, 20, 50);
        
        setTimeout(resolve, FRAME_INTERVAL);
      };
      
      img.src = frame.url;
    });
    
    // Libérer la mémoire
    URL.revokeObjectURL(frame.url);
  }
  
  status.textContent += " - Reconstruction terminée";
}

// -------------------
// 9️⃣ Gestion des événements
// -------------------
videoInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  resultDiv.innerHTML = "<p>Extraction des frames en cours...</p>";
  
  try {
    userVideoFrames = await extractFramesFromVideo(file);
    resultDiv.innerHTML = `<p>${userVideoFrames.length} frames extraites</p>`;
    verifyBtn.disabled = false;
  } catch (error) {
    resultDiv.innerHTML = `<p style="color:red">Erreur extraction: ${error.message}</p>`;
  }
};

verifyBtn.onclick = async () => {
  if (userVideoFrames.length === 0) {
    resultDiv.innerHTML = "<p style='color:red'>Veuillez d'abord sélectionner une vidéo</p>";
    return;
  }
  
  try {
    const verification = await verifyIntegrity(userVideoFrames);
    
    let resultHTML = `
      <h3>Résultat de vérification</h3>
      <p>Session identifiée: ${verification.bestSession || "Non trouvée"}</p>
      <p>Frames correspondantes: ${verification.bestMatchCount} / ${verification.totalFrames}</p>
      <p>Intégrité: ${verification.integrityPercentage.toFixed(2)}%</p>
      <p>Statut: ${verification.integrityPercentage > 80 ? 
        '<span style="color:green">✓ Intègre</span>' : 
        '<span style="color:orange">⚠ Modifications détectées</span>'}</p>
    `;
    
    // Détail des correspondances
    if (verification.results.length > 0) {
      resultHTML += `<details><summary>Détails des correspondances</summary><ul>`;
      
      verification.results.slice(0, 10).forEach((result, index) => {
        if (result.matched) {
          resultHTML += `<li>Frame ${index + 1}: ✓ (${result.similarity.toFixed(1)}%)</li>`;
        } else {
          resultHTML += `<li>Frame ${index + 1}: ✗ (non correspondante)</li>`;
        }
      });
      
      if (verification.results.length > 10) {
        resultHTML += `<li>... et ${verification.results.length - 10} autres frames</li>`;
      }
      
      resultHTML += `</ul></details>`;
    }
    
    resultDiv.innerHTML = resultHTML;
    
    // Reconstruction si session trouvée
    if (verification.bestSession && verification.bestMatchCount > 0) {
      await reconstructVideo(userVideoFrames, verification.bestSession);
    }
    
  } catch (error) {
    resultDiv.innerHTML = `<p style="color:red">Erreur de vérification: ${error.message}</p>`;
    console.error(error);
  }
};