/** Validate send-time headers. Meta review header_handle values are not media IDs. */
export function templateHeaderError(components: any[], variables: Record<string, unknown>, scheduledAt?: Date): string | null {
  const header = (Array.isArray(components) ? components : []).find(c => String(c?.type || '').toUpperCase() === 'HEADER');
  const format = String(header?.format || 'TEXT').toUpperCase();
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
    const selectedType = String(variables?.__header_media_type || '').toUpperCase();
    if (selectedType && selectedType !== format) return `This template requires ${format.toLowerCase()} media, not ${selectedType.toLowerCase()}.`;
    const id = String(variables?.__header_media_id || '').trim();
    const link = String(variables?.__header_media_link || '').trim();
    if (!id && !link) return `Select the ${format.toLowerCase()} required by this template before scheduling or sending.`;
    if (id && !/^\d+$/.test(id)) return 'Invalid WhatsApp media ID. Upload the selected file again.';
    if (!id && link) {
      try { const url = new URL(link); if (!['http:', 'https:'].includes(url.protocol)) return 'Media must use a public HTTP or HTTPS URL.'; }
      catch { return 'Invalid media URL.'; }
    }
    if (id && scheduledAt) {
      const uploadedAt = variables?.__header_media_uploaded_at ? new Date(String(variables.__header_media_uploaded_at)) : new Date();
      if (Number.isNaN(uploadedAt.getTime())) return 'Invalid media upload date. Upload the file again.';
      if (scheduledAt.getTime() - uploadedAt.getTime() > 28 * 86400000) return 'Schedule media messages within 28 days of uploading the file.';
    }
  }
  if (format === 'LOCATION') {
    const lat = variables?.__header_location_latitude;
    const lng = variables?.__header_location_longitude;
    if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '' ||
        !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
      return 'Select a valid latitude and longitude required by this template.';
    }
    if (!String(variables?.__header_location_name ?? '').trim()) return 'Enter the shop or location name required by this template.';
    if (!String(variables?.__header_location_address ?? '').trim()) return 'Enter the full location address required by this template.';
  }
  return null;
}

export const messageMediaMimeTypes: Record<string, string[]> = {
  IMAGE: ['image/jpeg', 'image/png'],
  VIDEO: ['video/mp4', 'video/3gpp'],
  DOCUMENT: ['application/pdf'],
};
