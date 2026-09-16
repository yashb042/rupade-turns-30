// A saved browser preview must not hide a newer published gallery or quiz.
export function previewIsCurrent(published, preview) {
  if (!preview) return false;
  if (!published.updatedAt) return true;
  const publishedTime = Date.parse(published.updatedAt);
  const previewTime = Date.parse(preview.updatedAt);
  return Number.isFinite(previewTime) && Number.isFinite(publishedTime) && previewTime >= publishedTime;
}
