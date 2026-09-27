import { config } from '../config.js';

export interface ResearchResult {
  query: string;
  sources: Array<{ title: string; url: string; snippet: string; confidence: number }>;
  summary: string;
  contradictions?: Array<{ sourceA: string; sourceB: string; description: string }>;
  citations: Array<{ source: string; url?: string }>;
  timestamp: string;
}

export class ResearchEngine {
  static async research(query: string, options: { maxSources?: number; requireCitations?: boolean } = {}): Promise<ResearchResult> {
    const maxSources = options.maxSources || 5;
    const sources: ResearchResult['sources'] = [];
    
    // Try Tavily if configured
    if (config.tavilyApiKey) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: config.tavilyApiKey,
            query,
            max_results: maxSources,
            search_depth: 'advanced',
            include_answer: true
          })
        });
        
        if (response.ok) {
          const data = await response.json() as any;
          if (data.results) {
            for (const r of data.results) {
              sources.push({
                title: r.title || 'Untitled',
                url: r.url,
                snippet: r.content?.slice(0, 300) || '',
                confidence: r.score || 0.8
              });
            }
          }
          
          return {
            query,
            sources,
            summary: data.answer || `Research results for: ${query}`,
            citations: sources.map(s => ({ source: s.title, url: s.url })),
            timestamp: new Date().toISOString()
          };
        }
      } catch (e) {
        console.warn('Tavily search failed:', e);
      }
    }
    
    // Fallback: DuckDuckGo search via API (no key required)
    try {
      // Use DuckDuckGo instant answer + web search simulation
      const ddgResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`);
      if (ddgResponse.ok) {
        const ddgData = await ddgResponse.json() as any;
        if (ddgData.AbstractText) {
          sources.push({
            title: ddgData.Heading || query,
            url: ddgData.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: ddgData.AbstractText.slice(0, 300),
            confidence: 0.7
          });
        }
        if (ddgData.RelatedTopics) {
          for (const topic of ddgData.RelatedTopics.slice(0, maxSources - sources.length)) {
            if (topic.Text && topic.FirstURL) {
              sources.push({
                title: topic.Text.slice(0, 80),
                url: topic.FirstURL,
                snippet: topic.Text.slice(0, 300),
                confidence: 0.6
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('DuckDuckGo search failed:', e);
    }
    
    // If still no sources, return honest status about configuration
    if (sources.length === 0) {
      return {
        query,
        sources: [],
        summary: `Research for "${query}" requires configuration. Tavily API key not configured (REQUIRES CONFIGURATION). For production research, configure TAVILY_API_KEY environment variable. Local fallback search did not return results.`,
        citations: [],
        timestamp: new Date().toISOString()
      };
    }
    
    // Generate summary from sources
    const summary = `Based on ${sources.length} sources, here's what I found about "${query}":\n\n` +
      sources.map((s, i) => `${i + 1}. ${s.title}: ${s.snippet.slice(0, 150)}...`).join('\n') +
      `\n\nNote: ${config.tavilyApiKey ? 'Using Tavily search' : 'Using DuckDuckGo fallback - configure TAVILY_API_KEY for enhanced research'}`;
    
    return {
      query,
      sources,
      summary,
      citations: sources.map(s => ({ source: s.title, url: s.url })),
      timestamp: new Date().toISOString()
    };
  }
  
  static compareSources(sources: ResearchResult['sources']): Array<{ sourceA: string; sourceB: string; description: string }> {
    const contradictions: Array<{ sourceA: string; sourceB: string; description: string }> = [];
    
    // Simple contradiction detection based on conflicting keywords
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i].snippet.toLowerCase();
        const b = sources[j].snippet.toLowerCase();
        
        // Look for contradictory patterns
        if ((a.includes('is true') && b.includes('is false')) ||
            (a.includes('will increase') && b.includes('will decrease'))) {
          contradictions.push({
            sourceA: sources[i].title,
            sourceB: sources[j].title,
            description: 'Potential contradiction detected in claims'
          });
        }
      }
    }
    
    return contradictions;
  }
}
