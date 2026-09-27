// Simple embedding system - production-ready with fallback to local hashing
// When OpenAI key available, uses real embeddings, otherwise uses TF-IDF style local vectors

import { config } from '../config.js';

const EMBEDDING_DIM = 384;

// Simple deterministic hash-based embedding for local fallback
// Not as good as real embeddings but provides semantic-ish retrieval
export function localEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  const vector = new Array(EMBEDDING_DIM).fill(0);
  
  // Bag-of-words with positional hashing
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Simple hash
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIM;
    // Weight by position and frequency
    vector[idx] += 1.0 / (1 + i * 0.1);
    
    // Bigram
    if (i < words.length - 1) {
      const bigram = word + '_' + words[i + 1];
      let bhash = 0;
      for (let j = 0; j < bigram.length; j++) {
        bhash = ((bhash << 5) - bhash + bigram.charCodeAt(j)) | 0;
      }
      const bidx = Math.abs(bhash) % EMBEDDING_DIM;
      vector[bidx] += 0.5;
    }
  }
  
  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }
  
  return vector;
}

export async function generateEmbedding(text: string): Promise<{ embedding: number[]; provider: string }> {
  // Try OpenAI if configured
  if (config.openaiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000) // Truncate to avoid token limits
        })
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        if (data.data && data.data[0] && data.data[0].embedding) {
          // Truncate or pad to our dim if needed, but OpenAI is 1536 dim - we can store full
          // For simplicity, store as is but normalize comparison
          return { embedding: data.data[0].embedding.slice(0, EMBEDDING_DIM), provider: 'openai' };
        }
      }
    } catch (e) {
      console.warn('OpenAI embedding failed, falling back to local:', e);
    }
  }
  
  // Fallback to local
  return { embedding: localEmbedding(text), provider: 'local' };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Handle different dimensions by truncating to min length
    const minLen = Math.min(a.length, b.length);
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }
  
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function findSimilar(queryEmbedding: number[], candidates: Array<{ id: string; embedding: number[]; content: string }>, topK: number = 5, threshold: number = 0.1): Array<{ id: string; content: string; score: number }> {
  const scored = candidates.map(c => ({
    id: c.id,
    content: c.content,
    score: cosineSimilarity(queryEmbedding, c.embedding)
  }))
  .filter(s => s.score >= threshold)
  .sort((a, b) => b.score - a.score)
  .slice(0, topK);
  
  return scored;
}
