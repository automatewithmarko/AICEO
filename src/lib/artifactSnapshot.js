import { uploadImageToStorage } from './api';

// Upload any base64 image payloads inside an artifact (HTML <img src>, the
// images[] array, story frames[]) to Supabase storage and return a NEW
// artifact whose references are hosted URLs only. Used at snapshot time so
// per-message artifact snapshots (msg.artifact) stay small and survive a
// page reload without re-embedding multi-MB base64 strings into the
// messages JSONB row. Best-effort — any per-upload failure keeps the
// original src so we never lose pixels even if storage is flaky.
export async function uploadArtifactBase64(art) {
  if (!art) return art;
  let savedContent = art.content || '';
  if (savedContent) {
    const b64re = /src="(data:image\/[^;]+;base64,[^"]+)"/g;
    const matches = [...savedContent.matchAll(b64re)];
    for (const m of matches) {
      try {
        const dataUri = m[1];
        const commaIdx = dataUri.indexOf(',');
        const mimeMatch = dataUri.match(/^data:([^;]+);/);
        const result = await uploadImageToStorage(dataUri.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
        if (result.url) savedContent = savedContent.replaceAll(dataUri, result.url);
      } catch {}
    }
  }
  const uploadedImages = await Promise.all((art.images || []).map(async (img) => {
    if (img.src?.startsWith('data:')) {
      try {
        const commaIdx = img.src.indexOf(',');
        const mimeMatch = img.src.match(/^data:([^;]+);/);
        const result = await uploadImageToStorage(img.src.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
        return { ...img, src: result.url || img.src };
      } catch { return img; }
    }
    return img;
  }));
  const uploadedFrames = art.frames ? await Promise.all(art.frames.map(async (f) => {
    if (f.imageSrc?.startsWith('data:')) {
      try {
        const commaIdx = f.imageSrc.indexOf(',');
        const mimeMatch = f.imageSrc.match(/^data:([^;]+);/);
        const result = await uploadImageToStorage(f.imageSrc.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
        return { ...f, imageSrc: result.url || f.imageSrc };
      } catch { return f; }
    }
    return f;
  })) : null;
  return {
    ...art,
    content: savedContent,
    images: uploadedImages,
    ...(uploadedFrames ? { frames: uploadedFrames } : {}),
  };
}

// Persist a frozen artifact snapshot onto a chat message. Uploads any
// base64 images first; falls back to the raw b64 art if the upload fails
// (we'd rather have a bigger row than lose pixels). Used by both AICEO
// and Marketing so clicking an old message re-opens the same artifact
// independent of whatever later turns produced.
export async function snapshotArtifactOnMessage({ msgId, art, setMessages, label = 'snapshot' }) {
  if (!msgId || !art) return;
  try {
    const uploaded = await uploadArtifactBase64(art);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, artifact: uploaded } : m));
    console.log(`[${label}] DONE ${msgId} (uploaded)`);
  } catch (err) {
    console.warn(`[${label}] snapshot upload failed, keeping b64:`, err?.message);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, artifact: art } : m));
    console.log(`[${label}] DONE ${msgId} (b64 fallback)`);
  }
}
