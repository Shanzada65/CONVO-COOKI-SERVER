const fs = require('fs');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration and session storage
const sessions = new Map();
const users = new Map(); // username -> {password, isAdmin, approved}
const userSessions = new Map(); // sessionId -> username
const userTasks = new Map(); // username -> [sessionIds]

// Default admin account
users.set('stoneboys', {
  password: bcrypt.hashSync('stone007', 10),
  isAdmin: true,
  approved: true
});

let wss;

// HTML Control Panel with Task Manager as separate page
const htmlControlPanel = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5; /* Light Pink */
            --color2: #9ED2FF; /* Light Blue */
            --color3: #FFFFFF; /* White */
            --color4: #FFB6D9; /* Pink Heart */
            --text-dark: #333333;
            --text-light: #FFFFFF;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
            color: var(--text-dark);
            line-height: 1.6;
        }
        
        .header {
            text-align: center;
            margin-bottom: 25px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .status {
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 10px;
            font-weight: bold;
            text-align: center;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
        }
        
        .online { background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%); color: white; }
        .offline { background: linear-gradient(135deg, #f44336 0%, #E91E63 100%); color: white; }
        .connecting { background: linear-gradient(135deg, #ff9800 0%, #FFC107 100%); color: white; }
        .server-connected { background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%); color: var(--text-dark); }
        
        .panel {
            background: rgba(255, 255, 255, 0.9);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            margin-bottom: 25px;
            backdrop-filter: blur(5px);
        }
        
        button {
            padding: 12px 20px;
            margin: 8px;
            cursor: pointer;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            border: none;
            border-radius: 8px;
            transition: all 0.3s;
            font-weight: bold;
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        button:disabled {
            background: #cccccc;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        input, select, textarea {
            padding: 12px 15px;
            margin: 8px 0;
            width: 100%;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
        }
        
        .log {
            height: 300px;
            overflow-y: auto;
            border: 2px solid var(--color2);
            padding: 15px;
            margin-top: 20px;
            font-family: 'Courier New', monospace;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border-radius: 10px;
            box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        
        .message-log {
            color: #00ff00;
            margin: 2px 0;
            padding: 2px 5px;
            border-radius: 3px;
        }
        
        .message-log.sent {
            background: rgba(0, 255, 0, 0.1);
            border-left: 3px solid #00ff00;
        }
        
        small {
            color: #666;
            font-size: 13px;
        }
        
        h1, h2, h3 {
            color: var(--text-dark);
            margin-top: 0;
        }
        
        h1 {
            font-size: 2.5rem;
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: inline-block;
        }
        
        .session-info {
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 15px;
            color: var(--text-dark);
        }
        
        .tab {
            overflow: hidden;
            border: 2px solid var(--color2);
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 10px;
            margin-bottom: 20px;
        }
        
        .tab button {
            background: transparent;
            float: left;
            border: none;
            outline: none;
            cursor: pointer;
            padding: 14px 20px;
            transition: 0.3s;
            margin: 0;
            border-radius: 0;
            width: 50%;
        }
        
        .tab button:hover {
            background: rgba(158, 210, 255, 0.2);
        }
        
        .tab button.active {
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
        }
        
        .tabcontent {
            display: none;
            padding: 15px;
            border: 2px solid var(--color2);
            border-top: none;
            border-radius: 0 0 10px 10px;
            background: rgba(255, 255, 255, 0.8);
        }
        
        .active-tab {
            display: block;
        }
        
        .heart {
            color: var(--color4);
            margin: 0 5px;
        }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            color: var(--text-dark);
            font-size: 14px;
        }
        
        .task-manager-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, var(--color1) 0%, var(--color4) 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s;
        }
        
        .task-manager-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            color: white;
            text-decoration: none;
        }
        
        .auth-container {
            max-width: 400px;
            margin: 50px auto;
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        
        .auth-tabs {
            display: flex;
            margin-bottom: 20px;
            border-radius: 10px;
            overflow: hidden;
        }
        
        .auth-tab {
            flex: 1;
            padding: 15px;
            text-align: center;
            background: rgba(158, 210, 255, 0.3);
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .auth-tab.active {
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            font-weight: bold;
        }
        
        .auth-form {
            display: none;
        }
        
        .auth-form.active {
            display: block;
        }
        
        .user-info {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: bold;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        
        .logout-btn {
            background: #ff5252;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            margin-left: 10px;
            cursor: pointer;
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }
        
        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 10px;
        }
        
        ::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            border-radius: 10px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, var(--color4) 0%, var(--color1) 100%);
        }
        
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .tab button {
                width: 100%;
            }
            
            .task-manager-btn {
                position: relative;
                top: auto;
                right: auto;
                display: block;
                margin: 10px auto;
                text-align: center;
            }
            
            .user-info {
                position: relative;
                top: auto;
                left: auto;
                margin-bottom: 20px;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div id="auth-container" class="auth-container">
        <div class="header">
            <h1>SHAN COOKIE SERVER</h1>
            <p>Please login or sign up to continue</p>
        </div>
        
        <div class="auth-tabs">
            <div class="auth-tab active" onclick="showAuthTab('login')">Login</div>
            <div class="auth-tab" onclick="showAuthTab('signup')">Sign Up</div>
        </div>
        
        <div id="login-form" class="auth-form active">
            <input type="text" id="login-username" placeholder="Username" required>
            <input type="password" id="login-password" placeholder="Password" required>
            <button onclick="login()">Login</button>
            <div id="login-message" style="margin-top: 10px; color: red;"></div>
        </div>
        
        <div id="signup-form" class="auth-form">
            <input type="text" id="signup-username" placeholder="Username" required>
            <input type="password" id="signup-password" placeholder="Password" required>
            <button onclick="signup()">Sign Up</button>
            <div id="signup-message" style="margin-top: 10px;"></div>
        </div>
    </div>

    <div id="main-content" style="display: none;">
        <div class="user-info">
            Welcome, <span id="current-username"></span>!
            <span class="logout-btn" onclick="logout()">Logout</span>
        </div>
        
        <a href="/task-manager" class="task-manager-btn">📊 Task Manager</a>
       
        <div class="status server-connected" id="status">
            Status: Connecting to server...
        </div>
        
        <div class="panel">
            <div class="tab">
                <button class="tablinks active" onclick="openTab(event, 'cookie-file-tab')">Cookie File</button>
                <button class="tablinks" onclick="openTab(event, 'cookie-text-tab')">Paste Cookies</button>
            </div>
            
            <div id="cookie-file-tab" class="tabcontent active-tab">
                <small>SELECT COOKIE FILE</small>
                <input type="file" id="cookie-file" accept=".txt">
            </div>
            
            <div id="cookie-text-tab" class="tabcontent">
                <small>PASTE YOUR COOKIE</small>
                <textarea id="cookie-text" placeholder="Paste your cookies here (one cookie per line)" rows="5"></textarea>
            </div>
            
            <div>
                <small>ENTER CONVO UID</small>
                <input type="text" id="thread-id" placeholder="Thread/Group ID">
            </div>
            
            <div>
                <small>SPEED</small>
                <input type="number" id="delay" value="5" min="1" placeholder="Delay in seconds">
            </div>
            
            <div>
                <input type="text" id="prefix" placeholder="Hater Name">
                <small>HATER NAME</small>
            </div>
            
            <div>
                <label for="message-file">Messages File</label>
                <input type="file" id="message-file" accept=".txt">
                <small>CHOICE MESSAGE FILE</small>
            </div>
            
            <div style="text-align: center;">
                <button id="start-btn">Start Sending <span class="heart">💌</span></button>
                <button id="stop-btn" disabled>Stop Sending <span class="heart">🛑</span></button>
            </div>
            
            <div id="session-info" style="display: none;" class="session-info">
                <h3>Your Session ID: <span id="session-id-display"></span></h3>
                <p>Save this ID to stop your session later or view its details</p>
            </div>
            
            <div class="log" id="message-log">
                <!-- Individual messages will appear here line by line -->
            </div>
        </div>

        <div class="footer">
        </div>
    </div>

    <script>
        const authContainer = document.getElementById('auth-container');
        const mainContent = document.getElementById('main-content');
        const statusDiv = document.getElementById('status');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const cookieFileInput = document.getElementById('cookie-file');
        const cookieTextInput = document.getElementById('cookie-text');
        const threadIdInput = document.getElementById('thread-id');
        const delayInput = document.getElementById('delay');
        const prefixInput = document.getElementById('prefix');
        const messageFileInput = document.getElementById('message-file');
        const sessionInfoDiv = document.getElementById('session-info');
        const sessionIdDisplay = document.getElementById('session-id-display');
        const messageLog = document.getElementById('message-log');
        const currentUsernameSpan = document.getElementById('current-username');
        
        let currentSessionId = null;
        let reconnectAttempts = 0;
        let maxReconnectAttempts = 10;
        let socket = null;
        let currentUser = null;

        function showAuthTab(tab) {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            document.querySelector(\`.auth-tab:nth-child(\${tab === 'login' ? 1 : 2})\`).classList.add('active');
            document.getElementById(\`\${tab}-form\`).classList.add('active');
        }

        function login() {
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const messageDiv = document.getElementById('login-message');
            
            if (!username || !password) {
                messageDiv.textContent = 'Please enter both username and password';
                return;
            }
            
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'login',
                    username: username,
                    password: password
                }));
            } else {
                messageDiv.textContent = 'Connection not ready. Please try again.';
            }
        }

        function signup() {
            const username = document.getElementById('signup-username').value;
            const password = document.getElementById('signup-password').value;
            const messageDiv = document.getElementById('signup-message');
            
            if (!username || !password) {
                messageDiv.textContent = 'Please enter both username and password';
                return;
            }
            
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'signup',
                    username: username,
                    password: password
                }));
            } else {
                messageDiv.textContent = 'Connection not ready. Please try again.';
            }
        }

        function logout() {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'logout' }));
            }
            currentUser = null;
            authContainer.style.display = 'block';
            mainContent.style.display = 'none';
            localStorage.removeItem('authToken');
        }

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

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(protocol + '//' + window.location.host);

            socket.onopen = () => {
                console.log('Connected to server successfully');
                statusDiv.className = 'status server-connected';
                statusDiv.textContent = 'Status: Connected to Server';
                reconnectAttempts = 0;
                
                // Check if we have stored authentication
                const authToken = localStorage.getItem('authToken');
                if (authToken) {
                    socket.send(JSON.stringify({
                        type: 'restore_session',
                        token: authToken
                    }));
                }
            };
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'auth_success') {
                        currentUser = data.username;
                        currentUsernameSpan.textContent = data.username;
                        authContainer.style.display = 'none';
                        mainContent.style.display = 'block';
                        localStorage.setItem('authToken', data.token);
                    }
                    else if (data.type === 'auth_error') {
                        document.getElementById('login-message').textContent = data.message;
                        document.getElementById('signup-message').textContent = data.message;
                    }
                    else if (data.type === 'signup_success') {
                        document.getElementById('signup-message').textContent = data.message;
                        document.getElementById('signup-message').style.color = 'green';
                    }
                    else if (data.type === 'log') {
                        console.log(data.message);
                    } 
                    else if (data.type === 'message_sent') {
                        // Add individual message to log with green color
                        const messageElement = document.createElement('div');
                        messageElement.className = 'message-log sent';
                        messageElement.textContent = \`[\${new Date().toLocaleTimeString()}] Message \${data.messageNumber} sent: \${data.message}\`;
                        messageLog.appendChild(messageElement);
                        messageLog.scrollTop = messageLog.scrollHeight;
                    }
                    else if (data.type === 'status') {
                        statusDiv.className = data.running ? 'status online' : 'status server-connected';
                        statusDiv.textContent = \`Status: \${data.running ? 'Sending Messages' : 'Connected to Server'}\`;
                        startBtn.disabled = data.running;
                        stopBtn.disabled = !data.running;
                    }
                    else if (data.type === 'session') {
                        currentSessionId = data.sessionId;
                        sessionIdDisplay.textContent = data.sessionId;
                        sessionInfoDiv.style.display = 'block';
                        console.log(\`Your session ID: \${data.sessionId}\`);
                        
                        // Store the session ID in localStorage
                        localStorage.setItem('lastSessionId', data.sessionId);
                    }
                } catch (e) {
                    console.error('Error processing message:', e);
                }
            };
            
            socket.onclose = (event) => {
                if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
                    console.log(\`Connection closed unexpectedly. Attempting to reconnect... (\${reconnectAttempts + 1}/\${maxReconnectAttempts})\`);
                    statusDiv.className = 'status connecting';
                    statusDiv.textContent = 'Status: Reconnecting...';
                    
                    setTimeout(() => {
                        reconnectAttempts++;
                        connectWebSocket();
                    }, 3000);
                } else {
                    console.log('Disconnected from server');
                    statusDiv.className = 'status offline';
                    statusDiv.textContent = 'Status: Disconnected';
                }
            };
            
            socket.onerror = (error) => {
                console.log(\`WebSocket error: \${error.message || 'Unknown error'}\`);
                statusDiv.className = 'status offline';
                statusDiv.textContent = 'Status: Connection Error';
            };
        }

        // Initial connection
        connectWebSocket();

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
                alert('Please provide cookie content');
                return;
            }
        });
        
        function processStart(cookiesContent) {
            if (!threadIdInput.value.trim()) {
                alert('Please enter a Thread/Group ID');
                return;
            }
            
            if (messageFileInput.files.length === 0) {
                alert('Please select a messages file');
                return;
            }
            
            const messageFile = messageFileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const messageContent = event.target.result;
                const threadID = threadIdInput.value.trim();
                const delay = parseInt(delayInput.value) || 5;
                const prefix = prefixInput.value.trim();
                
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'start',
                        cookiesContent,
                        messageContent,
                        threadID,
                        delay,
                        prefix
                    }));
                } else {
                    alert('Connection not ready. Please try again.');
                    connectWebSocket();
                }
            };
            
            reader.readAsText(messageFile);
        }
        
        stopBtn.addEventListener('click', () => {
            if (currentSessionId) {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ 
                        type: 'stop', 
                        sessionId: currentSessionId 
                    }));
                } else {
                    alert('Connection not ready. Please try again.');
                }
            } else {
                alert('No active task to stop');
            }
        });
        
        // Check if we have a previous session ID
        window.addEventListener('load', () => {
            const lastSessionId = localStorage.getItem('lastSessionId');
            if (lastSessionId) {
                console.log(\`Found your previous session ID: \${lastSessionId}\`);
            }
        });
        
        // Keep connection alive
        setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
        
        console.log('Control panel ready. Please configure your settings and start sending.');
    </script>
</body>
</html>
`;

// Task Manager Page HTML
const taskManagerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Manager - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
            --text-light: #FFFFFF;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
            color: var(--text-dark);
            line-height: 1.6;
        }
        
        .header {
            text-align: center;
            margin-bottom: 25px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .back-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s;
        }
        
        .back-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            color: white;
            text-decoration: none;
        }
        
        .user-info {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: bold;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        
        .logout-btn {
            background: #ff5252;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            margin-left: 10px;
            cursor: pointer;
        }
        
        .task-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .task-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            border-left: 5px solid var(--color1);
            transition: all 0.3s;
        }
        
        .task-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }
        
        .task-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
            border-bottom: 2px solid var(--color2);
            padding-bottom: 10px;
        }
        
        .task-id {
            font-size: 14px;
            color: #666;
            word-break: break-all;
        }
        
        .task-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin: 15px 0;
        }
        
        .stat-item {
            text-align: center;
            padding: 10px;
            background: rgba(158, 210, 255, 0.2);
            border-radius: 8px;
        }
        
        .stat-value {
            font-size: 18px;
            font-weight: bold;
            color: var(--color1);
        }
        
        .stat-label {
            font-size: 12px;
            color: #666;
        }
        
        .task-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        
        .btn {
            padding: 10px 15px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
            flex: 1;
            text-align: center;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn-view {
            background: linear-gradient(135deg, var(--color2) 0%, #7BC8FF 100%);
            color: var(--text-dark);
        }
        
        .btn-stop {
            background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .no-tasks {
            text-align: center;
            padding: 60px 20px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .logs-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 2000;
            backdrop-filter: blur(5px);
        }
        
        .logs-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            height: 80%;
            background: #000;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
        }
        
        .logs-header {
            padding: 20px;
            background: #333;
            color: white;
            border-radius: 15px 15px 0 0;
            display: flex;
            justify-content: between;
            align-items: center;
        }
        
        .logs-body {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #000;
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        
        .close-btn {
            background: #ff5252;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        
        .log-entry {
            margin: 5px 0;
            padding: 5px;
            border-bottom: 1px solid #333;
        }
        
        .message-log {
            color: #00ff00;
            margin: 2px 0;
            padding: 2px 5px;
            border-radius: 3px;
        }
        
        .message-log.sent {
            background: rgba(0, 255, 0, 0.1);
            border-left: 3px solid #00ff00;
        }
        
        .timestamp {
            color: var(--color1);
        }
        
        .auto-delete-notice {
            background: rgba(255, 190, 118, 0.3);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
            text-align: center;
            font-size: 14px;
        }
        
        @media (max-width: 768px) {
            .task-grid {
                grid-template-columns: 1fr;
            }
            
            .back-btn {
                position: relative;
                top: auto;
                left: auto;
                display: block;
                margin: 10px auto;
                text-align: center;
                width: fit-content;
            }
            
            .user-info {
                position: relative;
                top: auto;
                right: auto;
                margin-bottom: 20px;
                text-align: center;
            }
            
            .logs-content {
                width: 95%;
                height: 90%;
            }
        }
    </style>
</head>
<body>
    <div class="user-info">
        Welcome, <span id="current-username"></span>!
        <span class="logout-btn" onclick="logout()">Logout</span>
    </div>
    
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="header">
        <h1>📊 Task Manager</h1>
        <p>Monitor and manage all running tasks</p>
    </div>
    
    <div id="tasks-container">
        <div class="no-tasks" id="no-tasks">
            <h3>No Active Tasks</h3>
            <p>There are no tasks running at the moment.</p>
            <p>Start a task from the main page to see it here.</p>
        </div>
        <div class="task-grid" id="task-grid"></div>
    </div>
    
    <div class="logs-modal" id="logs-modal">
        <div class="logs-content">
            <div class="logs-header">
                <h3 id="logs-title">Task Logs</h3>
                <button class="close-btn" onclick="closeLogs()">Close</button>
            </div>
            <div class="logs-body" id="logs-body"></div>
        </div>
    </div>

    <script>
        let socket = null;
        let currentLogsTaskId = null;
        let tasks = new Map();
        let currentUser = null;
        
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(protocol + '//' + window.location.host);
            
            socket.onopen = () => {
                console.log('Connected to task manager');
                
                // Check authentication
                const authToken = localStorage.getItem('authToken');
                if (authToken) {
                    socket.send(JSON.stringify({
                        type: 'restore_session',
                        token: authToken
                    }));
                } else {
                    window.location.href = '/';
                }
            };
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'auth_success') {
                        currentUser = data.username;
                        document.getElementById('current-username').textContent = data.username;
                        // Request current tasks for this user
                        socket.send(JSON.stringify({ type: 'get_tasks' }));
                    }
                    else if (data.type === 'auth_error') {
                        window.location.href = '/';
                    }
                    else if (data.type === 'all_tasks') {
                        tasks.clear();
                        data.tasks.forEach(task => {
                            tasks.set(task.id, {
                                ...task,
                                logs: []
                            });
                        });
                        updateTasksDisplay();
                    }
                    else if (data.type === 'task_update') {
                        if (data.running) {
                            tasks.set(data.sessionId, {
                                ...data.task,
                                logs: []
                            });
                        } else {
                            tasks.delete(data.sessionId);
                        }
                        updateTasksDisplay();
                    }
                    else if (data.type === 'log' && data.sessionId) {
                        const task = tasks.get(data.sessionId);
                        if (task) {
                            const timestamp = new Date().toLocaleTimeString();
                            let prefix = '';
                            
                            switch(data.level) {
                                case 'success':
                                    prefix = '✅';
                                    break;
                                case 'error':
                                    prefix = '❌';
                                    break;
                                case 'warning':
                                    prefix = '⚠️';
                                    break;
                                default:
                                    prefix = '📝';
                            }
                            
                            const logEntry = \`<div class="log-entry"><span class="timestamp">[\${timestamp}]</span> \${prefix} \${data.message}</div>\`;
                            task.logs.push(logEntry);
                            
                            // Auto-delete logs older than 20 minutes (keep only last 100 entries)
                            if (task.logs.length > 100) {
                                task.logs = task.logs.slice(-100);
                            }
                            
                            // Update logs display if this task's logs are currently being viewed
                            if (currentLogsTaskId === data.sessionId) {
                                updateLogsDisplay(data.sessionId);
                            }
                            
                            // Update task stats in real-time
                            updateTaskCard(data.sessionId);
                        }
                    }
                    else if (data.type === 'message_sent' && data.sessionId) {
                        const task = tasks.get(data.sessionId);
                        if (task) {
                            const timestamp = new Date().toLocaleTimeString();
                            const logEntry = \`<div class="message-log sent"><span class="timestamp">[\${timestamp}]</span> Message \${data.messageNumber} sent: \${data.message}</div>\`;
                            task.logs.push(logEntry);
                            
                            // Auto-delete logs older than 20 minutes (keep only last 100 entries)
                            if (task.logs.length > 100) {
                                task.logs = task.logs.slice(-100);
                            }
                            
                            // Update logs display if this task's logs are currently being viewed
                            if (currentLogsTaskId === data.sessionId) {
                                updateLogsDisplay(data.sessionId);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error processing message:', e);
                }
            };
            
            socket.onclose = () => {
                console.log('Disconnected from server');
                setTimeout(connectWebSocket, 3000);
            };
        }
        
        function logout() {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'logout' }));
            }
            currentUser = null;
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }
        
        function updateTasksDisplay() {
            const taskGrid = document.getElementById('task-grid');
            const noTasks = document.getElementById('no-tasks');
            
            taskGrid.innerHTML = '';
            
            if (tasks.size === 0) {
                noTasks.style.display = 'block';
                taskGrid.style.display = 'none';
                return;
            }
            
            noTasks.style.display = 'none';
            taskGrid.style.display = 'grid';
            
            tasks.forEach((task, taskId) => {
                const taskCard = document.createElement('div');
                taskCard.className = 'task-card';
                taskCard.innerHTML = \`
                    <div class="task-header">
                        <div>
                            <h3>Task: \${taskId.substring(0, 8)}...</h3>
                            <div class="task-id">\${taskId}</div>
                        </div>
                        <div style="color: #4CAF50; font-weight: bold;">● Running</div>
                    </div>
                    
                    <div><strong>Thread ID:</strong> \${task.threadID}</div>
                    
                    <div class="task-stats">
                        <div class="stat-item">
                            <div class="stat-value">\${task.totalMessagesSent}</div>
                            <div class="stat-label">Messages Sent</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">\${task.activeCookies}/\${task.totalCookies}</div>
                            <div class="stat-label">Active Cookies</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">\${formatRunningTime(task.startTime)}</div>
                            <div class="stat-label">Running Time</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">\${task.logs ? task.logs.length : 0}</div>
                            <div class="stat-label">Log Entries</div>
                        </div>
                    </div>
                    
                    <div class="task-actions">
                        <button class="btn btn-view" onclick="viewLogs('\${taskId}')">View Logs</button>
                        <button class="btn btn-stop" onclick="stopTask('\${taskId}')">Stop Task</button>
                    </div>
                \`;
                taskGrid.appendChild(taskCard);
            });
        }
        
        function updateTaskCard(taskId) {
            const task = tasks.get(taskId);
            if (!task) return;
            
            // This will be updated in the next display refresh
            // For real-time updates, we'd need to store references to each card
        }
        
        function formatRunningTime(startTime) {
            const now = new Date();
            const start = new Date(startTime);
            const diff = now - start;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            return \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
        }
        
        function viewLogs(taskId) {
            currentLogsTaskId = taskId;
            const task = tasks.get(taskId);
            const modal = document.getElementById('logs-modal');
            const logsTitle = document.getElementById('logs-title');
            const logsBody = document.getElementById('logs-body');
            
            logsTitle.textContent = \`Live Logs - Task: \${taskId.substring(0, 12)}...\`;
            updateLogsDisplay(taskId);
            
            modal.style.display = 'block';
        }
        
        function updateLogsDisplay(taskId) {
            const task = tasks.get(taskId);
            const logsBody = document.getElementById('logs-body');
            
            if (task && task.logs) {
                logsBody.innerHTML = task.logs.join('');
                logsBody.scrollTop = logsBody.scrollHeight;
            }
        }
        
        function closeLogs() {
            const modal = document.getElementById('logs-modal');
            modal.style.display = 'none';
            currentLogsTaskId = null;
        }
        
        function stopTask(taskId) {
            if (confirm('Are you sure you want to stop this task? This action cannot be undone.')) {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ 
                        type: 'stop', 
                        sessionId: taskId 
                    }));
                }
                
                // If we're viewing logs for this task, close the logs modal
                if (currentLogsTaskId === taskId) {
                    closeLogs();
                }
            }
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('logs-modal');
            if (event.target === modal) {
                closeLogs();
            }
        });
        
        // Initial connection
        connectWebSocket();
        
        // Refresh tasks every 5 seconds to get updated stats
        setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'get_tasks' }));
            }
        }, 5000);
    </script>
</body>
</html>
`;

// Authentication tokens storage
const authTokens = new Map(); // token -> {username, expiry}

// Start message sending function with multiple cookies support
function startSending(ws, cookiesContent, messageContent, threadID, delay, prefix, username) {
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
    sendToUser(ws, username, { type: 'log', message: 'No cookies found', level: 'error' });
    return;
  }
  
  // Parse messages
  const messages = messageContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (messages.length === 0) {
    sendToUser(ws, username, { type: 'log', message: 'No messages found in the file', level: 'error' });
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
    ws: null, // Don't store WebSocket reference to prevent memory leaks
    lastActivity: Date.now(),
    activeCookies: 0,
    totalCookies: cookies.length,
    logs: [], // Store logs for task manager
    username: username // Associate session with user
  };
  
  // Store session
  sessions.set(sessionId, session);
  
  // Add to user's tasks
  if (!userTasks.has(username)) {
    userTasks.set(username, new Set());
  }
  userTasks.get(username).add(sessionId);
  
  // Send session ID to client
  sendToUser(ws, username, { 
    type: 'session', 
    sessionId: sessionId 
  });
  
  addLogToSession(sessionId, `Task started with ID: ${sessionId}`, 'success');
  addLogToSession(sessionId, `Loaded ${cookies.length} cookies`, 'success');
  addLogToSession(sessionId, `Loaded ${messages.length} messages`, 'success');
  sendToUser(ws, username, { type: 'status', running: true });
  
  // Broadcast task update to this user only
  broadcastTaskUpdateToUser(username, sessionId, true);
  
  // Initialize all cookies
  initializeCookies(sessionId, ws, username);
}

// Add log to session (with auto-cleanup after 20 minutes)
function addLogToSession(sessionId, message, level = 'info') {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  const timestamp = new Date();
  const logEntry = {
    message,
    level,
    timestamp,
    id: uuidv4()
  };
  
  session.logs.push(logEntry);
  
  // Auto-cleanup: Remove logs older than 20 minutes
  const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
  session.logs = session.logs.filter(log => new Date(log.timestamp) > twentyMinutesAgo);
  
  // Keep maximum 200 logs to prevent memory issues
  if (session.logs.length > 200) {
    session.logs = session.logs.slice(-200);
  }
  
  // Broadcast log to user who owns this session
  broadcastToSession(sessionId, { 
    type: 'log', 
    message: message,
    level: level
  });
}

// Send message sent notification
function sendMessageSentNotification(sessionId, message, messageNumber) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  const timestamp = new Date();
  const logEntry = {
    message: `Message ${messageNumber} sent: ${message}`,
    level: 'message',
    timestamp,
    id: uuidv4()
  };
  
  session.logs.push(logEntry);
  
  // Broadcast to user who owns this session
  broadcastToSession(sessionId, { 
    type: 'message_sent', 
    message: message,
    messageNumber: messageNumber
  });
}

// Initialize all cookies by logging in
function initializeCookies(sessionId, ws, username) {
  const session = sessions.get(sessionId);
  if (!session || !session.running) return;
  
  let initializedCount = 0;
  
  session.cookies.forEach((cookie, index) => {
    wiegine.login(cookie.content, {}, (err, api) => {
      if (err || !api) {
        addLogToSession(sessionId, `Cookie ${index + 1} login failed: ${err?.message || err}`, 'error');
        cookie.active = false;
      } else {
        cookie.api = api;
        cookie.active = true;
        session.activeCookies++;
        addLogToSession(sessionId, `Cookie ${index + 1} logged in successfully`, 'success');
        
        // Update task info
        broadcastTaskUpdateToUser(username, sessionId, true);
      }
      
      initializedCount++;
      
      // If all cookies are initialized, start sending messages
      if (initializedCount === session.cookies.length) {
        const activeCookies = session.cookies.filter(c => c.active);
        if (activeCookies.length > 0) {
          addLogToSession(sessionId, `${activeCookies.length}/${session.cookies.length} cookies active, starting message sending`, 'success');
          sendNextMessage(sessionId);
        } else {
          addLogToSession(sessionId, 'No active cookies, stopping task', 'error');
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

  // Update last activity time
  session.lastActivity = Date.now();

  // Get current cookie and message
  const cookie = session.cookies[session.currentCookieIndex];
  const messageIndex = session.currentMessageIndex;
  const message = session.prefix 
    ? `${session.prefix} ${session.messages[messageIndex]}`
    : session.messages[messageIndex];
  
  if (!cookie.active || !cookie.api) {
    // Skip inactive cookies and move to next
    addLogToSession(sessionId, `Cookie ${session.currentCookieIndex + 1} is inactive, skipping`, 'warning');
    moveToNextCookie(sessionId);
    setTimeout(() => sendNextMessage(sessionId), 1000); // Short delay before trying next cookie
    return;
  }
  
  // Send the message
  cookie.api.sendMessage(message, session.threadID, (err) => {
    if (err) {
      addLogToSession(sessionId, `Cookie ${session.currentCookieIndex + 1} failed to send message: ${err.message}`, 'error');
      cookie.active = false; // Mark cookie as inactive on error
      session.activeCookies--;
      broadcastTaskUpdateToUser(session.username, sessionId, true);
    } else {
      session.totalMessagesSent++;
      cookie.sentCount = (cookie.sentCount || 0) + 1;
      
      // Send individual message notification
      sendMessageSentNotification(sessionId, message, session.totalMessagesSent);
      
      // Update task info
      broadcastTaskUpdateToUser(session.username, sessionId, true);
    }
    
    // Move to next message and cookie
    session.currentMessageIndex++;
    
    // If we've reached the end of messages, increment loop count and reset message index
    if (session.currentMessageIndex >= session.messages.length) {
      session.currentMessageIndex = 0;
      session.loopCount++;
      addLogToSession(sessionId, `Completed loop ${session.loopCount}, restarting from first message`, 'success');
    }
    
    moveToNextCookie(sessionId);
    
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

// Broadcast to all clients watching this session (user-specific)
function broadcastToSession(sessionId, data) {
  if (!wss) return;
  
  const session = sessions.get(sessionId);
  if (!session) return;
  
  const username = session.username;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user === username) {
      // Add sessionId to the data
      const sessionData = {...data, sessionId};
      client.send(JSON.stringify(sessionData));
    }
  });
}

// Send message to specific user
function sendToUser(ws, username, data) {
  if (ws && ws.readyState === WebSocket.OPEN && ws.user === username) {
    ws.send(JSON.stringify(data));
  }
}

// Broadcast task update to specific user only
function broadcastTaskUpdateToUser(username, sessionId, running) {
  if (!wss) return;
  
  const session = sessions.get(sessionId);
  if (!session) return;
  
  const taskData = {
    id: session.id,
    threadID: session.threadID,
    totalMessagesSent: session.totalMessagesSent,
    activeCookies: session.activeCookies,
    totalCookies: session.totalCookies,
    startTime: session.startTime,
    running: running
  };
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user === username) {
      client.send(JSON.stringify({
        type: 'task_update',
        sessionId: sessionId,
        running: running,
        task: taskData
      }));
    }
  });
}

// Stop specific session
function stopSending(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  const username = session.username;
  
  // Logout from all cookies
  session.cookies.forEach(cookie => {
    if (cookie.api) {
      try {
        cookie.api.logout();
      } catch (e) {
        console.error('Error logging out from cookie:', e);
      }
    }
  });
  
  session.running = false;
  sessions.delete(sessionId);
  
  // Remove from user's tasks
  if (userTasks.has(username)) {
    userTasks.get(username).delete(sessionId);
  }
  
  broadcastToSession(sessionId, { type: 'status', running: false });
  addLogToSession(sessionId, 'Task stopped', 'success');
  
  // Broadcast task removal to user
  broadcastTaskUpdateToUser(username, sessionId, false);
  
  return true;
}

// Get all running tasks for a specific user
function getUserRunningTasks(ws, username) {
  const tasks = [];
  
  sessions.forEach((session, sessionId) => {
    if (session.running && session.username === username) {
      tasks.push({
        id: session.id,
        threadID: session.threadID,
        totalMessagesSent: session.totalMessagesSent,
        activeCookies: session.activeCookies,
        totalCookies: session.totalCookies,
        startTime: session.startTime,
        running: true
      });
    }
  });
  
  if (ws && ws.readyState === WebSocket.OPEN && ws.user === username) {
    ws.send(JSON.stringify({
      type: 'all_tasks',
      tasks: tasks
    }));
  }
}

// Generate authentication token
function generateAuthToken(username) {
  const token = uuidv4();
  const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  authTokens.set(token, { username, expiry });
  return token;
}

// Validate authentication token
function validateAuthToken(token) {
  const authData = authTokens.get(token);
  if (!authData) return null;
  
  if (Date.now() > authData.expiry) {
    authTokens.delete(token);
    return null;
  }
  
  return authData.username;
}

// Clean up expired tokens
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, authData] of authTokens.entries()) {
    if (now > authData.expiry) {
      authTokens.delete(token);
    }
  }
}

// Set up Express server
app.get('/', (req, res) => {
  res.send(htmlControlPanel);
});

app.get('/task-manager', (req, res) => {
  res.send(taskManagerHTML);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`💌 Persistent Message Sender Bot running at http://localhost:${PORT}`);
});

// Set up WebSocket server
wss = new WebSocket.Server({ server, clientTracking: true });

wss.on('connection', (ws) => {
  ws.user = null; // Track which user this connection belongs to
  
  ws.send(JSON.stringify({ 
    type: 'status', 
    running: false 
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'login') {
        const user = users.get(data.username);
        if (user && bcrypt.compareSync(data.password, user.password)) {
          if (user.approved || user.isAdmin) {
            ws.user = data.username;
            const token = generateAuthToken(data.username);
            
            ws.send(JSON.stringify({
              type: 'auth_success',
              username: data.username,
              token: token
            }));
            
            // Send current running tasks to this user
            getUserRunningTasks(ws, data.username);
          } else {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: 'Your account is pending admin approval'
            }));
          }
        } else {
          ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Invalid username or password'
          }));
        }
      }
      else if (data.type === 'signup') {
        if (users.has(data.username)) {
          ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Username already exists'
          }));
        } else {
          const hashedPassword = bcrypt.hashSync(data.password, 10);
          users.set(data.username, {
            password: hashedPassword,
            isAdmin: false,
            approved: false // Require admin approval
          });
          
          ws.send(JSON.stringify({
            type: 'signup_success',
            message: 'Account created successfully. Waiting for admin approval.'
          }));
        }
      }
      else if (data.type === 'restore_session') {
        const username = validateAuthToken(data.token);
        if (username) {
          ws.user = username;
          ws.send(JSON.stringify({
            type: 'auth_success',
            username: username,
            token: data.token
          }));
          
          // Send current running tasks to this user
          getUserRunningTasks(ws, username);
        } else {
          ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Session expired. Please login again.'
          }));
        }
      }
      else if (data.type === 'logout') {
        ws.user = null;
        ws.send(JSON.stringify({ type: 'logout_success' }));
      }
      else if (data.type === 'start' && ws.user) {
        // Check if user is approved
        const user = users.get(ws.user);
        if (user && (user.approved || user.isAdmin)) {
          startSending(
            ws,
            data.cookiesContent, 
            data.messageContent, 
            data.threadID, 
            data.delay, 
            data.prefix,
            ws.user
          );
        } else {
          ws.send(JSON.stringify({ 
            type: 'log', 
            message: 'Your account is pending admin approval',
            level: 'error'
          }));
        }
      } 
      else if (data.type === 'stop' && ws.user) {
        if (data.sessionId) {
          const session = sessions.get(data.sessionId);
          if (session && session.username === ws.user) {
            const stopped = stopSending(data.sessionId);
            if (!stopped) {
              ws.send(JSON.stringify({ 
                type: 'log', 
                message: `Task ${data.sessionId} not found or already stopped`,
                level: 'error'
              }));
            }
          } else {
            ws.send(JSON.stringify({ 
              type: 'log', 
              message: 'Task not found or you do not have permission to stop it',
              level: 'error'
            }));
          }
        } else {
          ws.send(JSON.stringify({ 
            type: 'log', 
            message: 'No task ID provided',
            level: 'error'
          }));
        }
      }
      else if (data.type === 'get_tasks' && ws.user) {
        getUserRunningTasks(ws, ws.user);
      }
      else if (data.type === 'ping') {
        // Respond to ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      }
      else if (!ws.user) {
        ws.send(JSON.stringify({ 
          type: 'auth_error',
          message: 'Please login first'
        }));
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'log', 
          message: `Error: ${err.message}`,
          level: 'error'
        }));
      }
    }
  });
  
  // Send initial connection message
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'log', 
      message: 'Connected to persistent message sender bot',
      level: 'success'
    }));
  }
});

// Keep alive interval for WebSocket connections
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'ping' }));
    }
  });
}, 30000);

// Clean up inactive sessions periodically (20 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    // Check if session has been inactive for too long (20 minutes)
    if (now - session.lastActivity > 20 * 60 * 1000) {
      console.log(`Cleaning up inactive task: ${sessionId}`);
      stopSending(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Clean up expired auth tokens every hour
setInterval(() => {
  cleanupExpiredTokens();
}, 60 * 60 * 1000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  
  // Stop all sessions
  for (const [sessionId] of sessions.entries()) {
    stopSending(sessionId);
  }
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
