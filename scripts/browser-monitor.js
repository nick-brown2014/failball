#!/usr/bin/env node

const { chromium } = require('playwright');

let colors = {};

async function initializeColors() {
  const chalk = (await import('chalk')).default;
  colors = {
    console: chalk.blue,
    error: chalk.red,
    warn: chalk.yellow,
    network: chalk.magenta,
    info: chalk.cyan
  };
}

// Parse command line arguments
const args = process.argv.slice(2);
const isHeaded = args.includes('--headed');
const targetUrl = args.find(arg => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';

async function startBrowserMonitor() {
  await initializeColors();
  let browser = null;
  let page = null;
  
  try {
    console.log(colors.info(`Starting browser monitor (${isHeaded ? 'headed' : 'headless'})...`));
    
    // Launch browser
    browser = await chromium.launch({
      headless: !isHeaded,
      devtools: isHeaded,
      args: isHeaded ? [
        '--start-maximized',
        '--auto-open-devtools-for-tabs'
      ] : []
    });
    
    // Create new page
    page = await browser.newPage();
    
    // Listen to console messages
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      if (type === 'error') {
        console.log(colors.error(`Console Error: ${text}`));
      } else if (type === 'warn' || type === 'warning') {
        console.log(colors.warn(`Console Warning: ${text}`));
      } else {
        console.log(colors.console(`Console ${type}: ${text}`));
      }
    });
    
    // Listen to page errors
    page.on('pageerror', error => {
      console.log(colors.error(`Page Error: ${error.message}`));
    });
    
    // Listen to network requests
    page.on('request', request => {
      const url = request.url();
      const method = request.method();
      
      // Filter out static assets for cleaner output
      if (url.includes('/_next/') && !url.includes('/api/')) {
        return;
      }
      
      console.log(colors.network(`${method} ${url}`));
    });
    
    // Listen to network responses
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      
      // Filter out static assets and only show interesting responses
      if (url.includes('/_next/') && !url.includes('/api/')) {
        return;
      }
      
      if (status >= 400) {
        console.log(colors.error(`${status} ${url}`));
      } else if (url.includes('/api/') || status >= 300) {
        console.log(colors.network(`${status} ${url}`));
      }
    });
    
    // Navigate to the application
    console.log(colors.info(`Navigating to ${targetUrl}...`));
    await page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    console.log(colors.info('Browser monitor active. Monitoring console, errors, and network traffic...'));
    
    // Keep the process alive
    if (!isHeaded) {
      // In headless mode, keep monitoring until process is killed
      process.on('SIGTERM', async () => {
        console.log(colors.info('Shutting down browser monitor...'));
        if (page) await page.close();
        if (browser) await browser.close();
        process.exit(0);
      });
      
      // Keep alive
      await new Promise(() => {});
    } else {
      // In headed mode, monitor until browser is closed
      browser.on('disconnected', () => {
        console.log(colors.info('Browser closed. Exiting monitor...'));
        process.exit(0);
      });
      
      // Keep alive until browser is closed
      await new Promise((resolve) => {
        browser.on('disconnected', resolve);
      });
    }
    
  } catch (error) {
    console.error(colors.error(`Browser monitor error: ${error.message}`));
    
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(colors.info('\nShutting down browser monitor...'));
  process.exit(0);
});

// Start monitoring
startBrowserMonitor();