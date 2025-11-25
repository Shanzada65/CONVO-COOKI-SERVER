const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Configuration storage
let config = {
    cookie: '',
    messages: [],
    speed: 1000,
    prefix: '',
    name: '',
    isRunning: false
};

// Load messages from file
function loadMessages(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const messages = data.split('\n').filter(line => line.trim());
        return messages;
    } catch (error) {
        console.error('Error loading messages file:', error);
        return [];
    }
}

// Facebook API function to send message
async function sendFacebookMessage(threadID, message) {
    try {
        const response = await axios.post('https://graph.facebook.com/v17.0/me/messages', {
            recipient: { id: threadID },
            message: { text: message }
        }, {
            headers: {
                'Authorization': `Bearer ${config.cookie}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Message sent to ${threadID}: ${message}`);
        return true;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        return false;
    }
}

// Main function to send messages
async function startMessaging(threadID) {
    if (!config.cookie) {
        console.error('Cookie not set');
        return;
    }

    if (config.messages.length === 0) {
        console.error('No messages loaded');
        return;
    }

    config.isRunning = true;
    let messageIndex = 0;

    while (config.isRunning && messageIndex < config.messages.length) {
        const message = config.messages[messageIndex];
        const formattedMessage = `${config.prefix} ${message}`.trim();
        
        const success = await sendFacebookMessage(threadID, formattedMessage);
        
        if (!success) {
            console.log('Failed to send message, stopping...');
            break;
        }
        
        messageIndex++;
        
        if (messageIndex < config.messages.length) {
            await new Promise(resolve => setTimeout(resolve, config.speed));
        }
    }
    
    config.isRunning = false;
    console.log('Messaging stopped');
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Facebook Messenger Bot Server'
    });
});

// Set cookie
app.post('/set-cookie', (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
        return res.status(400).json({ error: 'Cookie is required' });
    }
    
    config.cookie = cookie;
    res.json({ success: true, message: 'Cookie set successfully' });
});

// Load messages from file
app.post('/load-messages', (req, res) => {
    const { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }
    
    config.messages = loadMessages(filePath);
    res.json({ 
        success: true, 
        message: `Loaded ${config.messages.length} messages` 
    });
});

// Configure settings
app.post('/configure', (req, res) => {
    const { speed, prefix, name } = req.body;
    
    if (speed) config.speed = parseInt(speed);
    if (prefix) config.prefix = prefix;
    if (name) config.name = name;
    
    res.json({ 
        success: true, 
        config: {
            speed: config.speed,
            prefix: config.prefix,
            name: config.name,
            messageCount: config.messages.length
        }
    });
});

// Start messaging
app.post('/start', (req, res) => {
    const { threadID } = req.body;
    
    if (!threadID) {
        return res.status(400).json({ error: 'Thread ID is required' });
    }
    
    if (config.isRunning) {
        return res.status(400).json({ error: 'Messaging is already running' });
    }
    
    // Start in background
    startMessaging(threadID);
    
    res.json({ 
        success: true, 
        message: 'Messaging started',
        threadID: threadID,
        totalMessages: config.messages.length
    });
});

// Stop messaging
app.post('/stop', (req, res) => {
    config.isRunning = false;
    res.json({ success: true, message: 'Messaging stopped' });
});

// Get status
app.get('/status', (req, res) => {
    res.json({
        isRunning: config.isRunning,
        config: {
            speed: config.speed,
            prefix: config.prefix,
            name: config.name,
            messageCount: config.messages.length,
            hasCookie: !!config.cookie
        },
        serverTime: new Date().toISOString()
    });
});

// Root route - Server status page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CONVO-COOKIE-SERVER</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #333;
                    line-height: 1.6;
                    min-height: 100vh;
                    padding: 20px;
                }
                .container { 
                    max-width: 1000px; 
                    margin: 0 auto; 
                    background: white; 
                    padding: 40px; 
                    border-radius: 15px; 
                    box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    margin-bottom: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .header h1 { 
                    font-size: 2.5em; 
                    margin-bottom: 10px;
                }
                .status-box { 
                    background: #f8f9fa; 
                    padding: 25px; 
                    border-radius: 10px; 
                    margin: 25px 0; 
                    border-left: 5px solid #667eea;
                }
                .endpoint { 
                    background: #fff; 
                    padding: 20px; 
                    margin: 15px 0; 
                    border-radius: 8px; 
                    border: 1px solid #e1e5e9;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .endpoint:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                code { 
                    background: #e9ecef; 
                    padding: 3px 8px; 
                    border-radius: 4px; 
                    font-family: 'Courier New', monospace;
                    font-size: 0.9em;
                    color: #e83e8c;
                }
                .badge {
                    display: inline-block;
                    padding: 3px 8px;
                    background: #28a745;
                    color: white;
                    border-radius: 12px;
                    font-size: 0.8em;
                    margin-left: 10px;
                }
                .badge-warning { background: #ffc107; color: #000; }
                .form-group { margin: 15px 0; }
                input, textarea, button { 
                    width: 100%; 
                    padding: 12px; 
                    margin: 5px 0; 
                    border: 1px solid #ddd; 
                    border-radius: 5px; 
                    font-size: 16px;
                }
                button { 
                    background: #667eea; 
                    color: white; 
                    border: none; 
                    cursor: pointer; 
                    font-weight: bold;
                    transition: background 0.3s;
                }
                button:hover { background: #764ba2; }
                .tab { display: none; }
                .tab.active { display: block; }
                .tab-buttons { 
                    display: flex; 
                    margin-bottom: 20px; 
                    border-bottom: 1px solid #ddd;
                }
                .tab-button { 
                    padding: 12px 24px; 
                    background: none; 
                    border: none; 
                    cursor: pointer; 
                    border-bottom: 3px solid transparent;
                    width: auto;
                }
                .tab-button.active { 
                    border-bottom-color: #667eea; 
                    color: #667eea; 
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 CONVO-COOKIE-SERVER</h1>
                    <p>Facebook Messenger Automation Server</p>
                </div>
                
                <div class="status-box">
                    <h2>📊 Server Status</h2>
                    <div id="status">Loading server status...</div>
                </div>

                <div class="tab-buttons">
                    <button class="tab-button active" onclick="openTab('endpoints')">API Endpoints</button>
                    <button class="tab-button" onclick="openTab('control')">Control Panel</button>
                    <button class="tab-button" onclick="openTab('instructions')">Instructions</button>
                </div>

                <div id="endpoints" class="tab active">
                    <h2>🔧 API Endpoints</h2>
                    
                    <div class="endpoint">
                        <strong>GET /health</strong> <span class="badge">HEALTH</span>
                        <p>Check server health status</p>
                    </div>
                    
                    <div class="endpoint">
                        <strong>GET /status</strong> 
                        <p>Check bot status and configuration</p>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /set-cookie</strong> <span class="badge badge-warning">REQUIRED</span>
                        <p>Set Facebook authentication cookie</p>
                        <code>{"cookie": "your_facebook_cookie_here"}</code>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /load-messages</strong>
                        <p>Load messages from text file</p>
                        <code>{"filePath": "./messages.txt"}</code>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /configure</strong>
                        <p>Configure bot settings</p>
                        <code>{"speed": 1000, "prefix": "[BOT]", "name": "MyBot"}</code>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /start</strong> <span class="badge">ACTION</span>
                        <p>Start messaging</p>
                        <code>{"threadID": "facebook_group_thread_id"}</code>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /stop</strong> <span class="badge">ACTION</span>
                        <p>Stop messaging</p>
                    </div>
                </div>

                <div id="control" class="tab">
                    <h2>🎮 Control Panel</h2>
                    <div class="form-group">
                        <label>Facebook Cookie:</label>
                        <textarea id="cookieInput" placeholder="Paste your Facebook cookie here..." rows="3"></textarea>
                        <button onclick="setCookie()">Set Cookie</button>
                    </div>
                    
                    <div class="form-group">
                        <label>Thread ID:</label>
                        <input type="text" id="threadIdInput" placeholder="Enter Facebook group thread ID">
                    </div>
                    
                    <div class="form-group">
                        <label>Message Speed (ms):</label>
                        <input type="number" id="speedInput" value="1000" placeholder="Delay between messages">
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button style="background: #28a745;" onclick="startBot()">🚀 Start Bot</button>
                        <button style="background: #dc3545;" onclick="stopBot()">🛑 Stop Bot</button>
                    </div>
                </div>

                <div id="instructions" class="tab">
                    <h2>📖 Usage Instructions</h2>
                    <ol style="margin-left: 20px; margin-top: 15px;">
                        <li><strong>Set Cookie:</strong> First, set your Facebook cookie using the Control Panel or API</li>
                        <li><strong>Prepare Messages:</strong> Create a messages.txt file with one message per line</li>
                        <li><strong>Configure:</strong> Set message speed, prefix, and other settings</li>
                        <li><strong>Get Thread ID:</strong> Find your Facebook group's thread ID</li>
                        <li><strong>Start:</strong> Begin automated messaging</li>
                        <li><strong>Monitor:</strong> Use status endpoint to monitor progress</li>
                    </ol>
                    
                    <div class="status-box" style="margin-top: 20px;">
                        <h3>⚠️ Important Notes</h3>
                        <ul style="margin-left: 20px; margin-top: 10px;">
                            <li>Use responsibly and follow Facebook's Terms of Service</li>
                            <li>Respect rate limits to avoid account restrictions</li>
                            <li>Keep your cookie secure and private</li>
                            <li>Test with small groups first</li>
                        </ul>
                    </div>
                </div>
            </div>

            <script>
                function openTab(tabName) {
                    // Hide all tabs
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    // Show selected tab
                    document.getElementById(tabName).classList.add('active');
                    
                    // Update tab buttons
                    document.querySelectorAll('.tab-button').forEach(button => {
                        button.classList.remove('active');
                    });
                    event.currentTarget.classList.add('active');
                }

                // Load and display status
                function loadStatus() {
                    fetch('/status')
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('status').innerHTML = `
                                <p><strong>Bot Running:</strong> ${data.isRunning ? '✅ Yes' : '❌ No'}</p>
                                <p><strong>Messages Loaded:</strong> ${data.config.messageCount}</p>
                                <p><strong>Message Speed:</strong> ${data.config.speed}ms</p>
                                <p><strong>Message Prefix:</strong> ${data.config.prefix || 'None'}</p>
                                <p><strong>Cookie Configured:</strong> ${data.config.hasCookie ? '✅ Yes' : '❌ No'}</p>
                                <p><strong>Server Time:</strong> ${new Date(data.serverTime).toLocaleString()}</p>
                            `;
                        })
                        .catch(error => {
                            document.getElementById('status').innerHTML = '❌ Error loading status';
                        });
                }

                // Control functions
                function setCookie() {
                    const cookie = document.getElementById('cookieInput').value;
                    if (!cookie) {
                        alert('Please enter a cookie');
                        return;
                    }

                    fetch('/set-cookie', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cookie: cookie })
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message);
                        loadStatus();
                    })
                    .catch(error => {
                        alert('Error setting cookie');
                    console.error(error);
                    loadStatus();
                    });
                }

                function startBot() {
                    const threadID = document.getElementById('threadIdInput').value;
                    const speed = document.getElementById('speedInput').value;

                    if (!threadID) {
                        alert('Please enter a Thread ID');
                        return;
                    }

                    // Configure speed first
                    fetch('/configure', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ speed: parseInt(speed) })
                    })
                    .then(() => {
                        // Start bot
                        return fetch('/start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ threadID: threadID })
                        });
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message);
                        loadStatus();
                    })
                    .catch(error => {
                        alert('Error starting bot');
                        console.error(error);
                    });
                }

                function stopBot() {
                    fetch('/stop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message);
                        loadStatus();
                    })
                    .catch(error => {
                        alert('Error stopping bot');
                        console.error(error);
                    });
                }

                // Load status on page load
                loadStatus();
                // Refresh status every 5 seconds
                setInterval(loadStatus, 5000);
            </script>
        </body>
        </html>
    `);
});

// Handle 404 errors
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /',
            'GET /health',
            'GET /status',
            'POST /set-cookie',
            'POST /load-messages',
            'POST /configure',
            'POST /start', 
            'POST /stop'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 CONVO-COOKIE-SERVER running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🏠 Main interface: http://localhost:${PORT}/`);
});
