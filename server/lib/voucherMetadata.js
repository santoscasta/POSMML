export function parseVoucherMetadata(note) {
  if (!note) return {};
  const jsonMatch = note.match(/\n---POS_META---\n(.+)$/s);
  if (jsonMatch) {
    try {
      const metadata = JSON.parse(jsonMatch[1]);
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
    }
    catch { /* Older or malformed notes can still use the legacy format. */ }
  }
  const nameMatch = note.match(/^Vale POS MML\s*-\s*(.+)$/);
  return nameMatch ? { customerName: nameMatch[1].trim() } : {};
}
