#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

let colors = {};

async function initializeColors() {
  const chalk = (await import('chalk')).default;
  colors = {
    dev: chalk.cyan,
    browser: chalk.green,
    error: chalk.red,
    info: chalk.blue,
    warn: chalk.yellow
  };
}

let devServer = null;
let browserMonitor = null;

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(colors.info('\n[DEBUG] Shutting down...'));
  
  if (browserMonitor) {
    browserMonitor.kill('SIGTERM');
  }
  
  if (devServer) {
    devServer.kill('SIGTERM');
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

async function startDebugMode() {
  await initializeColors();
  console.log(colors.info('[DEBUG] Starting development server with Turbopack...'));
  
  // Start Next.js dev server with Turbopack
  devServer = spawn('npm', ['run', 'dev', '--', '--turbopack'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
  });

  devServer.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(colors.dev('[DEV]'), output);
    }
  });

  devServer.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(colors.dev('[DEV]'), output);
    }
  });

  devServer.on('error', (error) => {
    console.error(colors.error('[DEV ERROR]'), error.message);
  });

  // Wait for server to be ready (basic wait)
  console.log(colors.info('[DEBUG] Waiting for server to start...'));
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Start browser monitor
  console.log(colors.info('[DEBUG] Starting browser monitor...'));
  
  const monitorScript = path.join(__dirname, 'browser-monitor.js');
  browserMonitor = spawn('node', [monitorScript, '--headed'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false
  });

  browserMonitor.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(colors.browser('[BROWSER]'), output);
    }
  });

  browserMonitor.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(colors.browser('[BROWSER]'), output);
    }
  });

  browserMonitor.on('error', (error) => {
    console.error(colors.error('[BROWSER ERROR]'), error.message);
  });

  console.log(colors.info('[DEBUG] Debug environment ready! Press Ctrl+C to stop.'));
}

startDebugMode().catch((error) => {
  console.error(colors.error('[DEBUG ERROR]'), error.message);
  process.exit(1);
});