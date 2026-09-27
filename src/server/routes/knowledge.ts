import { Router } from 'express';
import { z } from 'zod';
import { KnowledgeEngine } from '../core/knowledgeEngine.js';
import multer from 'multer';
import { getDb } from '../db/index.js';
import fs from 'fs';
import path from 'path';
import { validateFileMagic, sanitizeFilename } from '../lib/fileValidation.js';
import { config } from '../config.js';

const router = Router();

// Ensure upload path exists
const uploadPath = config.uploadPath;
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Random filename to prevent path traversal and collisions
    const randomName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
    const ext = path.extname(sanitizeFilename(file.originalname)).toLowerCase();
    cb(null, `${randomName}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Basic mime check - deeper validation happens after upload via magic bytes
    const allowedMimes = [
      'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/xml',
      'application/json', 'application/pdf',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/octet-stream' // Allow for further validation
    ];
    
    // Check if mime is in allowed list or starts with text/
    const isAllowed = allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('text/');
    
    if (!isAllowed) {
      // Still allow but will be validated by magic bytes
      // For now, reject obviously dangerous mimes
      const blockedMimes = [
        'application/x-executable', 'application/x-msdownload', 'application/x-sh',
        'application/x-msdos-program', 'application/x-elf', 'application/x-sharedlib',
        'application/zip', 'application/x-zip', 'application/x-zip-compressed',
        'application/x-rar-compressed', 'application/x-7z-compressed'
      ];
      if (blockedMimes.includes(file.mimetype)) {
        return cb(new Error(`File type ${file.mimetype} is not allowed`));
      }
    }
    
    cb(null, true);
  }
});

router.get('/', async (req, res) => {
  const userId = (req as any).user.id;
  const type = req.query.type as string;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const docs = KnowledgeEngine.list(userId, { type, limit, offset });
  res.json({ documents: docs });
});

router.get('/search', async (req, res) => {
  const userId = (req as any).user.id;
  const query = req.query.q as string;
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }
  
  const results = KnowledgeEngine.search(userId, query, 20);
  res.json({ results, query });
});

router.post('/', async (req, res) => {
  const userId = (req as any).user.id;
  const schema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(50000),
    type: z.enum(['pdf', 'doc', 'note', 'text', 'image', 'other']).optional(),
    tags: z.array(z.string()).optional()
  });
  
  try {
    const { title, content, type, tags } = schema.parse(req.body);
    const result = await KnowledgeEngine.saveDocument(userId, {
      title,
      content,
      type: type || 'note',
      tags,
      source: 'manual'
    });
    
    if (result.isDuplicate) {
      return res.status(409).json({ error: 'Duplicate document', id: result.id });
    }
    
    const doc = KnowledgeEngine.getById(userId, result.id);
    res.status(201).json({ document: doc });
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: e.errors });
    }
    res.status(500).json({ error: 'Failed to save document' });
  }
});

router.get('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const doc = KnowledgeEngine.getById(userId, req.params.id);
  
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  res.json({ document: doc });
});

router.delete('/:id', async (req, res) => {
  const userId = (req as any).user.id;
  const success = KnowledgeEngine.delete(userId, req.params.id);
  
  if (!success) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  res.json({ message: 'Document deleted' });
});

router.post('/upload', upload.single('file'), async (req, res) => {
  const userId = (req as any).user.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'File required', code: 'FILE_REQUIRED' });
  }
  
  const file = req.file;
  
  try {
    // Magic-byte validation
    const validation = validateFileMagic(file.path, file.originalname, file.mimetype);
    
    if (!validation.valid) {
      // Delete invalid file
      try {
        fs.unlinkSync(file.path);
      } catch {}
      
      return res.status(400).json({ 
        error: validation.error || 'Invalid file type', 
        code: 'INVALID_FILE_TYPE',
        detectedType: validation.detectedType
      });
    }
    
    let content = '';
    let type: any = validation.detectedType === 'image' ? 'image' : validation.detectedType;
    
    // Ensure type is valid enum
    if (!['pdf', 'text', 'image', 'note', 'doc', 'other'].includes(type)) {
      type = validation.detectedType === 'json' ? 'text' : validation.detectedType;
      if (!['pdf', 'text', 'image', 'note', 'doc', 'other'].includes(type)) {
        type = 'other';
      }
    }
    
    // Try to read text files
    if (validation.detectedType === 'text' || validation.detectedType === 'json') {
      try {
        content = fs.readFileSync(file.path, 'utf-8').slice(0, 50000);
        type = 'text';
      } catch {
        content = `Text file: ${file.originalname} (${file.size} bytes)`;
        type = 'text';
      }
    } else if (validation.detectedType === 'pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(fs.readFileSync(file.path));
        content = data.text.slice(0, 50000);
        type = 'pdf';
      } catch {
        content = `PDF file: ${file.originalname} (${file.size} bytes) - content extraction pending, file saved securely`;
        type = 'pdf';
      }
    } else if (validation.detectedType === 'image') {
      content = `Image file: ${file.originalname} (${validation.mimeType}, ${file.size} bytes)`;
      type = 'image';
    } else {
      content = `File: ${file.originalname} (${validation.mimeType}, ${file.size} bytes)`;
      type = 'other';
    }
    
    const result = await KnowledgeEngine.saveDocument(userId, {
      title: sanitizeFilename(file.originalname),
      content,
      type,
      filePath: file.path,
      mimeType: validation.mimeType,
      size: file.size,
      source: 'upload'
    });
    
    const doc = KnowledgeEngine.getById(userId, result.id);
    res.status(201).json({ document: doc });
  } catch (e: any) {
    // Cleanup on error
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch {}
    
    if (e.message && e.message.includes('File type')) {
      return res.status(400).json({ error: e.message, code: 'INVALID_FILE_TYPE' });
    }
    
    res.status(500).json({ error: 'Upload failed', details: e.message, code: 'UPLOAD_FAILED' });
  }
});

router.post('/:id/link/:otherId', async (req, res) => {
  const userId = (req as any).user.id;
  const { relation } = req.body;
  
  const success = KnowledgeEngine.linkDocuments(userId, req.params.id, req.params.otherId, relation || 'related');
  
  if (!success) {
    return res.status(404).json({ error: 'One or both documents not found' });
  }
  
  res.json({ message: 'Documents linked' });
});

export default router;
