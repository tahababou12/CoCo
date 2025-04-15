const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Print banner
console.log(`${colors.blue}
   _____      _____      
  / ____|    / ____|     
 | |        | |          
 | |        | |          
 | |____    | |____      
  \\_____|    \\_____|     
                         
${colors.bright}CoCo Backend Server${colors.reset}
`);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`${colors.green}✓ Created logs directory${colors.reset}`);
}

// Function to start WebSocket server
function startWebSocketServer() {
  console.log(`${colors.yellow}Starting WebSocket server...${colors.reset}`);
  
  // Import the WebSocket server module directly
  const webSocketProcess = spawn('node', ['websocket-server.js'], { 
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  
  webSocketProcess.stdout.on('data', (data) => {
    process.stdout.write(`${colors.cyan}[WebSocket] ${colors.reset}${data}`);
  });
  
  webSocketProcess.stderr.on('data', (data) => {
    const dataStr = data.toString();
    // Check if the message contains error indicators or is just normal log output
    if (dataStr.includes('ERROR') || dataStr.includes('Exception') || dataStr.includes('Error:') || 
        dataStr.includes('Traceback') || dataStr.includes('Failed') || dataStr.includes('error')) {
      process.stderr.write(`${colors.red}[WebSocket ERROR] ${colors.reset}${data}`);
    } else {
      process.stdout.write(`${colors.cyan}[WebSocket] ${colors.reset}${data}`);
    }
  });
  
  webSocketProcess.on('close', (code) => {
    console.log(`${colors.red}WebSocket server process exited with code ${code}${colors.reset}`);
  });
  
  return webSocketProcess;
}

// Function to start Flask API server
function startFlaskServer() {
  console.log(`${colors.yellow}Starting Flask API server...${colors.reset}`);
  
  // Check and create Python virtual environment if needed
  const venvPath = path.join(__dirname, 'venv');
  const pythonCmd = fs.existsSync(venvPath) ? 
    (process.platform === 'win32' ? path.join(venvPath, 'Scripts', 'python') : path.join(venvPath, 'bin', 'python')) : 
    'python';
  
  // Start Flask app
  const flaskProcess = spawn(pythonCmd, ['-m', 'flask', 'run', '--host=0.0.0.0', '--port=5001'], {
    cwd: __dirname,
    env: { ...process.env, FLASK_APP: 'app.py', FLASK_ENV: 'development' },
    stdio: ['inherit', 'pipe', 'pipe']
  });
  
  flaskProcess.stdout.on('data', (data) => {
    process.stdout.write(`${colors.green}[Flask API] ${colors.reset}${data}`);
  });
  
  flaskProcess.stderr.on('data', (data) => {
    const dataStr = data.toString();
    // Check if the message contains error indicators or is just normal log output
    if (dataStr.includes('ERROR') || dataStr.includes('Exception') || dataStr.includes('Error:') || 
        dataStr.includes('Traceback') || dataStr.includes('Failed')) {
      process.stderr.write(`${colors.red}[Flask API ERROR] ${colors.reset}${data}`);
    } else {
      process.stdout.write(`${colors.green}[Flask API] ${colors.reset}${data}`);
    }
  });
  
  flaskProcess.on('close', (code) => {
    console.log(`${colors.red}Flask API server process exited with code ${code}${colors.reset}`);
  });
  
  return flaskProcess;
}

// Start both servers
const webSocketServer = startWebSocketServer();
const flaskServer = startFlaskServer();

// Handle process termination
process.on('SIGINT', () => {
  console.log(`${colors.yellow}\nShutting down servers...${colors.reset}`);
  webSocketServer.kill();
  flaskServer.kill();
  process.exit(0);
});

console.log(`\n${colors.green}All servers started! 🚀${colors.reset}`);
console.log(`${colors.blue}WebSocket Server (proxied):${colors.reset} wss://coco.bragai.tech/ws`);
console.log(`${colors.blue}Flask API Server (proxied):${colors.reset} https://coco.bragai.tech/api`); 