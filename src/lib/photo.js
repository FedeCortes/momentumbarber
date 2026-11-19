// ─────────────────────────────────────────────────────────────────────────────
// Fotos del catálogo: se achican en el navegador y se suben al bucket público
// "catalog-photos" de Supabase Storage.
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

// Foto de un ítem del catálogo (producto, bebida...), separada por tabla y tenant.
export async function uploadCatalogPhoto(supabase, { tenantId, tableName, itemId, file }) {
  if (!file) throw new Error('Elegí una imagen')
  if (!/^image\//.test(file.type)) throw new Error('El archivo tiene que ser una imagen')
  const blob = await resizeImage(file, 480)
  const path = `${tenantId}/${tableName}/${itemId}.jpg`
  const { error } = await supabase.storage
    .from('catalog-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '86400' })
  if (error) throw error
  const { data } = supabase.storage.from('catalog-photos').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

// Borra la foto de un ítem del catálogo del bucket (best-effort: si el
// archivo ya no está, no rompe — igual hay que limpiar image_url en la fila).
export async function removeCatalogPhoto(supabase, { tenantId, tableName, itemId }) {
  const path = `${tenantId}/${tableName}/${itemId}.jpg`
  await supabase.storage.from('catalog-photos').remove([path])
}

// Logo de la barbería: cuadrado, en PNG para no perder la transparencia.
export async function uploadBrandLogo(supabase, { tenantId, file }) {
  if (!file) throw new Error('Elegí una imagen')
  if (!/^image\//.test(file.type)) throw new Error('El archivo tiene que ser una imagen')
  const blob = await new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.width, img.height)
      const size = Math.min(512, side)
      const c = document.createElement('canvas')
      c.width = size; c.height = size
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Archivo de imagen inválido')) }
    img.src = url
  })
  const path = `${tenantId}/branding/logo.png`
  const { error } = await supabase.storage.from('catalog-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/png', cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('catalog-photos').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

export async function removeBrandLogo(supabase, { tenantId }) {
  await supabase.storage.from('catalog-photos').remove([`${tenantId}/branding/logo.png`])
}
