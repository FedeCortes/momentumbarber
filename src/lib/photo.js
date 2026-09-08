// ─────────────────────────────────────────────────────────────────────────────
// Fotos de perfil de barbero: se achican en el navegador y se suben al bucket
// público "avatars" de Supabase Storage.
// ─────────────────────────────────────────────────────────────────────────────

// Redimensiona (recorte cuadrado centrado) y comprime a JPEG. Devuelve un Blob.
export function resizeImage(file, max = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      const size = Math.min(max, side)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Archivo de imagen inválido')) }
    img.src = url
  })
}

// Sube la foto del barbero y devuelve la URL pública (con ?v= para romper caché).
export async function uploadAvatar(supabase, { tenantId, barberId, file }) {
  if (!file) throw new Error('Elegí una imagen')
  if (!/^image\//.test(file.type)) throw new Error('El archivo tiene que ser una imagen')
  const blob = await resizeImage(file)
  const path = `${tenantId}/${barberId}.jpg`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
