const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = 8080;
let psProcess = null;

// Virtual Key Code Map for Windows API
const KEY_MAP = {
  'a': 0x41, 'b': 0x42, 'c': 0x43, 'd': 0x44, 'e': 0x45, 'f': 0x46, 'g': 0x47,
  'h': 0x48, 'i': 0x49, 'j': 0x4A, 'k': 0x4B, 'l': 0x4C, 'm': 0x4D, 'n': 0x4E,
  'o': 0x4F, 'p': 0x50, 'q': 0x51, 'r': 0x52, 's': 0x53, 't': 0x54, 'u': 0x55,
  'v': 0x56, 'w': 0x57, 'x': 0x58, 'y': 0x59, 'z': 0x5A,
  
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34, '5': 0x35, '6': 0x36,
  '7': 0x37, '8': 0x38, '9': 0x39,
  
  'f1': 0x70, 'f2': 0x71, 'f3': 0x72, 'f4': 0x73, 'f5': 0x74, 'f6': 0x75,
  'f7': 0x76, 'f8': 0x77, 'f9': 0x78, 'f10': 0x79, 'f11': 0x7A, 'f12': 0x7B,
  
  'backspace': 0x08, 'tab': 0x09, 'enter': 0x0D, 'shift': 0x10, 'ctrl': 0x11,
  'alt': 0x12, 'pause': 0x13, 'capslock': 0x14, 'escape': 0x1B, 'space': 0x20,
  'pageup': 0x21, 'pagedown': 0x22, 'end': 0x23, 'home': 0x24,
  'left': 0x25, 'up': 0x26, 'right': 0x27, 'down': 0x28,
  'insert': 0x2D, 'delete': 0x2E, 'win': 0x5B,
  
  ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE, '/': 0xBF, '`': 0xC0,
  '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE
};

// Initialize Windows Input Injector using inline C# in persistent PowerShell
function initWindowsInput() {
  if (os.platform() !== 'win32') {
    console.log('[System] Non-Windows OS detected. Keystroke injection will be logged to console (Run Windows for native injection).');
    return;
  }

  console.log('[System] Initializing native Windows Input Injector (PowerShell C# Bridge)...');
  
  psProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const csharpCode = `
using System;
using System.Runtime.InteropServices;
public class WinInput {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

    public const uint MOUSEEVENTF_MOVE = 0x0001;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    public static void SendKey(byte vk, bool up) {
        uint flags = up ? KEYEVENTF_KEYUP : 0;
        if ((vk >= 0x21 && vk <= 0x2E) || (vk >= 0x25 && vk <= 0x28)) {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        keybd_event(vk, 0, flags, UIntPtr.Zero);
    }

    public static void MoveMouse(int dx, int dy) {
        mouse_event(MOUSEEVENTF_MOVE, dx, dy, 0, UIntPtr.Zero);
    }

    public static void ClickMouse(string button, bool up) {
        uint flags = 0;
        if (button == "left") {
            flags = up ? MOUSEEVENTF_LEFTUP : MOUSEEVENTF_LEFTDOWN;
        } else if (button == "right") {
            flags = up ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_RIGHTDOWN;
        } else if (button == "middle") {
            flags = up ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_MIDDLEDOWN;
        }
        mouse_event(flags, 0, 0, 0, UIntPtr.Zero);
    }

    public static void ScrollMouse(int clicks) {
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)(clicks * 120), UIntPtr.Zero);
    }
}
`;

  psProcess.stdin.write(`Add-Type -TypeDefinition @"\n${csharpCode}\n"@\n`);
  psProcess.stdin.write(`[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')\n`);

  psProcess.stderr.on('data', (data) => {
    console.error(`[PowerShell Error]: ${data.toString()}`);
  });

  console.log('[System] Windows Native Input Injector Ready.');
}

// Inject inputs into the operating system
function injectInput(message) {
  const { type, key, code, dx, dy, button, up, clicks, value } = message;

  if (os.platform() !== 'win32') {
    // Graceful logging for non-Windows platforms
    return;
  }

  if (!psProcess) return;

  try {
    if (type === 'keydown' || type === 'keyup') {
      const isUp = type === 'keyup';
      const vk = KEY_MAP[key.toLowerCase()];
      if (vk) {
        psProcess.stdin.write(`[WinInput]::SendKey(${vk}, ${isUp ? '$true' : '$false'})\n`);
      } else {
        // Fallback for special system characters
        if (!isUp) {
          const escaped = key.replace(/"/g, '`"').replace(/'/g, "''");
          psProcess.stdin.write(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')\n`);
        }
      }
    } else if (type === 'string') {
      // Direct string injection (macros)
      const escaped = value.replace(/"/g, '`"').replace(/'/g, "''");
      psProcess.stdin.write(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')\n`);
    } else if (type === 'mouse_move') {
      psProcess.stdin.write(`[WinInput]::MoveMouse(${dx}, ${dy})\n`);
    } else if (type === 'mouse_click') {
      const isUp = up === true;
      psProcess.stdin.write(`[WinInput]::ClickMouse('${button}', ${isUp ? '$true' : '$false'})\n`);
    } else if (type === 'mouse_scroll') {
      psProcess.stdin.write(`[WinInput]::ScrollMouse(${clicks})\n`);
    } else if (type === 'media') {
      // Handle special media keys
      const mediaMap = {
        'play_pause': 0xB3,
        'stop': 0xB2,
        'next': 0xB0,
        'prev': 0xB1,
        'vol_up': 0xAF,
        'vol_down': 0xAE,
        'mute': 0xAD
      };
      const vk = mediaMap[key];
      if (vk) {
        psProcess.stdin.write(`[WinInput]::SendKey(${vk}, $false)\n[WinInput]::SendKey(${vk}, $true)\n`);
      }
    }
  } catch (err) {
    console.error(`[Input Injection Error]: ${err.message}`);
  }
}

// Get Local Network IPs
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }
  return addresses;
}

// Create HTTP server to serve the static web receiver
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  
  let contentType = 'text/html';
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpg'; break;
    case '.ico': contentType = 'image/x-icon'; break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Fallback to serving index.html for SPAs or if not found
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, htmlContent) => {
          if (err) {
            res.writeHead(404);
            res.end('File Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Setup WebSocket server
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected from ${clientIp}`);
  clients.add(ws);

  // Send system confirmation
  ws.send(JSON.stringify({ type: 'system', text: 'Connected to antigravity desktop receiver' }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);

      // Broadcast keys to web-receivers (so they visualised typed text, graphs, WPM etc)
      broadcast(parsed, ws);

      // Inject keys natively into operating system (Windows)
      injectInput(parsed);

    } catch (err) {
      console.error(`[WS Message Parse Error]: ${err.message}`);
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected`);
    clients.delete(ws);
  });
});

function broadcast(data, sender) {
  const rawData = JSON.stringify(data);
  for (const client of clients) {
    if (client !== sender && client.readyState === client.OPEN) {
      client.send(rawData);
    }
  }
}

// Start Server
initWindowsInput();
server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log('    ⚡ ANTIGRAVITY WIRELESS KEYBOARD RECEIVER ⚡');
  console.log('======================================================');
  console.log(`\n[Server] Listening on http://localhost:${PORT}`);
  console.log('\n[Network] Connect using any of the following IPs:');
  const ips = getLocalIPs();
  ips.forEach(ip => {
    console.log(`   - ${ip.interface}: http://${ip.address}:${PORT}`);
  });
  console.log('\n[Instructions]');
  console.log('1. Keep this terminal running on your computer.');
  console.log('2. Open the React Native mobile app on your phone.');
  console.log('3. Enter one of the IPs above in the mobile app.');
  console.log('4. Open the URL above in a browser on any secondary device (tablet/phone)');
  console.log('   to watch the keys type in real-time in the Web Receiver!');
  console.log('======================================================\n');
});

// Handle termination gracefully
process.on('SIGINT', () => {
  if (psProcess) {
    psProcess.stdin.end();
    psProcess.kill();
  }
  process.exit();
});
