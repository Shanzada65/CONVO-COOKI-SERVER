const fs = require('fs');
const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const session = require('express-session');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration and session storage
const sessions = new Map();
const users = new Map(); // Simple in-memory user storage
const pendingApprovals = new Map(); // Pending user approvals
let wss;

// Admin credentials (change these in production)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Sample users (in production, use a database)
users.set(ADMIN_USERNAME, {
  username: ADMIN_USERNAME,
  password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
  role: 'admin',
  approved: true
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).send('Admin access required');
  }
}

function requireApproval(req, res, next) {
  if (req.session.user && (req.session.user.approved || req.session.user.role === 'admin')) {
    next();
  } else {
    res.redirect('/pending-approval');
  }
}

// ==================== NEON STYLED HTML PAGES ====================

// Neon CSS Base Styles
const neonStyles = `
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --neon-pink: #FF00FF;
            --neon-cyan: #00FFFF;
            --neon-green: #00FF00;
            --neon-purple: #8B00FF;
            --dark-bg: #0a0a0a;
            --text-light: #FFFFFF;
            --text-dark: #0a0a0a;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Rajdhani', sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a1a 50%, #0a0a1a 100%);
            color: var(--text-light);
            line-height: 1.6;
            position: relative;
            overflow-x: hidden;
        }
        
        /* Grid overlay effect */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(0, 255, 255, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 255, 255, 0.05) 1px, transparent 1px);
            background-size: 50px 50px;
            opacity: 0.3;
            pointer-events: none;
            z-index: 1;
        }
        
        /* Neon text effects */
        .neon-title {
            font-family: 'Orbitron', monospace;
            text-shadow: 
                0 0 5px var(--neon-cyan),
                0 0 10px var(--neon-cyan),
                0 0 15px var(--neon-cyan),
                0 0 20px var(--neon-cyan);
            color: var(--neon-cyan);
            letter-spacing: 2px;
        }
        
        .neon-subtitle {
            font-family: 'Rajdhani', sans-serif;
            text-shadow: 
                0 0 5px var(--neon-pink),
                0 0 10px var(--neon-pink),
                0 0 15px var(--neon-pink);
            color: var(--neon-pink);
        }
        
        /* Container styles */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            position: relative;
            z-index: 2;
        }
        
        .form-container, .panel {
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid var(--neon-cyan);
            box-shadow: 
                0 0 20px var(--neon-cyan),
                inset 0 0 20px rgba(0, 255, 255, 0.1);
            padding: 40px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
            margin: 20px auto;
            max-width: 500px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--neon-cyan);
            text-shadow: 0 0 5px var(--neon-cyan);
        }
        
        input, select, textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--neon-cyan);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.8);
            color: var(--text-light);
            font-size: 16px;
            font-family: 'Rajdhani', sans-serif;
            transition: all 0.3s;
            box-shadow: 
                0 0 10px rgba(0, 255, 255, 0.3),
                inset 0 0 5px rgba(0, 255, 255, 0.1);
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--neon-pink);
            box-shadow: 
                0 0 20px var(--neon-pink),
                inset 0 0 10px rgba(255, 0, 255, 0.2);
        }
        
        button {
            width: 100%;
            padding: 12px 20px;
            background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-pink) 100%);
            color: var(--text-dark);
            border: 2px solid var(--neon-cyan);
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-family: 'Rajdhani', sans-serif;
            font-size: 16px;
            transition: all 0.3s;
            box-shadow: 
                0 0 10px var(--neon-cyan),
                inset 0 0 10px rgba(0, 255, 255, 0.2);
            text-shadow: 0 0 5px var(--neon-cyan);
            margin-top: 10px;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 
                0 0 20px var(--neon-cyan),
                0 0 30px var(--neon-pink),
                inset 0 0 10px rgba(0, 255, 255, 0.3);
        }
        
        button:disabled {
            background: #666;
            cursor: not-allowed;
            box-shadow: none;
            transform: none;
        }
        
        .links {
            text-align: center;
            margin-top: 20px;
        }
        
        .links a {
            color: var(--neon-green);
            text-decoration: none;
            margin: 0 10px;
            text-shadow: 0 0 5px var(--neon-green);
            transition: all 0.3s;
        }
        
        .links a:hover {
            text-shadow: 0 0 10px var(--neon-green), 0 0 20px var(--neon-green);
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            border: 2px solid;
        }
        
        .alert-error {
            background: rgba(255, 0, 0, 0.2);
            color: #ff6b6b;
            border-color: #ff0000;
            box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
        }
        
        .alert-success {
            background: rgba(0, 255, 0, 0.2);
            color: #00ff00;
            border-color: #00ff00;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 12px 15px;
            text-align: left;
            border: 1px solid var(--neon-cyan);
        }
        
        th {
            background: linear-gradient(90deg, var(--neon-cyan) 0%, var(--neon-pink) 100%);
            color: var(--text-dark);
            font-weight: bold;
            text-shadow: 0 0 5px var(--neon-cyan);
        }
        
        tr:hover {
            background-color: rgba(0, 255, 255, 0.1);
        }
        
        .btn-approve {
            background: linear-gradient(135deg, var(--neon-green) 0%, #00cc00 100%);
            color: var(--text-dark);
            border-color: var(--neon-green);
        }
        
        .btn-reject {
            background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
            color: var(--text-light);
            border-color: #ff0000;
        }
    </style>
`;

// HTML Login Page with Neon Styling
const loginHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - SHAN COOKIE SERVER</title>
    ${neonStyles}
</head>
<body>
    <div class="container">
        <div class="form-container">
            <h1 class="neon-title" style="text-align: center; margin-bottom: 30px;">SHAN COOKIE SERVER</h1>
            <h2 class="neon-subtitle" style="text-align: center; margin-bottom: 20px;">LOGIN</h2>
            
            <% if (error) { %>
                <div class="alert alert-error"><%= error %></div>
            <% } %>
            
            <% if (success) { %>
                <div class="alert alert-success"><%= success %></div>
            <% } %>
            
            <form action="/login" method="POST">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit">LOGIN</button>
            </form>
            
            <div class="links">
                <a href="/signup">Create Account</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

// HTML Signup Page with Neon Styling
const signupHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign Up - SHAN COOKIE SERVER</title>
    ${neonStyles}
</head>
<body>
    <div class="container">
        <div class="form-container">
            <h1 class="neon-title" style="text-align: center; margin-bottom: 30px;">SHAN COOKIE SERVER</h1>
            <h2 class="neon-subtitle" style="text-align: center; margin-bottom: 20px;">CREATE ACCOUNT</h2>
            
            <% if (error) { %>
                <div class="alert alert-error"><%= error %></div>
            <% } %>
            
            <% if (success) { %>
                <div class="alert alert-success"><%= success %></div>
            <% } %>
            
            <form action="/signup" method="POST">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <div class="form-group">
                    <label for="confirm_password">Confirm Password</label>
                    <input type="password" id="confirm_password" name="confirm_password" required>
                </div>
                
                <button type="submit">SIGN UP</button>
            </form>
            
            <div class="links">
                <a href="/login">Already have an account? Login</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

// HTML Admin Login Page (Dedicated) - NEW
const adminLoginHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login - SHAN COOKIE SERVER</title>
    ${neonStyles}
</head>
<body>
    <div class="container">
        <div class="form-container">
            <h1 class="neon-title" style="text-align: center; margin-bottom: 10px;">SHAN COOKIE SERVER</h1>
            <h2 class="neon-subtitle" style="text-align: center; margin-bottom: 30px;">⚙️ ADMIN LOGIN</h2>
            
            <% if (error) { %>
                <div class="alert alert-error"><%= error %></div>
            <% } %>
            
            <% if (success) { %>
                <div class="alert alert-success"><%= success %></div>
            <% } %>
            
            <form action="/admin-login" method="POST">
                <div class="form-group">
                    <label for="username">Admin Username</label>
                    <input type="text" id="username" name="username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Admin Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit">ADMIN LOGIN</button>
            </form>
            
            <div class="links">
                <a href="/login">User Login</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

// HTML Admin Panel with Neon Styling
const adminHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - SHAN COOKIE SERVER</title>
    ${neonStyles}
    <style>
        .back-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-pink) 100%);
            color: var(--text-dark);
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 0 20px var(--neon-cyan);
            transition: all 0.3s;
        }
        
        .back-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 0 30px var(--neon-pink);
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="container">
        <div style="text-align: center; margin-bottom: 25px; padding: 20px; border: 2px solid var(--neon-cyan); border-radius: 10px; box-shadow: 0 0 20px var(--neon-cyan);">
            <h1 class="neon-title">ADMIN PANEL</h1>
            <p class="neon-subtitle">Manage user approvals and system settings</p>
        </div>
        
        <div class="panel">
            <h2 class="neon-title">Pending User Approvals</h2>
            <div id="pending-approvals">
                <div class="no-data" id="no-pending" style="text-align: center; padding: 40px; color: #999;">
                    <p>No pending approvals</p>
                </div>
                <table id="approvals-table" style="display: none;">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Registration Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="approvals-tbody"></tbody>
                </table>
            </div>
        </div>
        
        <div class="panel">
            <h2 class="neon-title">Approved Users</h2>
            <div id="approved-users">
                <div class="no-data" id="no-approved" style="text-align: center; padding: 40px; color: #999;">
                    <p>No approved users</p>
                </div>
                <table id="users-table" style="display: none;">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody"></tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        function loadUserData() {
            fetch('/admin/api/users')
                .then(response => response.json())
                .then(data => {
                    const pendingTable = document.getElementById('approvals-table');
                    const pendingTbody = document.getElementById('approvals-tbody');
                    const noPending = document.getElementById('no-pending');
                    
                    pendingTbody.innerHTML = '';
                    
                    if (data.pendingApprovals.length > 0) {
                        noPending.style.display = 'none';
                        pendingTable.style.display = 'table';
                        
                        data.pendingApprovals.forEach(user => {
                            const row = document.createElement('tr');
                            row.innerHTML = \`
                                <td>\${user.username}</td>
                                <td>\${new Date(user.registrationDate).toLocaleString()}</td>
                                <td>
                                    <button class="btn-approve" onclick="approveUser('\${user.username}')">Approve</button>
                                    <button class="btn-reject" onclick="rejectUser('\${user.username}')">Reject</button>
                                </td>
                            \`;
                            pendingTbody.appendChild(row);
                        });
                    } else {
                        noPending.style.display = 'block';
                        pendingTable.style.display = 'none';
                    }
                    
                    const usersTable = document.getElementById('users-table');
                    const usersTbody = document.getElementById('users-tbody');
                    const noUsers = document.getElementById('no-approved');
                    
                    usersTbody.innerHTML = '';
                    
                    const approvedUsers = data.allUsers.filter(user => user.approved && user.role !== 'admin');
                    
                    if (approvedUsers.length > 0) {
                        noUsers.style.display = 'none';
                        usersTable.style.display = 'table';
                        
                        approvedUsers.forEach(user => {
                            const row = document.createElement('tr');
                            row.innerHTML = \`
                                <td>\${user.username}</td>
                                <td>\${user.role}</td>
                                <td>\${user.approved ? 'Approved' : 'Pending'}</td>
                            \`;
                            usersTbody.appendChild(row);
                        });
                    } else {
                        noUsers.style.display = 'block';
                        usersTable.style.display = 'none';
                    }
                })
                .catch(error => console.error('Error loading user data:', error));
        }
        
        function approveUser(username) {
            fetch('/admin/api/approve-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('User approved successfully');
                    loadUserData();
                } else {
                    alert('Error: ' + data.message);
                }
            })
            .catch(error => console.error('Error approving user:', error));
        }
        
        function rejectUser(username) {
            if (confirm('Are you sure you want to reject ' + username + '?')) {
                fetch('/admin/api/reject-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('User rejected successfully');
                        loadUserData();
                    } else {
                        alert('Error: ' + data.message);
                    }
                })
                .catch(error => console.error('Error rejecting user:', error));
            }
        }
        
        document.addEventListener('DOMContentLoaded', loadUserData);
        setInterval(loadUserData, 30000);
    </script>
</body>
</html>
`;

// HTML Main Page with Neon Styling
const mainHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SHAN COOKIE SERVER</title>
    ${neonStyles}
    <style>
        .header {
            text-align: center;
            margin-bottom: 25px;
            padding: 20px;
            border: 2px solid var(--neon-cyan);
            border-radius: 10px;
            box-shadow: 0 0 20px var(--neon-cyan);
        }
        
        .user-info {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            padding: 10px 15px;
            border-radius: 25px;
            box-shadow: 0 0 20px var(--neon-cyan);
            z-index: 1000;
            font-size: 14px;
            border: 2px solid var(--neon-cyan);
        }
        
        .user-info a {
            color: var(--neon-green);
            text-decoration: none;
            margin-left: 10px;
        }
        
        .status {
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 10px;
            font-weight: bold;
            text-align: center;
            border: 2px solid var(--neon-cyan);
            box-shadow: 0 0 20px var(--neon-cyan);
        }
        
        .admin-btn, .task-manager-btn {
            position: fixed;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-pink) 100%);
            color: var(--text-dark);
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 0 20px var(--neon-cyan);
            transition: all 0.3s;
            border: 2px solid var(--neon-cyan);
        }
        
        .admin-btn {
            top: 20px;
        }
        
        .task-manager-btn {
            bottom: 20px;
        }
        
        .admin-btn:hover, .task-manager-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 0 30px var(--neon-pink);
        }
    </style>
</head>
<body>
    <% if (user && user.role === 'admin') { %>
        <a href="/admin" class="admin-btn">⚙️ Admin Panel</a>
    <% } %>
    
    <div class="user-info">
        Welcome, <strong><%= user.username %></strong> | 
        <a href="/logout">Logout</a>
    </div>
   
    <div class="status" id="status">
        Status: Connecting to server...
    </div>
    
    <div class="container">
        <div class="header">
            <h1 class="neon-title">SHAN COOKIE SERVER</h1>
            <p class="neon-subtitle">Welcome to the main dashboard</p>
        </div>
        
        <div class="panel">
            <h2 class="neon-title">Main Dashboard</h2>
            <p>This is your main control panel. Use the buttons below to navigate to different sections.</p>
        </div>
        
        <a href="/task-manager" class="task-manager-btn">📊 Task Manager</a>
    </div>
</body>
</html>
`;

// HTML Task Manager Page with Neon Styling
const taskManagerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Manager - SHAN COOKIE SERVER</title>
    ${neonStyles}
    <style>
        .back-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-pink) 100%);
            color: var(--text-dark);
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 0 20px var(--neon-cyan);
            transition: all 0.3s;
        }
        
        .back-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 0 30px var(--neon-pink);
        }
        
        .task-item {
            background: rgba(0, 255, 255, 0.05);
            border: 2px solid var(--neon-cyan);
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }
        
        .task-header {
            color: var(--neon-cyan);
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .task-status {
            color: var(--neon-green);
            margin: 5px 0;
        }
        
        .view-logs-btn {
            background: linear-gradient(135deg, var(--neon-green) 0%, #00cc00 100%);
            color: var(--text-dark);
            border: 2px solid var(--neon-green);
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 10px;
            transition: all 0.3s;
        }
        
        .view-logs-btn:hover {
            box-shadow: 0 0 15px var(--neon-green);
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="container">
        <div style="text-align: center; margin-bottom: 25px; padding: 20px; border: 2px solid var(--neon-cyan); border-radius: 10px; box-shadow: 0 0 20px var(--neon-cyan);">
            <h1 class="neon-title">TASK MANAGER</h1>
            <p class="neon-subtitle">Monitor and manage running tasks</p>
        </div>
        
        <div class="panel">
            <h2 class="neon-title">Running Tasks</h2>
            <div id="tasks-list">
                <p style="text-align: center; color: #999;">No running tasks</p>
            </div>
        </div>
    </div>
    
    <script>
        function loadTasks() {
            fetch('/api/tasks')
                .then(response => response.json())
                .then(data => {
                    const tasksList = document.getElementById('tasks-list');
                    tasksList.innerHTML = '';
                    
                    if (data.tasks && data.tasks.length > 0) {
                        data.tasks.forEach(task => {
                            const taskDiv = document.createElement('div');
                            taskDiv.className = 'task-item';
                            taskDiv.innerHTML = \`
                                <div class="task-header">\${task.name}</div>
                                <div class="task-status">Status: \${task.status}</div>
                                <div class="task-status">Progress: \${task.progress}%</div>
                                <button class="view-logs-btn" onclick="viewLogs('\${task.id}')">📋 View Logs</button>
                            \`;
                            tasksList.appendChild(taskDiv);
                        });
                    } else {
                        tasksList.innerHTML = '<p style="text-align: center; color: #999;">No running tasks</p>';
                    }
                })
                .catch(error => console.error('Error loading tasks:', error));
        }
        
        function viewLogs(taskId) {
            fetch(\`/api/task-logs/\${taskId}\`)
                .then(response => response.json())
                .then(data => {
                    alert('Task Logs:\\n' + (data.logs || 'No logs available'));
                })
                .catch(error => console.error('Error fetching logs:', error));
        }
        
        document.addEventListener('DOMContentLoaded', loadTasks);
        setInterval(loadTasks, 5000);
    </script>
</body>
</html>
`;

// ==================== ROUTES ====================

// Login route
app.get('/login', (req, res) => {
  res.send(loginHTML);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  
  if (user && bcrypt.compareSync(password, user.password)) {
    if (user.approved || user.role === 'admin') {
      req.session.user = user;
      res.redirect('/');
    } else {
      res.redirect('/pending-approval');
    }
  } else {
    res.send(loginHTML.replace('<% if (error)', '<% if (true)').replace('error %>', `error = 'Invalid credentials' %>`));
  }
});

// Signup route
app.get('/signup', (req, res) => {
  res.send(signupHTML);
});

app.post('/signup', (req, res) => {
  const { username, password, confirm_password } = req.body;
  
  if (password !== confirm_password) {
    res.send(signupHTML.replace('<% if (error)', '<% if (true)').replace('error %>', `error = 'Passwords do not match' %>`));
    return;
  }
  
  if (users.has(username)) {
    res.send(signupHTML.replace('<% if (error)', '<% if (true)').replace('error %>', `error = 'Username already exists' %>`));
    return;
  }
  
  users.set(username, {
    username: username,
    password: bcrypt.hashSync(password, 10),
    role: 'user',
    approved: false,
    registrationDate: new Date()
  });
  
  pendingApprovals.set(username, users.get(username));
  
  res.send(signupHTML.replace('<% if (success)', '<% if (true)').replace('success %>', `success = 'Account created! Awaiting admin approval.' %>`));
});

// Admin Login route (NEW - DEDICATED)
app.get('/admin-login', (req, res) => {
  res.send(adminLoginHTML);
});

app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, users.get(ADMIN_USERNAME).password)) {
    req.session.user = users.get(ADMIN_USERNAME);
    res.redirect('/admin');
  } else {
    res.send(adminLoginHTML.replace('<% if (error)', '<% if (true)').replace('error %>', `error = 'Invalid admin credentials' %>`));
  }
});

// Main page
app.get('/', requireAuth, requireApproval, (req, res) => {
  res.send(mainHTML);
});

// Admin panel
app.get('/admin', requireAdmin, (req, res) => {
  res.send(adminHTML);
});

// Task Manager page
app.get('/task-manager', requireAuth, requireApproval, (req, res) => {
  res.send(taskManagerHTML);
});

// API endpoints
app.get('/admin/api/users', requireAdmin, (req, res) => {
  res.json({
    pendingApprovals: Array.from(pendingApprovals.values()),
    allUsers: Array.from(users.values())
  });
});

app.post('/admin/api/approve-user', requireAdmin, (req, res) => {
  const { username } = req.body;
  const user = users.get(username);
  
  if (user) {
    user.approved = true;
    pendingApprovals.delete(username);
    res.json({ success: true, message: 'User approved' });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

app.post('/admin/api/reject-user', requireAdmin, (req, res) => {
  const { username } = req.body;
  users.delete(username);
  pendingApprovals.delete(username);
  res.json({ success: true, message: 'User rejected' });
});

// Task API endpoints
app.get('/api/tasks', requireAuth, (req, res) => {
  res.json({
    tasks: [
      { id: '1', name: 'Task 1', status: 'Running', progress: 45 },
      { id: '2', name: 'Task 2', status: 'Completed', progress: 100 }
    ]
  });
});

app.get('/api/task-logs/:taskId', requireAuth, (req, res) => {
  const { taskId } = req.params;
  res.json({
    logs: `Logs for Task ${taskId}:\n[INFO] Task started\n[INFO] Processing data...\n[SUCCESS] Task completed`
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SHAN COOKIE SERVER - NEON EDITION   ║
║   Server running on port ${PORT}           ║
║   Cyberpunk Aesthetic Enabled ✓        ║
╚════════════════════════════════════════╝
  `);
});

