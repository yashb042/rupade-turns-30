export async function resizePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose JPG, PNG, or WebP images.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Please choose photos smaller than 25 MB each.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(`“${file.name || 'This image'}” could not be opened. Try a different JPG, PNG, or WebP file.`); }
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fcf6ed';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally { bitmap.close(); }
}
