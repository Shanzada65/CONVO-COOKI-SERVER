const fs = require('fs');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration and session storage
const sessions = new Map();
let wss;

// HTML Control Panel
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Message Sender Bot</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a1a;
            color: #e0e0e0;
        }
        .status {
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 5px;
            font-weight: bold;
            text-align: center;
        }
        .online { background: #4CAF50; color: white; }
        .offline { background: #f44336; color: white; }
        .connecting { background: #ff9800; color: white; }
        .server-connected { background: #2196F3; color: white; }
        .panel {
            background: #2d2d2d;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            margin-bottom: 20px;
        }
        button {
            padding: 10px 15px;
            margin: 5px;
            cursor: pointer;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            transition: all 0.3s;
        }
        button:hover {
            background: #0b7dda;
            transform: scale(1.02);
        }
        button:disabled {
            background: #555555;
            cursor: not-allowed;
        }
        input, select, textarea {
            padding: 10px;
            margin: 5px 0;
            width: 100%;
            border: 1px solid #444;
            border-radius: 4px;
            background: #333;
            color: white;
        }
        .log {
            height: 300px;
            overflow-y: auto;
            border: 1px solid #444;
            padding: 10px;
            margin-top: 20px;
            font-family: monospace;
            background: #222;
            color: #00ff00;
            border-radius: 4px;
        }
        small {
            color: #888;
            font-size: 12px;
        }
        h1, h2, h3 {
            color: #2196F3;
        }
        .session-info {
            background: #333;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
        }
        .tab {
            overflow: hidden;
            border: 1px solid #444;
            background-color: #2d2d2d;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        .tab button {
            background-color: inherit;
            float: left;
            border: none;
            outline: none;
            cursor: pointer;
            padding: 14px 16px;
            transition: 0.3s;
        }
        .tab button:hover {
            background-color: #444;
        }
        .tab button.active {
            background-color: #2196F3;
        }
        .tabcontent {
            display: none;
            padding: 6px 12px;
            border: 1px solid #444;
            border-top: none;
            border-radius: 0 0 4px 4px;
        }
        .active-tab {
            display: block;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-bottom: 15px;
        }
        .stat-box {
            background: #333;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
        }
        .cookie-status {
            margin-top: 10px;
            padding: 10px;
            border-radius: 5px;
            background: #333;
        }
        .cookie-active {
            border-left: 5px solid #4CAF50;
        }
        .cookie-inactive {
            border-left: 5px solid #f44336;
        }
    </style>
</head>
<body>
    <h1>💬 Multi-Cookie Message Sender Bot</h1>
    
    <div class="status connecting" id="status">
        Status: Connecting to server...
    </div>
    
    <div class="panel">
        <div class="tab">
            <button class="tablinks active" onclick="openTab(event, 'cookie-file-tab')">Cookie File</button>
            <button class="tablinks" onclick="openTab(event, 'cookie-text-tab')">Paste Cookies</button>
        </div>
        
        <div id="cookie-file-tab" class="tabcontent active-tab">
            <input type="file" id="cookie-file" accept=".txt">
            <small>Select your cookies file (each line should contain one cookie)</small>
        </div>
        
        <div id="cookie-text-tab" class="tabcontent">
            <textarea id="cookie-text" placeholder="Paste your cookies here (one cookie per line)" rows="5"></textarea>
            <small>Paste your cookies directly (one cookie per line)</small>
        </div>
        
        <div>
            <input type="text" id="thread-id" placeholder="Thread/Group ID">
            <small>Enter the Facebook Group/Thread ID where messages will be sent</small>
        </div>
        
        <div>
            <input type="number" id="delay" value="5" min="1" placeholder="Delay in seconds">
            <small>Delay between messages (in seconds)</small>
        </div>
        
        <div>
            <input type="text" id="prefix" placeholder="Message Prefix (Optional)">
            <small>Optional prefix to add before each message</small>
        </div>
        
        <div>
            <label for="message-file">Messages File</label>
            <input type="file" id="message-file" accept=".txt">
            <small>Upload messages.txt file with messages (one per line)</small>
        </div>
        
        <button id="start-btn">Start Sending</button>
        <button id="stop-btn" disabled>Stop Sending</button>
        
        <div id="session-info" style="display: none;" class="session-info">
            <h3>Your Session ID: <span id="session-id-display"></span></h3>
            <p>Save this ID to stop your session later</p>
            <input type="text" id="stop-session-id" placeholder="Enter Session ID to stop">
            <button id="stop-specific-btn">Stop Specific Session</button>
        </div>
    </div>
    
    <div class="panel">
        <h3>Session Statistics</h3>
        <div class="stats" id="stats-container">
            <div class="stat-box">
                <div>Status</div>
                <div id="stat-status">Not Started</div>
            </div>
            <div class="stat-box">
                <div>Total Messages Sent</div>
                <div id="stat-total-sent">0</div>
            </div>
            <div class="stat-box">
                <div>Current Loop Count</div>
                <div id="stat-loop-count">0</div>
            </div>
            <div class="stat-box">
                <div>Current Message</div>
                <div id="stat-current">-</div>
            </div>
            <div class="stat-box">
                <div>Current Cookie</div>
                <div id="stat-cookie">-</div>
            </div>
            <div class="stat-box">
                <div>Started At</div>
                <div id="stat-started">-</div>
            </div>
        </div>
        
        <h3>Cookies Status</h3>
        <div id="cookies-status-container"></div>
        
        <h3>Logs</h3>
        <div class="log" id="log-container"></div>
    </div>

    <script>
        const logContainer = document.getElementById('log-container');
        const statusDiv = document.getElementById('status');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const stopSpecificBtn = document.getElementById('stop-specific-btn');
        const cookieFileInput = document.getElementById('cookie-file');
        const cookieTextInput = document.getElementById('cookie-text');
        const threadIdInput = document.getElementById('thread-id');
        const delayInput = document.getElementById('delay');
        const prefixInput = document.getElementById('prefix');
        const messageFileInput = document.getElementById('message-file');
        const sessionInfoDiv = document.getElementById('session-info');
        const sessionIdDisplay = document.getElementById('session-id-display');
        const stopSessionIdInput = document.getElementById('stop-session-id');
        const cookiesStatusContainer = document.getElementById('cookies-status-container');
        
        // Stats elements
        const statStatus = document.getElementById('stat-status');
        const statTotalSent = document.getElementById('stat-total-sent');
        const statLoopCount = document.getElementById('stat-loop-count');
        const statCurrent = document.getElementById('stat-current');
        const statCookie = document.getElementById('stat-cookie');
        const statStarted = document.getElementById('stat-started');
        
        let currentSessionId = null;

        function openTab(evt, tabName) {
            const tabcontent = document.getElementsByClassName("tabcontent");
            for (let i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
            }
            
            const tablinks = document.getElementsByClassName("tablinks");
            for (let i = 0; i < tablinks.length; i++) {
                tablinks[i].className = tablinks[i].className.replace(" active", "");
            }
            
            document.getElementById(tabName).style.display = "block";
            evt.currentTarget.className += " active";
        }

        function addLog(message, type = 'info') {
            const logEntry = document.createElement('div');
            logEntry.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        function updateStats(data) {
            if (data.status) statStatus.textContent = data.status;
            if (data.totalSent !== undefined) statTotalSent.textContent = data.totalSent;
            if (data.loopCount !== undefined) statLoopCount.textContent = data.loopCount;
            if (data.current) statCurrent.textContent = data.current;
            if (data.cookie) statCookie.textContent = \`Cookie \${data.cookie}\`;
            if (data.started) statStarted.textContent = data.started;
        }
        
        function updateCookiesStatus(cookies) {
            cookiesStatusContainer.innerHTML = '';
            cookies.forEach((cookie, index) => {
                const cookieStatus = document.createElement('div');
                cookieStatus.className = \`cookie-status \${cookie.active ? 'cookie-active' : 'cookie-inactive'}\`;
                cookieStatus.innerHTML = \`
                    <strong>Cookie \${index + 1}:</strong> 
                    <span>\${cookie.active ? 'ACTIVE' : 'INACTIVE'}</span>
                    <span style="float: right;">Messages Sent: \${cookie.sentCount || 0}</span>
                \`;
                cookiesStatusContainer.appendChild(cookieStatus);
            });
        }

        // Dynamic protocol for Render
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);

        socket.onopen = () => {
            addLog('Connected to server');
            statusDiv.className = 'status server-connected';
            statusDiv.textContent = 'Status: Connected to Server';
        };
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'log') {
                addLog(data.message);
            } 
            else if (data.type === 'status') {
                statusDiv.className = data.running ? 'status online' : 'status server-connected';
                statusDiv.textContent = \`Status: \${data.running ? 'Sending Messages' : 'Connected to Server'}\`;
                startBtn.disabled = data.running;
                stopBtn.disabled = !data.running;
                
                if (data.running) {
                    statStatus.textContent = 'Running';
                } else {
                    statStatus.textContent = 'Stopped';
                }
            }
            else if (data.type === 'session') {
                currentSessionId = data.sessionId;
                sessionIdDisplay.textContent = data.sessionId;
                sessionInfoDiv.style.display = 'block';
                addLog(\`Your session ID: \${data.sessionId}\`);
            }
            else if (data.type === 'stats') {
                updateStats(data);
            }
            else if (data.type === 'cookies_status') {
                updateCookiesStatus(data.cookies);
            }
        };
        
        socket.onclose = () => {
            addLog('Disconnected from server');
            statusDiv.className = 'status offline';
            statusDiv.textContent = 'Status: Disconnected';
        };
        
        socket.onerror = (error) => {
            addLog(\`WebSocket error: \${error.message}\`);
            statusDiv.className = 'status offline';
            statusDiv.textContent = 'Status: Connection Error';
        };

        startBtn.addEventListener('click', () => {
            let cookiesContent = '';
            
            // Check which cookie input method is active
            const cookieFileTab = document.getElementById('cookie-file-tab');
            if (cookieFileTab.style.display !== 'none' && cookieFileInput.files.length > 0) {
                const cookieFile = cookieFileInput.files[0];
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    cookiesContent = event.target.result;
                    processStart(cookiesContent);
                };
                
                reader.readAsText(cookieFile);
            } 
            else if (cookieTextInput.value.trim()) {
                cookiesContent = cookieTextInput.value.trim();
                processStart(cookiesContent);
            }
            else {
                addLog('Please provide cookie content');
                return;
            }
        });
        
        function processStart(cookiesContent) {
            if (!threadIdInput.value.trim()) {
                addLog('Please enter a Thread/Group ID');
                return;
            }
            
            if (messageFileInput.files.length === 0) {
                addLog('Please select a messages file');
                return;
            }
            
            const messageFile = messageFileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const messageContent = event.target.result;
                const threadID = threadIdInput.value.trim();
                const delay = parseInt(delayInput.value) || 5;
                const prefix = prefixInput.value.trim();
                
                socket.send(JSON.stringify({
                    type: 'start',
                    cookiesContent,
                    messageContent,
                    threadID,
                    delay,
                    prefix
                }));
            };
            
            reader.readAsText(messageFile);
        }
        
        stopBtn.addEventListener('click', () => {
            if (currentSessionId) {
                socket.send(JSON.stringify({ 
                    type: 'stop', 
                    sessionId: currentSessionId 
                }));
            } else {
                addLog('No active session to stop');
            }
        });
        
        stopSpecificBtn.addEventListener('click', () => {
            const sessionId = stopSessionIdInput.value.trim();
            if (sessionId) {
                socket.send(JSON.stringify({ 
                    type: 'stop', 
                    sessionId: sessionId 
                }));
                addLog(\`Stop command sent for session: \${sessionId}\`);
            } else {
                addLog('Please enter a session ID');
            }
        });
        
        addLog('Control panel ready');
    </script>
</body>
</html>
`;

// Start message sending function with multiple cookies support
function startSending(ws, cookiesContent, messageContent, threadID, delay, prefix) {
  const sessionId = uuidv4();
  
  // Parse cookies (one per line)
  const cookies = cookiesContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((cookie, index) => ({
      id: index + 1,
      content: cookie,
      active: false,
      sentCount: 0,
      api: null
    }));
  
  if (cookies.length === 0) {
    ws.send(JSON.stringify({ type: 'log', message: 'No cookies found' }));
    return;
  }
  
  // Parse messages
  const messages = messageContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (messages.length === 0) {
    ws.send(JSON.stringify({ type: 'log', message: 'No messages found in the file' }));
    return;
  }

  // Create session object
  const session = {
    id: sessionId,
    threadID: threadID,
    messages: messages,
    cookies: cookies,
    currentCookieIndex: 0,
    currentMessageIndex: 0,
    totalMessagesSent: 0,
    loopCount: 0,
    delay: delay,
    prefix: prefix,
    running: true,
    startTime: new Date(),
    ws: ws
  };
  
  // Store session
  sessions.set(sessionId, session);
  
  // Send session ID to client
  ws.send(JSON.stringify({ 
    type: 'session', 
    sessionId: sessionId 
  }));
  
  ws.send(JSON.stringify({ type: 'log', message: `Session started with ID: ${sessionId}` }));
  ws.send(JSON.stringify({ type: 'log', message: `Loaded ${cookies.length} cookies` }));
  ws.send(JSON.stringify({ type: 'log', message: `Loaded ${messages.length} messages` }));
  ws.send(JSON.stringify({ type: 'status', running: true }));
  
  // Update stats
  updateSessionStats(sessionId);
  updateCookiesStatus(sessionId);
  
  // Initialize all cookies
  initializeCookies(sessionId);
}

// Initialize all cookies by logging in
function initializeCookies(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.running) return;
  
  let initializedCount = 0;
  
  session.cookies.forEach((cookie, index) => {
    wiegine.login(cookie.content, {}, (err, api) => {
      if (err || !api) {
        session.ws.send(JSON.stringify({ type: 'log', message: `Cookie ${index + 1} login failed: ${err?.message || err}` }));
        cookie.active = false;
      } else {
        cookie.api = api;
        cookie.active = true;
        session.ws.send(JSON.stringify({ type: 'log', message: `Cookie ${index + 1} logged in successfully` }));
      }
      
      initializedCount++;
      
      // If all cookies are initialized, start sending messages
      if (initializedCount === session.cookies.length) {
        const activeCookies = session.cookies.filter(c => c.active);
        if (activeCookies.length > 0) {
          session.ws.send(JSON.stringify({ type: 'log', message: `${activeCookies.length}/${session.cookies.length} cookies active, starting message sending` }));
          sendNextMessage(sessionId);
        } else {
          session.ws.send(JSON.stringify({ type: 'log', message: 'No active cookies, stopping session' }));
          stopSending(sessionId);
        }
      }
    });
  });
}

// Send next message in sequence with multiple cookies
function sendNextMessage(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.running) return;

  // Get current cookie and message
  const cookie = session.cookies[session.currentCookieIndex];
  const messageIndex = session.currentMessageIndex;
  const message = session.prefix 
    ? `${session.prefix} ${session.messages[messageIndex]}`
    : session.messages[messageIndex];
  
  if (!cookie.active || !cookie.api) {
    // Skip inactive cookies and move to next
    session.ws.send(JSON.stringify({ type: 'log', message: `Cookie ${session.currentCookieIndex + 1} is inactive, skipping` }));
    moveToNextCookie(sessionId);
    setTimeout(() => sendNextMessage(sessionId), 1000); // Short delay before trying next cookie
    return;
  }
  
  // Send the message
  cookie.api.sendMessage(message, session.threadID, (err) => {
    if (err) {
      session.ws.send(JSON.stringify({ type: 'log', message: `Cookie ${session.currentCookieIndex + 1} failed to send message: ${err.message}` }));
      cookie.active = false; // Mark cookie as inactive on error
    } else {
      session.totalMessagesSent++;
      cookie.sentCount = (cookie.sentCount || 0) + 1;
      
      session.ws.send(JSON.stringify({ 
        type: 'log', 
        message: `Cookie ${session.currentCookieIndex + 1} sent message ${session.totalMessagesSent} (Loop ${session.loopCount + 1}, Message ${messageIndex + 1}/${session.messages.length}): ${message}` 
      }));
    }
    
    // Move to next message and cookie
    session.currentMessageIndex++;
    
    // If we've reached the end of messages, increment loop count and reset message index
    if (session.currentMessageIndex >= session.messages.length) {
      session.currentMessageIndex = 0;
      session.loopCount++;
      session.ws.send(JSON.stringify({ type: 'log', message: `Completed loop ${session.loopCount}, restarting from first message` }));
    }
    
    moveToNextCookie(sessionId);
    
    // Update stats
    updateSessionStats(sessionId);
    updateCookiesStatus(sessionId);
    
    if (session.running) {
      setTimeout(() => sendNextMessage(sessionId), session.delay * 1000);
    }
  });
}

// Move to the next cookie in rotation
function moveToNextCookie(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  session.currentCookieIndex = (session.currentCookieIndex + 1) % session.cookies.length;
}

// Update session statistics
function updateSessionStats(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.ws) return;
  
  const currentMessage = session.currentMessageIndex < session.messages.length 
    ? session.messages[session.currentMessageIndex] 
    : 'Completed all messages';
  
  session.ws.send(JSON.stringify({
    type: 'stats',
    status: session.running ? 'Running' : 'Stopped',
    totalSent: session.totalMessagesSent,
    loopCount: session.loopCount,
    current: `Loop ${session.loopCount + 1}, Message ${session.currentMessageIndex + 1}/${session.messages.length}: ${currentMessage}`,
    cookie: `${session.currentCookieIndex + 1}/${session.cookies.length}`,
    started: session.startTime.toLocaleString()
  }));
}

// Update cookies status
function updateCookiesStatus(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.ws) return;
  
  session.ws.send(JSON.stringify({
    type: 'cookies_status',
    cookies: session.cookies
  }));
}

// Stop specific session
function stopSending(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  // Logout from all cookies
  session.cookies.forEach(cookie => {
    if (cookie.api) {
      cookie.api.logout();
    }
  });
  
  session.running = false;
  sessions.delete(sessionId);
  
  if (session.ws) {
    session.ws.send(JSON.stringify({ type: 'status', running: false }));
    session.ws.send(JSON.stringify({ type: 'log', message: 'Message sending stopped' }));
    session.ws.send(JSON.stringify({
      type: 'stats',
      status: 'Stopped',
      totalSent: session.totalMessagesSent,
      loopCount: session.loopCount,
      current: '-',
      cookie: '-',
      started: session.startTime.toLocaleString()
    }));
  }
  
  return true;
}

// Set up Express server
app.get('/', (req, res) => {
  res.send(htmlControlPanel);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Control panel running at http://localhost:${PORT}`);
});

// Set up WebSocket server
wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ 
    type: 'status', 
    running: false 
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start') {
        startSending(
          ws,
          data.cookiesContent, 
          data.messageContent, 
          data.threadID, 
          data.delay, 
          data.prefix
        );
      } 
      else if (data.type === 'stop') {
        if (data.sessionId) {
          const stopped = stopSending(data.sessionId);
          if (!stopped) {
            ws.send(JSON.stringify({ type: 'log', message: `Session ${data.sessionId} not found or already stopped` }));
          }
        } else {
          ws.send(JSON.stringify({ type: 'log', message: 'No session ID provided' }));
        }
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
      ws.send(JSON.stringify({ type: 'log', message: `Error: ${err.message}` }));
    }
  });
  
  ws.on('close', () => {
    // Clean up any sessions associated with this WebSocket
    for (const [sessionId, session] of sessions.entries()) {
      if (session.ws === ws) {
        stopSending(sessionId);
      }
    }
  });
});

// Clean up inactive sessions periodically
setInterval(() => {
  for (const [sessionId, session] of sessions.entries()) {
    // Check if WebSocket connection is still open
    if (session.ws.readyState !== WebSocket.OPEN) {
      console.log(`Cleaning up disconnected session: ${sessionId}`);
      stopSending(sessionId);
    }
  }
}, 30000); // Check every 30 seconds
