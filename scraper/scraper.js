import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'https://sites.williams.edu/makerspace/projects/',
  dataPath: path.join(__dirname, '../data/projects.json'),
  qrCodePath: path.join(__dirname, '../assets/qr-codes/'),
  isDevelopment: process.env.NODE_ENV === 'development',
  isCI: process.env.CI === 'true', // GitHub Actions sets CI=true
  maxProjects: process.env.NODE_ENV === 'development' ? 5 : null, // Limit for testing
  delays: {
    // Slower in CI to avoid rate limiting, faster for local development
    betweenPages: process.env.CI === 'true' ? 3000 : 1000,
    betweenProjects: process.env.CI === 'true' ? 2000 : 500
  },
    // Tag filtering configuration
  tagFilter: {
    enabled: true, // Temporarily disabled to debug CI issues
    mode: 'any', // 'any' = at least one tag, 'all' = all tags required
    requiredTags: ['makerspace'] // Tags that must be present
  },
  // Tags to exclude from being saved and displayed (case-insensitive)
  excludedTags: ['makerspace', 'fablab', 'fab lab', 'williams', 'college']
};

// Logging utility
const log = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => CONFIG.isDevelopment && console.log(`[DEBUG] ${msg}`)
};

// Main scraper class
class MakerspaceScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.projects = [];
    this.stats = {
      startTime: Date.now(),
      projectsFound: 0,
      projectsScraped: 0,
      errors: 0
    };
  }

    // Initialize browser for scraping
  async initBrowser() {
    try {
      log.info('Initializing browser...');
      
      // Enhanced browser args for CI environments
      const browserArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-web-security',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-shipping',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Additional args to avoid Cloudflare detection
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];

      // Additional args for CI environment
      if (process.env.CI) {
        browserArgs.push(
          '--single-process',
          '--no-zygote',
          '--disable-background-networking'
        );
      }

      this.browser = await puppeteer.launch({
        headless: true,
        args: browserArgs,
        timeout: 60000
      });
      
      this.page = await this.browser.newPage();
      
      // Disable cache for fresh data on each run
      await this.page.setCacheEnabled(false);
      
      // Set realistic headers to avoid bot detection
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await this.page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });

      // Remove webdriver property
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });
      
      // Block unnecessary resources to speed up scraping
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if(req.resourceType() == 'stylesheet' || req.resourceType() == 'image'){
          req.abort();
        } else {
          req.continue();
        }
      });
      
      log.info('Browser initialized successfully with cache disabled');
    } catch (error) {
      log.error(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }

  // Discover all project URLs from the main projects page and all pagination pages
  async discoverProjects() {
    try {
      log.info('Discovering projects from main page and all pagination pages...');
      
      let allProjectUrls = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        // Construct URL for current page
        const pageUrl = currentPage === 1 
          ? CONFIG.baseUrl 
          : `${CONFIG.baseUrl}page/${currentPage}/`;
        
        log.info(`Scraping page ${currentPage}: ${pageUrl}`);
        
        try {
          // Longer timeout and wait for CI environments
          const timeout = process.env.CI === 'true' ? 60000 : 30000;
          
          log.info(`Navigating to page ${currentPage} with ${timeout}ms timeout...`);
          await this.page.goto(pageUrl, { 
            waitUntil: 'networkidle2',
            timeout: timeout
          });

          // Wait for content to load with longer timeout in CI
          const selectorTimeout = process.env.CI === 'true' ? 20000 : 10000;
          await this.page.waitForSelector('body', { timeout: selectorTimeout });
          
          // Additional wait in CI to ensure content is fully loaded
          if (process.env.CI === 'true') {
            log.info(`CI environment - adding extra 2s wait for page ${currentPage} to fully load...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          // Get page content
          let content = await this.page.content();
          let $ = cheerio.load(content);

          // Debug: Log page structure for CI debugging
          if (process.env.CI === 'true') {
            const bodyClasses = $('body').attr('class') || 'no-body-classes';
            const titleElement = $('title').text() || 'no-title';
            const h1Text = $('h1').first().text().trim() || 'no-h1';
            
            log.info(`Page ${currentPage} debug - Title: "${titleElement}"`);
            log.info(`Page ${currentPage} debug - H1: "${h1Text}"`);
            log.info(`Page ${currentPage} debug - Body classes: ${bodyClasses}`);
            
            // Check for common WordPress/page builder elements
            const wpElements = {
              'fl-post-feed-post': $('.fl-post-feed-post').length,
              'article': $('article').length,
              'post': $('.post').length,
              'entry': $('.entry').length,
              'project-links': $('a[href*="projects/"]').length,
              'total-links': $('a').length
            };
            
            log.info(`Page ${currentPage} debug - Elements found:`, JSON.stringify(wpElements));
            
            // If it looks like an error page, log more details
            if (titleElement.toLowerCase().includes('error') || 
                titleElement.toLowerCase().includes('not found') ||
                titleElement.toLowerCase().includes('just a moment') ||
                titleElement.toLowerCase().includes('checking') ||
                h1Text.toLowerCase().includes('error') ||
                h1Text.toLowerCase().includes('not found') ||
                h1Text.includes('sites.williams.edu')) {
              log.warn(`Page ${currentPage} appears to be an error/protection page!`);
              // Log first 500 chars of content for debugging
              const snippet = content.substring(0, 500).replace(/\s+/g, ' ').trim();
              log.warn(`Page ${currentPage} content snippet: ${snippet}...`);
              
              // If this looks like Cloudflare protection, wait longer and try to bypass
              if (titleElement.toLowerCase().includes('just a moment') || 
                  h1Text.includes('sites.williams.edu')) {
                log.warn(`Cloudflare protection detected on page ${currentPage}! Waiting 10 seconds and retrying...`);
                
                try {
                  // Wait for Cloudflare check to complete
                  await new Promise(resolve => setTimeout(resolve, 10000));
                  
                  // Try to wait for the real content to load
                  await this.page.waitForSelector('.fl-post-feed-post, article, .post', { 
                    timeout: 30000 
                  }).catch(() => {
                    log.warn(`Still no content after Cloudflare wait on page ${currentPage}`);
                  });
                  
                  // Re-get the content after waiting
                  const newContent = await this.page.content();
                  const new$ = cheerio.load(newContent);
                  const newTitle = new$('title').text() || 'no-title-after-wait';
                  
                  if (!newTitle.toLowerCase().includes('just a moment')) {
                    log.info(`Cloudflare bypass successful on page ${currentPage}! New title: ${newTitle}`);
                    // Update our content variables
                    content = newContent;
                    $ = new$;
                  } else {
                    log.error(`Cloudflare bypass failed on page ${currentPage} - still getting protection screen`);
                  }
                  
                } catch (error) {
                  log.error(`Error during Cloudflare bypass on page ${currentPage}: ${error.message}`);
                }
              }
            }
          }

          // Extract project URLs from this page
          const pageProjectUrls = [];
          
          log.debug(`Looking for .fl-post-feed-post elements on page ${currentPage}...`);
          
          // Find all post containers on this page
          $('.fl-post-feed-post').each((i, postElement) => {
            const $post = $(postElement);
            
            // Look for the main link within each post
            const titleLink = $post.find('h2 a, h3 a, .fl-post-title a').first();
            const readMoreLink = $post.find('a[href*="projects/"]').first();
            const wrapperLink = $post.find('> a').first();
            
            let projectLink = titleLink.length ? titleLink : 
                             readMoreLink.length ? readMoreLink : 
                             wrapperLink;
            
            if (projectLink.length) {
              const href = projectLink.attr('href');
              const title = projectLink.text().trim() || $post.find('h2, h3, .fl-post-title').text().trim();
              
              if (href && href.includes('projects/')) {
                const fullUrl = new URL(href, CONFIG.baseUrl).href;
                
                // Only add if not already found
                if (!allProjectUrls.includes(fullUrl)) {
                  pageProjectUrls.push(fullUrl);
                  allProjectUrls.push(fullUrl);
                  log.debug(`Found project: "${title}" - ${fullUrl}`);
                }
              }
            }
          });
          
          // Fallback for this page if no fl-post-feed-post found
          if (pageProjectUrls.length === 0) {
            log.warn(`No projects found in .fl-post-feed-post on page ${currentPage}, trying comprehensive fallbacks...`);
            
            // Try multiple fallback strategies
            const fallbackSelectors = [
              'article a[href*="projects/"]',
              '.post a[href*="projects/"]', 
              '.entry a[href*="projects/"]',
              '.project a[href*="projects/"]',
              '.content a[href*="projects/"]',
              '.main a[href*="projects/"]',
              'a[href*="projects/"]'
            ];
            
            for (const selector of fallbackSelectors) {
              if (pageProjectUrls.length > 0) break; // Stop if we found some
              
              log.debug(`Trying fallback selector: ${selector}`);
              $(selector).each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                
                // Be more strict about what constitutes a valid project link
                if (href && text.length > 5 && href.includes('/projects/') && !href.includes('#')) {
                  const fullUrl = new URL(href, CONFIG.baseUrl).href;
                  if (!allProjectUrls.includes(fullUrl)) {
                    pageProjectUrls.push(fullUrl);
                    allProjectUrls.push(fullUrl);
                    log.debug(`Fallback (${selector}) found: "${text}" - ${fullUrl}`);
                  }
                }
              });
              
              if (pageProjectUrls.length > 0) {
                log.info(`Fallback selector "${selector}" found ${pageProjectUrls.length} projects on page ${currentPage}`);
                break;
              }
            }
            
            // If still no projects found, this might be an empty page or error page
            if (pageProjectUrls.length === 0) {
              log.warn(`All fallback selectors failed for page ${currentPage} - this may be an empty or error page`);
            }
          }
          
          log.info(`Found ${pageProjectUrls.length} projects on page ${currentPage}`);
          
          // Check for next page - look for pagination links
          const nextPageSelectors = [
            '.pagination .next',
            '.wp-pagenavi .next',
            '.page-numbers.next',
            'a[rel="next"]',
            '.fl-pagination .next'
          ];
          
          let hasNext = false;
          for (const selector of nextPageSelectors) {
            if ($(selector).length > 0) {
              hasNext = true;
              break;
            }
          }
          
          // Also check if we found any projects on this page
          // If we found 0 projects, likely no more pages
          if (pageProjectUrls.length === 0) {
            hasNext = false;
            log.info(`No projects found on page ${currentPage}, assuming no more pages`);
          }
          
          // Check for specific page number links to see if there are more pages
          if (!hasNext) {
            const maxPageNumber = Math.max(...$('.page-numbers')
              .map((i, el) => {
                const text = $(el).text().trim();
                return isNaN(text) ? 0 : parseInt(text);
              }).get());
            
            if (maxPageNumber > currentPage) {
              hasNext = true;
            }
          }
          
          hasMorePages = hasNext;
          
          if (hasMorePages) {
            log.info(`Found indication of page ${currentPage + 1}, continuing...`);
            currentPage++;
            
            // Add delay between pages to be respectful
            const delay = CONFIG.delays.betweenPages;
            log.info(`Waiting ${delay}ms before loading page ${currentPage}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            log.info(`No more pages found after page ${currentPage}`);
          }
          
        } catch (pageError) {
          if (pageError.message.includes('net::ERR_FAILED') || pageError.message.includes('404')) {
            log.info(`Page ${currentPage} not found (404), stopping pagination`);
            hasMorePages = false;
          } else {
            log.warn(`Error loading page ${currentPage}: ${pageError.message}`);
            hasMorePages = false;
          }
        }
      }
      
      // Debug output
      if (CONFIG.isDevelopment) {
        log.debug(`Total pages scraped: ${currentPage}`);
        log.debug(`Total unique projects found: ${allProjectUrls.length}`);
      }

      this.stats.projectsFound = allProjectUrls.length;
      log.info(`Discovered ${allProjectUrls.length} total projects across ${currentPage} pages`);

      // Limit for development/testing
      if (CONFIG.maxProjects && allProjectUrls.length > CONFIG.maxProjects) {
        log.info(`Limiting to ${CONFIG.maxProjects} projects for testing`);
        return allProjectUrls.slice(0, CONFIG.maxProjects);
      }

      return allProjectUrls;

    } catch (error) {
      log.error(`Failed to discover projects: ${error.message}`);
      this.stats.errors++;
      return [];
    }
  }

  // Scrape individual project details
  async scrapeProject(url) {
    try {
      log.info(`Scraping project: ${url}`);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      let content = await this.page.content();
      let $ = cheerio.load(content);
      
      // Check for Cloudflare protection on individual project pages
      const titleElement = $('title').text() || '';
      const h1Text = $('h1').first().text().trim() || '';
      
      if (titleElement.toLowerCase().includes('just a moment') || 
          h1Text.includes('sites.williams.edu')) {
        log.warn(`Cloudflare protection detected on project page: ${url}`);
        log.warn(`Waiting 10 seconds and retrying...`);
        
        try {
          // Wait for Cloudflare check to complete
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Try to wait for the real content to load
          await this.page.waitForSelector('.entry-content, .post-content, .content', { 
            timeout: 30000 
          }).catch(() => {
            log.warn(`Still no content after Cloudflare wait on project: ${url}`);
          });
          
          // Re-get the content after waiting
          content = await this.page.content();
          $ = cheerio.load(content);
          const newTitle = $('title').text() || '';
          
          if (!newTitle.toLowerCase().includes('just a moment')) {
            log.info(`Cloudflare bypass successful for project: ${url}`);
          } else {
            log.error(`Cloudflare bypass failed for project: ${url} - still getting protection screen`);
          }
          
        } catch (error) {
          log.error(`Error during Cloudflare bypass on project ${url}: ${error.message}`);
        }
      }

      // TODO: Update these selectors based on actual site structure
      const project = {
        id: this.generateProjectId(url),
        url: url,
        title: '',
        author: '',
        description: '',
        content: '',
        tags: [],
        images: {
          main: '',
          thumbnail: '',
          gallery: []
        },
        dateCreated: '',
        dateScraped: new Date().toISOString()
      };

      // Extract title
      project.title = $('title').text().trim() || 
                     $('h1').first().text().trim() || 
                     $('.entry-title').text().trim() ||
                     $('.post-title').text().trim() ||
                     'Unknown Title';
      
      // Extract author
      project.author = $('.author').text().trim() || 
                      $('.post-author').text().trim() ||
                      $('[class*="author"]').first().text().trim() ||
                      $('.byline').text().trim() ||
                      '';
      
      // Extract main image - prioritize content images over banners/headers
      const imageSelectors = [
        // Content area images first
        '.entry-content img',
        '.post-content img',
        '.content img',
        'article img',
        '.fl-rich-text img',
        // Featured images
        '.featured-image img',
        '.hero-image img', 
        '.wp-post-image',
        '[class*="featured"] img',
        // Gallery images
        '.gallery img',
        '.wp-block-gallery img'
      ];
      
      let foundMainImage = false;
      
      for (const selector of imageSelectors) {
        if (foundMainImage) break;
        
        $(selector).each((i, el) => {
          if (foundMainImage) return false;
          
          let imgSrc = $(el).attr('src') || $(el).attr('data-src');
          if (imgSrc) {
            const fullUrl = new URL(imgSrc, url).href;
            
            // Skip banners, headers, and very small images
            const skipPatterns = [
              'banner',
              'header',
              'logo',
              'cropped-',
              'favicon'
            ];
            
            const shouldSkip = skipPatterns.some(pattern => 
              fullUrl.toLowerCase().includes(pattern.toLowerCase())
            );
            
            if (!shouldSkip) {
              project.images.main = fullUrl;
              foundMainImage = true;
              return false;
            }
          }
        });
      }
      
      // Extract tags - look for actual tag elements and the tagged section at bottom
      const tagSelectors = [
        '.entry-footer .tags a',
        '.post-tags a', 
        '.tag-links a',
        '[rel="tag"]',
        '.tags a'
      ];
      
      for (const selector of tagSelectors) {
        $(selector).each((i, el) => {
          const tagText = $(el).text().trim();
          if (tagText && tagText.length > 0 && tagText.length < 50 && !project.tags.includes(tagText)) {
            project.tags.push(tagText);
          }
        });
      }
      
      // Also look for tags in "tagged" text at end of posts
      const taggedText = $('*:contains("tagged")').text();
      if (taggedText.includes('tagged')) {
        const tagMatch = taggedText.match(/tagged\s+([^.]+)/i);
        if (tagMatch) {
          const tags = tagMatch[1].split(/[,\s]+by\s+/)[0].split(',');
          tags.forEach(tag => {
            const cleanTag = tag.trim();
            if (cleanTag && cleanTag.length > 0 && cleanTag.length < 50 && !project.tags.includes(cleanTag)) {
              project.tags.push(cleanTag);
            }
          });
        }
      }
      
      // Extract description/excerpt
      project.description = $('.excerpt').text().trim() || 
                           $('.entry-summary').text().trim() ||
                           $('.post-excerpt').text().trim() ||
                           $('p').first().text().trim().substring(0, 200) ||
                           '';
      
      // Extract content
      project.content = $('.entry-content').text().trim() || 
                       $('.post-content').text().trim() ||
                       $('.content').text().trim() ||
                       '';
      
      // Extract date
      project.dateCreated = $('.date').text().trim() || 
                           $('.post-date').text().trim() ||
                           $('[class*="date"]').first().text().trim() ||
                           '';
      
      log.debug(`Extracted data for: ${project.title}`);
      log.debug(`Author: ${project.author}`);
      log.debug(`Main image: ${project.images.main}`);
      log.debug(`Tags found: ${project.tags.join(', ')}`);

      // Generate QR code
      project.qrCode = await this.generateQRCode(url, project.id);

      // Validate project data
      if (this.validateProject(project)) {
        this.stats.projectsScraped++;
        log.info(`Successfully scraped: ${project.title}`);
        return project;
      } else {
        log.warn(`Invalid project data for: ${url}`);
        this.stats.errors++;
        return null;
      }

    } catch (error) {
      log.error(`Failed to scrape project ${url}: ${error.message}`);
      this.stats.errors++;
      return null;
    }
  }

  // Generate QR code for project URL
  async generateQRCode(url, projectId) {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Optionally save QR code as file
      if (CONFIG.qrCodePath) {
        await fs.ensureDir(CONFIG.qrCodePath);
        const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
        await fs.writeFile(path.join(CONFIG.qrCodePath, `${projectId}.png`), qrBuffer);
      }

      return qrCodeDataURL;
    } catch (error) {
      log.error(`Failed to generate QR code for ${url}: ${error.message}`);
      return null;
    }
  }

  // Generate unique project ID from URL
  generateProjectId(url) {
    return url
      .replace(CONFIG.baseUrl, '')
      .replace(/\/$/, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase()
      .substring(0, 50);
  }

  // Validate project data
  validateProject(project) {
    const required = ['title', 'url'];
    const missing = required.filter(field => !project[field] || project[field].length === 0);
    
    if (missing.length > 0) {
      log.warn(`Project missing required fields: ${missing.join(', ')}`);
      return false;
    }
    
    return true;
  }

  // Add delay between requests
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Save projects to JSON file
  async saveData() {
    try {
      const data = {
        lastUpdated: new Date().toISOString(),
        totalProjects: this.projects.length,
        scrapingStats: this.stats,
        projects: this.projects
      };

      await fs.ensureDir(path.dirname(CONFIG.dataPath));
      await fs.writeJson(CONFIG.dataPath, data, { spaces: 2 });
      
      log.info(`Saved ${this.projects.length} projects to ${CONFIG.dataPath}`);
    } catch (error) {
      log.error(`Failed to save data: ${error.message}`);
      throw error;
    }
  }

  // Load existing data for comparison
  async loadExistingData() {
    try {
      if (await fs.pathExists(CONFIG.dataPath)) {
        const data = await fs.readJson(CONFIG.dataPath);
        log.info(`Loaded ${data.projects?.length || 0} existing projects`);
        return data;
      }
    } catch (error) {
      log.warn(`Could not load existing data: ${error.message}`);
    }
    return null;
  }

  // Check if project matches tag filter criteria
  matchesTagFilter(project) {
    // If tag filtering is disabled, include all projects
    if (!CONFIG.tagFilter.enabled) {
      return true;
    }

    // If no tags found in project, exclude it
    if (!project.tags || project.tags.length === 0) {
      return false;
    }

    const projectTags = project.tags.map(tag => tag.toLowerCase().trim());
    const requiredTags = CONFIG.tagFilter.requiredTags.map(tag => tag.toLowerCase().trim());

    if (CONFIG.tagFilter.mode === 'all') {
      // Project must have ALL required tags
      return requiredTags.every(requiredTag => 
        projectTags.some(projectTag => projectTag.includes(requiredTag))
      );
    } else {
      // Project must have at least ONE required tag (default mode)
      return requiredTags.some(requiredTag => 
        projectTags.some(projectTag => projectTag.includes(requiredTag))
      );
    }
  }

  // Check if a tag should be excluded from display
  shouldExcludeTag(tag) {
    const normalizedTag = tag.toLowerCase().trim();
    return CONFIG.excludedTags.some(excludedTag => 
      normalizedTag.includes(excludedTag.toLowerCase()) || 
      excludedTag.toLowerCase().includes(normalizedTag)
    );
  }

  // Filter out excluded tags from a project's tag list
  filterTags(tags) {
    return tags.filter(tag => !this.shouldExcludeTag(tag));
  }

  // Main scraping process
  async scrape() {
    try {
      log.info('Starting scraping process...');
      log.info(`Environment: ${process.env.CI ? 'CI' : 'Local'}`);
      log.info(`Node version: ${process.version}`);

      // Log tag filtering configuration
      if (CONFIG.tagFilter.enabled) {
        log.info(`Tag filtering enabled: requiring ${CONFIG.tagFilter.mode === 'all' ? 'ALL' : 'ANY'} of [${CONFIG.tagFilter.requiredTags.join(', ')}]`);
      } else {
        log.info('Tag filtering disabled - including all projects');
      }

      // Initialize browser
      await this.initBrowser();
      
      // Test connectivity first
      log.info('Testing browser connectivity...');
      try {
        await this.page.goto('https://www.google.com', { 
          waitUntil: 'networkidle0', 
          timeout: 30000 
        });
        log.info('✓ Browser connectivity test successful');
      } catch (error) {
        log.error(`✗ Browser connectivity test failed: ${error.message}`);
        throw new Error('Browser connectivity issues detected');
      }

      // Discover projects
      const projectUrls = await this.discoverProjects();
      
      if (projectUrls.length === 0) {
        log.warn('No projects found to scrape');
        return;
      }

      // Scrape each project
      let filteredCount = 0;
      for (const [index, url] of projectUrls.entries()) {
        log.info(`Processing project ${index + 1}/${projectUrls.length}`);
        
        const project = await this.scrapeProject(url);
        
        if (project) {
          // Apply tag filtering BEFORE removing excluded tags for display
          if (this.matchesTagFilter(project)) {
            // Now filter out excluded tags for display only
            project.tags = this.filterTags(project.tags);
            
            this.projects.push(project);
            log.debug(`✓ Project "${project.title}" matches tag filter`);
          } else {
            filteredCount++;
            log.debug(`✗ Project "${project.title}" filtered out (tags: ${project.tags?.join(', ') || 'none'})`);
          }
        }

        // Add delay between projects
        if (index < projectUrls.length - 1) {
          await this.delay(CONFIG.delays.betweenProjects);
        }
      }

      // Log filtering results
      if (CONFIG.tagFilter.enabled) {
        log.info(`Tag filtering results: ${this.projects.length} projects included, ${filteredCount} projects filtered out`);
      }

      // Save results
      await this.saveData();

      // Log final statistics
      const duration = (Date.now() - this.stats.startTime) / 1000;
      log.info(`Scraping completed in ${duration}s`);
      log.info(`Projects found: ${this.stats.projectsFound}`);
      log.info(`Projects successfully scraped: ${this.stats.projectsScraped}`);
      log.info(`Projects included after filtering: ${this.projects.length}`);
      log.info(`Errors encountered: ${this.stats.errors}`);

    } catch (error) {
      log.error(`Scraping process failed: ${error.message}`);
      throw error;
    } finally {
      // Always close browser
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Run scraper if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new MakerspaceScraper();
  
  scraper.scrape()
    .then(() => {
      log.info('Scraping process completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      log.error(`Scraping process failed: ${error.message}`);
      process.exit(1);
    });
}

export default MakerspaceScraper;