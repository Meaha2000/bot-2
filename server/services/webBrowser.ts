import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export class WebBrowser {
  private static USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  static async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      });
      
      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      $('.result').each((i, element) => {
        if (i >= 5) return; // Limit to 5 results
        
        const titleElement = $(element).find('.result__a');
        const snippetElement = $(element).find('.result__snippet');
        
        const title = titleElement.text().trim();
        const link = titleElement.attr('href');
        const snippet = snippetElement.text().trim();

        if (title && link && !link.includes('duckduckgo.com/y.js')) { // Filter internal redirects if possible, though DDG HTML usually gives direct or redirect links
           // DDG HTML links are often /l/?kh=-1&uddg=...
           // We might need to extract the real URL if it's a redirect
           let realLink = link;
           if (link.startsWith('//duckduckgo.com/l/?uddg=')) {
             realLink = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
           }

           results.push({
             title,
             link: realLink,
             snippet
           });
        }
      });

      return results;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  static async scrape(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      });
      
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove scripts, styles, and other non-content elements
      $('script, style, nav, footer, iframe, noscript').remove();

      // Extract text
      let text = $('body').text();
      
      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();
      
      // Limit length to avoid token limits (e.g., 10k chars)
      return text.substring(0, 10000);
    } catch (error) {
      console.error('Scrape failed:', error);
      return `Failed to read page: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
