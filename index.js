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
        
        await sendFacebookMessage(threadID, formattedMessage);
        
        messageIndex++;
        
        if (messageIndex < config.messages.length) {
            await new Promise(resolve => setTimeout(resolve, config.speed));
        }
    }
    
    config.isRunning = false;
}

// API Routes

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
    
    startMessaging(threadID);
    res.json({ success: true, message: 'Messaging started' });
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
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
