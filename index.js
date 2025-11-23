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
    res.redirect('/user-login');
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

// HTML Admin Login Page
const adminLoginHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            text-align: center;
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--text-dark);
        }
        
        input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
        }
        
        input:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
        }
        
        button {
            width: 100%;
            padding: 12px 20px;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
            margin-top: 10px;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .links {
            text-align: center;
            margin-top: 20px;
        }
        
        .links a {
            color: var(--color1);
            text-decoration: none;
            margin: 0 10px;
        }
        
        .links a:hover {
            text-decoration: underline;
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .alert-error {
            background: rgba(255, 82, 82, 0.2);
            color: #d32f2f;
            border: 1px solid #ffcdd2;
        }
        
        .alert-success {
            background: rgba(76, 175, 80, 0.2);
            color: #388e3c;
            border: 1px solid #c8e6c9;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>ADMIN LOGIN</h1>
        
        <% if (error) { %>
            <div class="alert alert-error">
                <%= error %>
            </div>
        <% } %>
        
        <% if (success) { %>
            <div class="alert alert-success">
                <%= success %>
            </div>
        <% } %>
        
        <form action="/admin-login" method="POST">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit">Admin Login</button>
        </form>
        
        <div class="links">
            <a href="/user-login">User Login</a>
            <a href="/user-signup">User Signup</a>
        </div>
    </div>
</body>
</html>
`;

// HTML User Login Page
const userLoginHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Login - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            text-align: center;
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--text-dark);
        }
        
        input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
        }
        
        input:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
        }
        
        button {
            width: 100%;
            padding: 12px 20px;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
            margin-top: 10px;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .links {
            text-align: center;
            margin-top: 20px;
        }
        
        .links a {
            color: var(--color1);
            text-decoration: none;
            margin: 0 10px;
        }
        
        .links a:hover {
            text-decoration: underline;
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .alert-error {
            background: rgba(255, 82, 82, 0.2);
            color: #d32f2f;
            border: 1px solid #ffcdd2;
        }
        
        .alert-success {
            background: rgba(76, 175, 80, 0.2);
            color: #388e3c;
            border: 1px solid #c8e6c9;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>USER LOGIN</h1>
        
        <% if (error) { %>
            <div class="alert alert-error">
                <%= error %>
            </div>
        <% } %>
        
        <% if (success) { %>
            <div class="alert alert-success">
                <%= success %>
            </div>
        <% } %>
        
        <form action="/user-login" method="POST">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit">User Login</button>
        </form>
        
        <div class="links">
            <a href="/admin-login">Admin Login</a>
            <a href="/user-signup">Create Account</a>
        </div>
    </div>
</body>
</html>
`;

// HTML User Signup Page
const userSignupHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Sign Up - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
        }
        
        .signup-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            text-align: center;
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--text-dark);
        }
        
        input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
        }
        
        input:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
        }
        
        button {
            width: 100%;
            padding: 12px 20px;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
            margin-top: 10px;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .links {
            text-align: center;
            margin-top: 20px;
        }
        
        .links a {
            color: var(--color1);
            text-decoration: none;
            margin: 0 10px;
        }
        
        .links a:hover {
            text-decoration: underline;
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .alert-error {
            background: rgba(255, 82, 82, 0.2);
            color: #d32f2f;
            border: 1px solid #ffcdd2;
        }
        
        .alert-success {
            background: rgba(76, 175, 80, 0.2);
            color: #388e3c;
            border: 1px solid #c8e6c9;
        }
    </style>
</head>
<body>
    <div class="signup-container">
        <h1>Create User Account</h1>
        
        <% if (error) { %>
            <div class="alert alert-error">
                <%= error %>
            </div>
        <% } %>
        
        <% if (success) { %>
            <div class="alert alert-success">
                <%= success %>
            </div>
        <% } %>
        
        <form action="/user-signup" method="POST">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <div class="form-group">
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" name="confirmPassword" required>
            </div>
            
            <button type="submit">Sign Up</button>
        </form>
        
        <div class="links">
            <a href="/admin-login">Admin Login</a>
            <a href="/user-login">User Login</a>
        </div>
    </div>
</body>
</html>
`;

// HTML Pending Approval Page
const pendingApprovalHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pending Approval - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: url('https://i.ibb.co/gM0phW6S/1614b9d2afdbe2d3a184f109085c488f.jpg') no-repeat center center fixed;
            background-size: cover;
        }
        
        .approval-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 500px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            background: linear-gradient(135deg, var(--color1) 0%, var(--color2) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }
        
        .icon {
            font-size: 64px;
            margin-bottom: 20px;
            color: var(--color2);
        }
        
        p {
            margin-bottom: 20px;
            line-height: 1.6;
        }
        
        .logout-btn {
            display: inline-block;
            padding: 10px 20px;
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            transition: all 0.3s;
        }
        
        .logout-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
    </style>
</head>
<body>
    <div class="approval-container">
        <div class="icon">⏳</div>
        <h1>Account Pending Approval</h1>
        <p>Your account <strong><%= username %></strong> is waiting for admin approval.</p>
        <p>You will be able to access the tool once an administrator approves your account.</p>
        <p>Please check back later.</p>
        <a href="/logout" class="logout-btn">Logout</a>
    </div>
</body>
</html>
`;

// Admin Panel HTML
const adminPanelHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
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
        
        .panel {
            background: rgba(255, 255, 255, 0.9);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            margin-bottom: 25px;
            backdrop-filter: blur(5px);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        th {
            background: linear-gradient(135deg, var(--color2) 0%, var(--color1) 100%);
            color: var(--text-dark);
            font-weight: bold;
        }
        
        tr:hover {
            background-color: rgba(158, 210, 255, 0.1);
        }
        
        .btn {
            padding: 8px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
            margin: 0 5px;
        }
        
        .btn-approve {
            background: #4CAF50;
            color: white;
        }
        
        .btn-reject {
            background: #f44336;
            color: white;
        }
        
        .btn-remove {
            background: #ff9800;
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
        }
        
        .no-data {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        @media (max-width: 768px) {
            .back-btn {
                position: relative;
                top: auto;
                left: auto;
                display: block;
                margin: 10px auto;
                text-align: center;
                width: fit-content;
            }
            
            table {
                display: block;
                overflow-x: auto;
            }
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="header">
        <h1>Admin Panel</h1>
        <p>Manage user approvals and system settings</p>
    </div>
    
    <div class="panel">
        <h2>Pending User Approvals</h2>
        <div id="pending-approvals">
            <div class="no-data" id="no-pending">
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
                <tbody id="approvals-tbody">
                </tbody>
            </table>
        </div>
    </div>
    
    <div class="panel">
        <h2>Approved Users</h2>
        <div id="approved-users">
            <div class="no-data" id="no-approved">
                <p>No approved users</p>
            </div>
            <table id="users-table" style="display: none;">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                </tbody>
            </table>
        </div>
    </div>

    <script>
        function loadUserData() {
            fetch('/admin/api/users')
                .then(response => response.json())
                .then(data => {
                    // Update pending approvals
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
                                    <button class="btn btn-approve" onclick="approveUser('\${user.username}')">Approve</button>
                                    <button class="btn btn-reject" onclick="rejectUser('\${user.username}')">Reject</button>
                                </td>
                            \`;
                            pendingTbody.appendChild(row);
                        });
                    } else {
                        noPending.style.display = 'block';
                        pendingTable.style.display = 'none';
                    }
                    
                    // Update approved users
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
                                <td>
                                    <button class="btn btn-reject" onclick="revokeUser('\${user.username}')">Revoke</button>
                                    <button class="btn btn-remove" onclick="removeUser('\${user.username}')">Remove</button>
                                </td>
                            \`;
                            usersTbody.appendChild(row);
                        });
                    } else {
                        noUsers.style.display = 'block';
                        usersTable.style.display = 'none';
                    }
                })
                .catch(error => {
                    console.error('Error loading user data:', error);
                });
        }
        
        function approveUser(username) {
            fetch('/admin/api/approve-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
            .catch(error => {
                console.error('Error approving user:', error);
                alert('Error approving user');
            });
        }
        
        function rejectUser(username) {
            if (confirm('Are you sure you want to reject ' + username + '?')) {
                fetch('/admin/api/reject-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
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
                .catch(error => {
                    console.error('Error rejecting user:', error);
                    alert('Error rejecting user');
                });
            }
        }
        
        function revokeUser(username) {
            if (confirm('Are you sure you want to revoke ' + username + '?')) {
                fetch('/admin/api/revoke-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: username })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('User revoked successfully');
                        loadUserData();
                    } else {
                        alert('Error: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Error revoking user:', error);
                    alert('Error revoking user');
                });
            }
        }
        
        function removeUser(username) {
            if (confirm('Are you sure you want to remove ' + username + '? This action cannot be undone.')) {
                fetch('/admin/api/remove-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: username })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('User removed successfully');
                        loadUserData();
                    } else {
                        alert('Error: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Error removing user:', error);
                    alert('Error removing user');
                });
            }
        }
        
        // Load data on page load
        document.addEventListener('DOMContentLoaded', loadUserData);
        
        // Refresh data every 30 seconds
        setInterval(loadUserData, 30000);
    </script>
</body>
</html>
`;

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
        
        .user-info {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px 15px;
            border-radius: 25px;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            font-size: 14px;
        }
        
        .user-info a {
            color: var(--color1);
            text-decoration: none;
            margin-left: 10px;
        }
        
        .user-info a:hover {
            text-decoration: underline;
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
            left: 20px;
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
        
        .admin-btn {
            position: fixed;
            top: 70px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            color: var(--text-dark);
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s;
        }
        
        .admin-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            color: var(--text-dark);
            text-decoration: none;
        }
        
        .cookie-checker-btn {
            position: fixed;
            top: 120px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, #00C853 0%, #64DD17 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s;
        }
        
        .cookie-checker-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            color: white;
            text-decoration: none;
        }
        
        .group-fetcher-btn {
            position: fixed;
            top: 170px;
            left: 20px;
            z-index: 1000;
            background: linear-gradient(135deg, #9C27B0 0%, #E040FB 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s;
        }
        
        .group-fetcher-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            color: white;
            text-decoration: none;
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
            
            .task-manager-btn, .admin-btn, .cookie-checker-btn, .group-fetcher-btn {
                position: relative;
                top: auto;
                left: auto;
                display: block;
                margin: 10px auto;
                text-align: center;
            }
            
            .user-info {
                position: relative;
                top: auto;
                right: auto;
                text-align: center;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <% if (user && user.role === 'admin') { %>
        <a href="/admin" class="admin-btn">⚙️ Admin Panel</a>
    <% } %>
    
    <a href="/task-manager" class="task-manager-btn">📊 Task Manager</a>
    <a href="/cookie-checker" class="cookie-checker-btn">🔍 Cookie Checker</a>
    <a href="/group-fetcher" class="group-fetcher-btn">👥 Group Fetcher</a>
    
    <div class="user-info">
        Welcome, <strong><%= user.username %></strong> | 
        <a href="/logout">Logout</a>
    </div>
   
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
    </div>

    <div class="footer">
    </div>

    <script>
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
        
        let currentSessionId = null;
        let reconnectAttempts = 0;
        let maxReconnectAttempts = 10;
        let socket = null;

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
            // Dynamic protocol for Render
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(protocol + '//' + window.location.host);

            socket.onopen = () => {
                console.log('Connected to server successfully');
                statusDiv.className = 'status server-connected';
                statusDiv.textContent = 'Status: Connected to Server';
                reconnectAttempts = 0;
            };
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'status') {
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
                        prefix,
                        username: '<%= user.username %>'
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

// Cookie Checker Page HTML
const cookieCheckerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cookie Checker - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1000px;
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
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            font-size: 14px;
        }
        
        .user-info a {
            color: var(--color1);
            text-decoration: none;
            margin-left: 10px;
        }
        
        .user-info a:hover {
            text-decoration: underline;
        }
        
        .panel {
            background: rgba(255, 255, 255, 0.9);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            margin-bottom: 25px;
            backdrop-filter: blur(5px);
        }
        
        textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
            font-family: 'Courier New', monospace;
            resize: vertical;
        }
        
        textarea:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
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
        
        .results {
            margin-top: 20px;
        }
        
        .cookie-result {
            background: rgba(255, 255, 255, 0.8);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            border-left: 5px solid var(--color2);
            transition: all 0.3s;
        }
        
        .cookie-result:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .cookie-valid {
            border-left-color: #4CAF50;
        }
        
        .cookie-invalid {
            border-left-color: #f44336;
        }
        
        .cookie-info {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 10px;
            margin-top: 10px;
        }
        
        .cookie-info img {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
        }
        
        .cookie-details {
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
        }
        
        .status-valid {
            background: #4CAF50;
            color: white;
        }
        
        .status-invalid {
            background: #f44336;
            color: white;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
        }
        
        .spinner {
            border: 4px solid rgba(158, 210, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid var(--color1);
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
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
                text-align: center;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="user-info">
        Welcome, <strong><%= user.username %></strong> | 
        <a href="/logout">Logout</a>
    </div>
    
    <div class="header">
        <h1>🔍 Cookie Checker</h1>
        <p>Check your Facebook cookies line by line for validity</p>
    </div>
    
    <div class="panel">
        <h2>Paste Your Cookies</h2>
        <p>Enter one cookie per line to check their validity:</p>
        <textarea id="cookies-input" placeholder="Paste your cookies here (one cookie per line)" rows="10"></textarea>
        <div style="text-align: center; margin-top: 15px;">
            <button id="check-btn">Check Cookies</button>
        </div>
        
        <div id="results" class="results" style="display: none;">
            <h3>Results</h3>
            <div id="results-container"></div>
        </div>
        
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Checking cookies, please wait...</p>
        </div>
    </div>

    <script>
        document.getElementById('check-btn').addEventListener('click', async () => {
            const cookiesInput = document.getElementById('cookies-input').value.trim();
            const resultsDiv = document.getElementById('results');
            const resultsContainer = document.getElementById('results-container');
            const loadingDiv = document.getElementById('loading');
            
            if (!cookiesInput) {
                alert('Please enter some cookies to check');
                return;
            }
            
            const cookies = cookiesInput.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            if (cookies.length === 0) {
                alert('No valid cookies found');
                return;
            }
            
            // Show loading
            loadingDiv.style.display = 'block';
            resultsDiv.style.display = 'none';
            resultsContainer.innerHTML = '';
            
            try {
                const response = await fetch('/check-cookies', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cookies })
                });
                
                const data = await response.json();
                
                // Hide loading
                loadingDiv.style.display = 'none';
                resultsDiv.style.display = 'block';
                
                if (data.success) {
                    data.results.forEach((result, index) => {
                        const resultDiv = document.createElement('div');
                        resultDiv.className = \`cookie-result \${result.valid ? 'cookie-valid' : 'cookie-invalid'}\`;
                        
                        let content = \`
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <h4>Cookie #\${index + 1}</h4>
                                <span class="status-badge \${result.valid ? 'status-valid' : 'status-invalid'}">
                                    \${result.valid ? 'VALID' : 'INVALID'}
                                </span>
                            </div>
                        \`;
                        
                        if (result.valid && result.userInfo) {
                            content += \`
                                <div class="cookie-info">
                                    <img src="\${result.userInfo.profilePic || 'https://via.placeholder.com/50'}" alt="Profile" onerror="this.src='https://via.placeholder.com/50'">
                                    <div class="cookie-details">
                                        <strong>\${result.userInfo.name || 'Unknown User'}</strong>
                                        <small>UID: \${result.userInfo.uid || 'N/A'}</small>
                                    </div>
                                </div>
                            \`;
                        } else {
                            content += \`<p>\${result.error || 'Cookie is invalid'}</p>\`;
                        }
                        
                        resultDiv.innerHTML = content;
                        resultsContainer.appendChild(resultDiv);
                    });
                } else {
                    resultsContainer.innerHTML = \`<div class="cookie-result cookie-invalid"><p>Error: \${data.message}</p></div>\`;
                }
            } catch (error) {
                loadingDiv.style.display = 'none';
                resultsContainer.innerHTML = \`<div class="cookie-result cookie-invalid"><p>Error checking cookies: \${error.message}</p></div>\`;
                resultsDiv.style.display = 'block';
            }
        });
    </script>
</body>
</html>
`;

// Group Fetcher Page HTML
const groupFetcherHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Group Fetcher - SHAN COOKIE SERVER</title>
    <style>
        :root {
            --color1: #FF9EC5;
            --color2: #9ED2FF;
            --color3: #FFFFFF;
            --color4: #FFB6D9;
            --text-dark: #333333;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1000px;
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
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            font-size: 14px;
        }
        
        .user-info a {
            color: var(--color1);
            text-decoration: none;
            margin-left: 10px;
        }
        
        .user-info a:hover {
            text-decoration: underline;
        }
        
        .panel {
            background: rgba(255, 255, 255, 0.9);
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            margin-bottom: 25px;
            backdrop-filter: blur(5px);
        }
        
        textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid var(--color2);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.8);
            color: var(--text-dark);
            font-size: 16px;
            transition: all 0.3s;
            box-sizing: border-box;
            font-family: 'Courier New', monospace;
            resize: vertical;
        }
        
        textarea:focus {
            outline: none;
            border-color: var(--color1);
            box-shadow: 0 0 0 3px rgba(158, 210, 255, 0.3);
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
        
        .results {
            margin-top: 20px;
        }
        
        .group-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .group-item {
            background: rgba(255, 255, 255, 0.8);
            border-radius: 10px;
            padding: 15px;
            border-left: 5px solid var(--color1);
            transition: all 0.3s;
        }
        
        .group-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .group-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .group-info img {
            width: 60px;
            height: 60px;
            border-radius: 10px;
            object-fit: cover;
        }
        
        .group-details {
            flex: 1;
        }
        
        .group-details h4 {
            margin: 0 0 5px 0;
            color: var(--text-dark);
        }
        
        .group-details p {
            margin: 0;
            font-size: 14px;
            color: #666;
        }
        
        .group-uid {
            background: var(--color2);
            color: var(--text-dark);
            padding: 4px 8px;
            border-radius: 5px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
            margin-top: 5px;
            display: inline-block;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
        }
        
        .spinner {
            border: 4px solid rgba(158, 210, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid var(--color1);
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .copy-btn {
            background: var(--color1);
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 5px;
        }
        
        .copy-btn:hover {
            background: var(--color4);
        }
        
        @media (max-width: 768px) {
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
                text-align: center;
                margin-bottom: 15px;
            }
            
            .group-list {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="user-info">
        Welcome, <strong><%= user.username %></strong> | 
        <a href="/logout">Logout</a>
    </div>
    
    <div class="header">
        <h1>👥 Group Fetcher</h1>
        <p>Fetch all groups from your Facebook account using cookies</p>
    </div>
    
    <div class="panel">
        <h2>Enter Your Cookie</h2>
        <p>Paste your Facebook cookie to fetch your groups:</p>
        <textarea id="cookie-input" placeholder="Paste your Facebook cookie here" rows="6"></textarea>
        <div style="text-align: center; margin-top: 15px;">
            <button id="fetch-btn">Fetch Groups</button>
        </div>
        
        <div id="results" class="results" style="display: none;">
            <h3>Your Groups</h3>
            <div id="results-container" class="group-list"></div>
        </div>
        
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Fetching groups, please wait...</p>
        </div>
    </div>

    <script>
        document.getElementById('fetch-btn').addEventListener('click', async () => {
            const cookieInput = document.getElementById('cookie-input').value.trim();
            const resultsDiv = document.getElementById('results');
            const resultsContainer = document.getElementById('results-container');
            const loadingDiv = document.getElementById('loading');
            
            if (!cookieInput) {
                alert('Please enter a cookie');
                return;
            }
            
            // Show loading
            loadingDiv.style.display = 'block';
            resultsDiv.style.display = 'none';
            resultsContainer.innerHTML = '';
            
            try {
                const response = await fetch('/fetch-groups', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cookie: cookieInput })
                });
                
                const data = await response.json();
                
                // Hide loading
                loadingDiv.style.display = 'none';
                resultsDiv.style.display = 'block';
                
                if (data.success && data.groups) {
                    if (data.groups.length === 0) {
                        resultsContainer.innerHTML = '<p>No groups found or you are not a member of any groups.</p>';
                    } else {
                        data.groups.forEach(group => {
                            const groupDiv = document.createElement('div');
                            groupDiv.className = 'group-item';
                            
                            groupDiv.innerHTML = \`
                                <div class="group-info">
                                    <img src="\${group.imageURL || 'https://via.placeholder.com/60'}" alt="\${group.name}" onerror="this.src='https://via.placeholder.com/60'">
                                    <div class="group-details">
                                        <h4>\${group.name}</h4>
                                        <p>\${group.participantCount ? group.participantCount + ' members' : 'Members count not available'}</p>
                                        <div class="group-uid">UID: \${group.threadID}</div>
                                        <button class="copy-btn" onclick="copyToClipboard('\${group.threadID}')">Copy UID</button>
                                    </div>
                                </div>
                            \`;
                            
                            resultsContainer.appendChild(groupDiv);
                        });
                    }
                } else {
                    resultsContainer.innerHTML = \`<p>Error: \${data.message || 'Failed to fetch groups'}</p>\`;
                }
            } catch (error) {
                loadingDiv.style.display = 'none';
                resultsContainer.innerHTML = \`<p>Error fetching groups: \${error.message}</p>\`;
                resultsDiv.style.display = 'block';
            }
        });
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Group UID copied to clipboard: ' + text);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    </script>
</body>
</html>
`;

// Task Manager Page HTML (Updated with user-specific tasks and live logs)
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
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            font-size: 14px;
        }
        
        .user-info a {
            color: var(--color1);
            text-decoration: none;
            margin-left: 10px;
        }
        
        .user-info a:hover {
            text-decoration: underline;
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
            justify-content: space-between;
            align-items: center;
        }
        
        .logs-body {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #000;
            color: #ffffff;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        
        .message-sent {
            color: #00ff00 !important;
            font-weight: bold;
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
                text-align: center;
                margin-bottom: 15px;
            }
            
            .logs-content {
                width: 95%;
                height: 90%;
            }
        }
    </style>
</head>
<body>
    <a href="/" class="back-btn">⬅ Back to Main</a>
    
    <div class="user-info">
        Welcome, <strong><%= user.username %></strong> | 
        <a href="/logout">Logout</a>
    </div>
    
    <div class="header">
        <h1>📊 Task Manager</h1>
        <p>Monitor and manage your running tasks</p>
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
        
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(protocol + '//' + window.location.host);
            
            socket.onopen = () => {
                console.log('Connected to task manager');
                // Request current tasks for this user only
                socket.send(JSON.stringify({ 
                    type: 'get_my_tasks',
                    username: '<%= user.username %>'
                }));
            };
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'my_tasks') {
                        tasks.clear();
                        data.tasks.forEach(task => {
                            tasks.set(task.id, {
                                ...task,
                                logs: []
                            });
                        });
                        updateTasksDisplay();
                    }
                    else if (data.type === 'task_update' && data.task.owner === '<%= user.username %>') {
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
                            let className = '';
                            
                            switch(data.level) {
                                case 'success':
                                    prefix = '✅';
                                    if (data.message.includes('sent message')) {
                                        className = 'message-sent';
                                    }
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
                            
                            const logEntry = \`<div class="log-entry"><span class="timestamp">[\${timestamp}]</span> <span class="\${className}">\${prefix} \${data.message}</span></div>\`;
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
                } catch (e) {
                    console.error('Error processing message:', e);
                }
            };
            
            socket.onclose = () => {
                console.log('Disconnected from server');
                setTimeout(connectWebSocket, 3000);
            };
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
                socket.send(JSON.stringify({ 
                    type: 'get_my_tasks',
                    username: '<%= user.username %>'
                }));
            }
        }, 5000);
    </script>
</body>
</html>
`;

// Authentication Routes
app.get('/admin-login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  let html = adminLoginHTML;
  if (req.query.error) {
    html = html.replace('<% if (error) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= error %>', req.query.error);
  } else {
    html = html.replace(/<% if \(error\) { %>[\s\S]*?<% } %>/, '');
  }
  
  if (req.query.success) {
    html = html.replace('<% if (success) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= success %>', req.query.success);
  } else {
    html = html.replace(/<% if \(success\) { %>[\s\S]*?<% } %>/, '');
  }
  
  res.send(html);
});

app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.redirect('/admin-login?error=Username and password are required');
  }
  
  const user = users.get(username);
  if (!user || user.role !== 'admin') {
    return res.redirect('/admin-login?error=Invalid admin credentials');
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.redirect('/admin-login?error=Invalid admin credentials');
  }
  
  req.session.user = user;
  res.redirect('/');
});

app.get('/user-login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  let html = userLoginHTML;
  if (req.query.error) {
    html = html.replace('<% if (error) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= error %>', req.query.error);
  } else {
    html = html.replace(/<% if \(error\) { %>[\s\S]*?<% } %>/, '');
  }
  
  if (req.query.success) {
    html = html.replace('<% if (success) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= success %>', req.query.success);
  } else {
    html = html.replace(/<% if \(success\) { %>[\s\S]*?<% } %>/, '');
  }
  
  res.send(html);
});

app.post('/user-login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.redirect('/user-login?error=Username and password are required');
  }
  
  const user = users.get(username);
  if (!user) {
    return res.redirect('/user-login?error=Invalid username or password');
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.redirect('/user-login?error=Invalid username or password');
  }
  
  req.session.user = user;
  res.redirect('/');
});

app.get('/user-signup', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  let html = userSignupHTML;
  if (req.query.error) {
    html = html.replace('<% if (error) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= error %>', req.query.error);
  } else {
    html = html.replace(/<% if \(error\) { %>[\s\S]*?<% } %>/, '');
  }
  
  if (req.query.success) {
    html = html.replace('<% if (success) { %>', '')
               .replace('<% } %>', '')
               .replace('<%= success %>', req.query.success);
  } else {
    html = html.replace(/<% if \(success\) { %>[\s\S]*?<% } %>/, '');
  }
  
  res.send(html);
});

app.post('/user-signup', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  
  if (!username || !password) {
    return res.redirect('/user-signup?error=Username and password are required');
  }
  
  if (password !== confirmPassword) {
    return res.redirect('/user-signup?error=Passwords do not match');
  }
  
  if (users.has(username)) {
    return res.redirect('/user-signup?error=Username already exists');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    username,
    password: hashedPassword,
    role: 'user',
    approved: false,
    registrationDate: new Date()
  };
  
  users.set(username, newUser);
  pendingApprovals.set(username, newUser);
  
  res.redirect('/user-login?success=Account created successfully. Please wait for admin approval.');
});

app.get('/pending-approval', (req, res) => {
  if (!req.session.user || req.session.user.approved) {
    return res.redirect('/');
  }
  
  let html = pendingApprovalHTML;
  html = html.replace('<%= username %>', req.session.user.username);
  res.send(html);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/user-login');
});

// Add default route to redirect to user login
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  } else {
    return res.redirect('/user-login');
  }
});

// Dashboard route (main control panel)
app.get('/dashboard', requireAuth, requireApproval, (req, res) => {
  let html = htmlControlPanel;
  html = html.replace(/<%= user\.username %>/g, req.session.user.username);
  if (req.session.user.role === 'admin') {
    html = html.replace(/<% if \(user && user\.role === 'admin'\) { %>/, '')
               .replace(/<% } %>/, '');
  } else {
    html = html.replace(/<% if \(user && user\.role === 'admin'\) { %>[\s\S]*?<% } %>/, '');
  }
  res.send(html);
});

// Admin Routes
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(adminPanelHTML);
});

app.get('/admin/api/users', requireAuth, requireAdmin, (req, res) => {
  const allUsers = Array.from(users.values());
  const pendingApprovalsList = Array.from(pendingApprovals.values());
  
  res.json({
    allUsers,
    pendingApprovals: pendingApprovalsList
  });
});

app.post('/admin/api/approve-user', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.json({ success: false, message: 'Username is required' });
  }
  
  const user = users.get(username);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }
  
  user.approved = true;
  pendingApprovals.delete(username);
  
  res.json({ success: true, message: 'User approved successfully' });
});

app.post('/admin/api/reject-user', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.json({ success: false, message: 'Username is required' });
  }
  
  users.delete(username);
  pendingApprovals.delete(username);
  
  res.json({ success: true, message: 'User rejected successfully' });
});

app.post('/admin/api/revoke-user', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.json({ success: false, message: 'Username is required' });
  }
  
  const user = users.get(username);
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }
  
  user.approved = false;
  pendingApprovals.set(username, user);
  
  res.json({ success: true, message: 'User revoked successfully' });
});

app.post('/admin/api/remove-user', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.json({ success: false, message: 'Username is required' });
  }
  
  if (username === ADMIN_USERNAME) {
    return res.json({ success: false, message: 'Cannot remove admin user' });
  }
  
  users.delete(username);
  pendingApprovals.delete(username);
  
  // Also stop any tasks owned by this user
  for (const [sessionId, session] of sessions.entries()) {
    if (session.owner === username) {
      stopSending(sessionId);
    }
  }
  
  res.json({ success: true, message: 'User removed successfully' });
});

// Cookie Checker Route
app.post('/check-cookies', requireAuth, requireApproval, async (req, res) => {
  const { cookies } = req.body;
  
  if (!cookies || !Array.isArray(cookies)) {
    return res.json({ success: false, message: 'Invalid cookies data' });
  }
  
  const results = [];
  
  for (const cookie of cookies) {
    try {
      const userInfo = await new Promise((resolve) => {
        wiegine.login(cookie, {}, (err, api) => {
          if (err || !api) {
            resolve({ valid: false, error: err?.message || err });
          } else {
            // Get user info
            api.getUserInfo(api.getCurrentUserID(), (err, user) => {
              if (err) {
                api.logout();
                resolve({ valid: true, userInfo: null });
              } else {
                const currentUserID = api.getCurrentUserID();
                const userData = user[currentUserID];
                api.logout();
                resolve({
                  valid: true,
                  userInfo: {
                    name: userData?.name || 'Unknown',
                    uid: currentUserID,
                    profilePic: userData?.profilePic || null
                  }
                });
              }
            });
          }
        });
      });
      
      results.push(userInfo);
    } catch (error) {
      results.push({ valid: false, error: error.message });
    }
  }
  
  res.json({ success: true, results });
});

// Group Fetcher Route
app.post('/fetch-groups', requireAuth, requireApproval, async (req, res) => {
  const { cookie } = req.body;
  
  if (!cookie) {
    return res.json({ success: false, message: 'Cookie is required' });
  }
  
  try {
    const groups = await new Promise((resolve) => {
      wiegine.login(cookie, {}, (err, api) => {
        if (err || !api) {
          resolve({ success: false, error: err?.message || err });
        } else {
          // Get thread list (groups)
          api.getThreadList(100, null, [], (err, threads) => {
            if (err) {
              api.logout();
              resolve({ success: false, error: err.message });
            } else {
              const groupThreads = threads.filter(thread => 
                thread.threadID && thread.isGroup === true
              ).map(thread => ({
                threadID: thread.threadID,
                name: thread.name || 'Unknown Group',
                participantCount: thread.participantCount,
                imageURL: thread.imageSrc || null
              }));
              
              api.logout();
              resolve({ success: true, groups: groupThreads });
            }
          });
        }
      });
    });
    
    res.json(groups);
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Protected Routes
app.get('/task-manager', requireAuth, requireApproval, (req, res) => {
  let html = taskManagerHTML;
  html = html.replace(/<%= user\.username %>/g, req.session.user.username);
  res.send(html);
});

app.get('/cookie-checker', requireAuth, requireApproval, (req, res) => {
  let html = cookieCheckerHTML;
  html = html.replace(/<%= user\.username %>/g, req.session.user.username);
  res.send(html);
});

app.get('/group-fetcher', requireAuth, requireApproval, (req, res) => {
  let html = groupFetcherHTML;
  html = html.replace(/<%= user\.username %>/g, req.session.user.username);
  res.send(html);
});

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
    ws.send(JSON.stringify({ type: 'log', message: 'No cookies found', level: 'error' }));
    return;
  }
  
  // Parse messages
  const messages = messageContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (messages.length === 0) {
    ws.send(JSON.stringify({ type: 'log', message: 'No messages found in the file', level: 'error' }));
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
    owner: username // Track which user owns this task
  };
  
  // Store session
  sessions.set(sessionId, session);
  
  // Send session ID to client
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'session', 
      sessionId: sessionId 
    }));
    
    addLogToSession(sessionId, `Task started with ID: ${sessionId}`, 'success');
    addLogToSession(sessionId, `Loaded ${cookies.length} cookies`, 'success');
    addLogToSession(sessionId, `Loaded ${messages.length} messages`, 'success');
    ws.send(JSON.stringify({ type: 'status', running: true }));
    
    // Broadcast task update
    broadcastTaskUpdate(sessionId, true);
  }
  
  // Initialize all cookies
  initializeCookies(sessionId, ws);
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
  
  // Broadcast log to all connected clients
  broadcastToSession(sessionId, { 
    type: 'log', 
    message: message,
    level: level,
    sessionId: sessionId
  });
}

// Initialize all cookies by logging in
function initializeCookies(sessionId, ws) {
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
        broadcastTaskUpdate(sessionId, true);
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
      broadcastTaskUpdate(sessionId, true);
    } else {
      session.totalMessagesSent++;
      cookie.sentCount = (cookie.sentCount || 0) + 1;
      
      // Show sent message in green color with message number
      const messageNumber = session.totalMessagesSent;
      const loopNumber = session.loopCount + 1;
      const messagePosition = messageIndex + 1;
      const totalMessages = session.messages.length;
      
      addLogToSession(sessionId, `Cookie ${session.currentCookieIndex + 1} sent message ${messageNumber} (Loop ${loopNumber}, Message ${messagePosition}/${totalMessages}): ${message}`, 'success');
      
      // Update task info
      broadcastTaskUpdate(sessionId, true);
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

// Broadcast to all clients watching this session
function broadcastToSession(sessionId, data) {
  if (!wss) return;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Broadcast task update to all clients
function broadcastTaskUpdate(sessionId, running) {
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
    running: running,
    owner: session.owner
  };
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'task_update',
        sessionId: sessionId,
        running: running,
        task: taskData
      }));
    }
  });
}

// Get tasks for specific user
function getUserTasks(username, ws) {
  const userTasks = [];
  
  sessions.forEach((session, sessionId) => {
    if (session.running && session.owner === username) {
      userTasks.push({
        id: session.id,
        threadID: session.threadID,
        totalMessagesSent: session.totalMessagesSent,
        activeCookies: session.activeCookies,
        totalCookies: session.totalCookies,
        startTime: session.startTime,
        running: true,
        owner: session.owner
      });
    }
  });
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'my_tasks',
      tasks: userTasks
    }));
  }
}

// Stop specific session
function stopSending(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
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
  
  broadcastToSession(sessionId, { type: 'status', running: false });
  addLogToSession(sessionId, 'Task stopped', 'success');
  
  // Broadcast task removal
  broadcastTaskUpdate(sessionId, false);
  
  return true;
}

// Set up Express server
const server = app.listen(PORT, () => {
  console.log(`💌 Persistent Message Sender Bot running at http://localhost:${PORT}`);
});

// Set up WebSocket server
wss = new WebSocket.Server({ server, clientTracking: true });

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
          data.prefix,
          data.username
        );
      } 
      else if (data.type === 'stop') {
        if (data.sessionId) {
          const stopped = stopSending(data.sessionId);
          if (!stopped && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'log', 
              message: `Task ${data.sessionId} not found or already stopped`,
              level: 'error'
            }));
          }
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'log', 
            message: 'No task ID provided',
            level: 'error'
          }));
        }
      }
      else if (data.type === 'get_my_tasks') {
        getUserTasks(data.username, ws);
      }
      else if (data.type === 'ping') {
        // Respond to ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
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
