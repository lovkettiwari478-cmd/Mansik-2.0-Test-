import fs from 'fs';

interface ValidationResult {
  valid: boolean;
  detectedType: string;
  mimeType: string;
  error?: string;
}

// Magic bytes signatures
const SIGNATURES: Record<string, { bytes: number[]; mime: string; type: string }[]> = {
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', type: 'pdf' }],
  png: [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mime: 'image/png', type: 'image' }],
  jpeg: [
    { bytes: [0xFF, 0xD8, 0xFF, 0xE0], mime: 'image/jpeg', type: 'image' },
    { bytes: [0xFF, 0xD8, 0xFF, 0xE1], mime: 'image/jpeg', type: 'image' },
    { bytes: [0xFF, 0xD8, 0xFF, 0xE8], mime: 'image/jpeg', type: 'image' },
    { bytes: [0xFF, 0xD8, 0xFF, 0xDB], mime: 'image/jpeg', type: 'image' }
  ],
  gif: [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif', type: 'image' },
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif', type: 'image' }
  ],
  webp: [{ bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp', type: 'image' }] // RIFF....WEBP need more check
};

// Dangerous signatures
const DANGEROUS_SIGNATURES = [
  { bytes: [0x4D, 0x5A], name: 'Windows Executable (MZ)' }, // EXE, DLL
  { bytes: [0x7F, 0x45, 0x4C, 0x46], name: 'ELF Executable' },
  { bytes: [0x23, 0x21], name: 'Shell script (shebang)' }, // #!
  { bytes: [0xCA, 0xFE, 0xBA, 0xBE], name: 'Java class / Mach-O' },
  { bytes: [0xFE, 0xED, 0xFA, 0xCE], name: 'Mach-O binary' },
  { bytes: [0xFE, 0xED, 0xFA, 0xCF], name: 'Mach-O binary' },
  { bytes: [0x50, 0x4B, 0x03, 0x04], name: 'ZIP archive (potential executable)' }, // Allow? We should block zip for now unless needed
  { bytes: [0x50, 0x4B, 0x05, 0x06], name: 'ZIP archive' },
  { bytes: [0x50, 0x4B, 0x07, 0x08], name: 'ZIP archive' }
];

// Allowed extensions
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.pdf', '.csv', '.log',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.html', '.htm', '.xml', '.yaml', '.yml'
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.sh', '.bat', '.cmd', '.com',
  '.msi', '.app', '.dmg', '.pkg', '.deb', '.rpm', '.apk', '.jar', '.war',
  '.ps1', '.vbs', '.wsf', '.scr', '.pif', '.application', '.gadget', '.msc',
  '.cpl', '.msu', '.msp', '.hta', '.csh', '.ksh', '.bash', '.zsh', '.fish'
]);

function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function isTextBuffer(buffer: Buffer): boolean {
  // Check if buffer is mostly text (no null bytes, mostly printable)
  if (buffer.length === 0) return true;
  
  // If contains null byte, likely binary
  if (buffer.includes(0x00)) return false;
  
  let nonPrintable = 0;
  const sample = buffer.slice(0, Math.min(buffer.length, 1024));
  
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Allow: \n, \r, \t, and printable ASCII 32-126, plus UTF-8 continuation
    if (byte === 0x0A || byte === 0x0D || byte === 0x09) continue;
    if (byte >= 32 && byte <= 126) continue;
    if (byte >= 128) continue; // UTF-8
    nonPrintable++;
  }
  
  // If more than 10% non-printable, consider binary
  return nonPrintable / sample.length < 0.1;
}

export function validateFileMagic(filePath: string, originalName: string, claimedMime: string): ValidationResult {
  try {
    const buffer = fs.readFileSync(filePath);
    const firstBytes = buffer.slice(0, 16);
    const ext = originalName.toLowerCase().substring(originalName.lastIndexOf('.'));
    
    // Check blocked extensions
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        detectedType: 'blocked',
        mimeType: claimedMime,
        error: `File type ${ext} is not allowed for security reasons`
      };
    }
    
    // Check dangerous signatures
    for (const dangerous of DANGEROUS_SIGNATURES) {
      // Skip ZIP check for now if it's a docx/xlsx etc? But we block zip to be safe unless needed
      // For MANISK, we don't need zip support, so block
      if (matchesSignature(buffer, dangerous.bytes)) {
        // Special case: ZIP could be docx, but we block for security
        if (dangerous.name.includes('ZIP')) {
          return {
            valid: false,
            detectedType: 'archive',
            mimeType: claimedMime,
            error: `Archive files are not allowed: ${dangerous.name}`
          };
        }
        return {
          valid: false,
          detectedType: 'executable',
          mimeType: claimedMime,
          error: `Executable or script file detected: ${dangerous.name}`
        };
      }
    }
    
    // Check for PDF
    if (matchesSignature(buffer, [0x25, 0x50, 0x44, 0x46])) {
      if (claimedMime && !claimedMime.includes('pdf') && !claimedMime.includes('octet-stream')) {
        // Mime mismatch but still pdf - allow if content is pdf
      }
      return { valid: true, detectedType: 'pdf', mimeType: 'application/pdf' };
    }
    
    // Check images
    if (matchesSignature(buffer, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
      return { valid: true, detectedType: 'image', mimeType: 'image/png' };
    }
    if (matchesSignature(buffer, [0xFF, 0xD8, 0xFF])) {
      return { valid: true, detectedType: 'image', mimeType: 'image/jpeg' };
    }
    if (matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38])) {
      return { valid: true, detectedType: 'image', mimeType: 'image/gif' };
    }
    // WEBP: RIFF + WEBP
    if (buffer.length >= 12 && matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString() === 'WEBP') {
      return { valid: true, detectedType: 'image', mimeType: 'image/webp' };
    }
    
    // Check if text
    if (isTextBuffer(buffer)) {
      // Allow text-based files
      const textMimes = ['text/', 'application/json', 'application/xml', 'application/yaml'];
      const isTextMime = textMimes.some(m => claimedMime.includes(m)) || claimedMime === 'application/octet-stream';
      
      // Determine specific type by extension or content
      if (ext === '.json' || buffer.toString().trim().startsWith('{') || buffer.toString().trim().startsWith('[')) {
        try {
          // Try to parse as JSON if extension is json or content looks like json
          if (ext === '.json' || claimedMime.includes('json')) {
            JSON.parse(buffer.toString('utf-8'));
            return { valid: true, detectedType: 'json', mimeType: 'application/json' };
          }
        } catch {
          // Not valid JSON, but still text
        }
      }
      
      return { valid: true, detectedType: 'text', mimeType: claimedMime.startsWith('text/') ? claimedMime : 'text/plain' };
    }
    
    // If we reach here, it's binary but not recognized as safe type
    // For security, block unknown binary
    return {
      valid: false,
      detectedType: 'unknown-binary',
      mimeType: claimedMime,
      error: `File type not allowed or unrecognized binary content. Allowed: PDF, images (PNG/JPEG/GIF/WEBP), text, JSON`
    };
    
  } catch (error: any) {
    return {
      valid: false,
      detectedType: 'error',
      mimeType: claimedMime,
      error: `File validation failed: ${error.message}`
    };
  }
}

export function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/[\/\\]/g, '_');
  // Remove null bytes and control chars
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  // Limit length
  if (sanitized.length > 200) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    sanitized = sanitized.substring(0, 200 - ext.length) + ext;
  }
  return sanitized;
}
