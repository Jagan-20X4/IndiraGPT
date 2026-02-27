// Simple Node.js server to inject runtime environment variables
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { MongoClient, GridFSBucket } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });


const app = express();
const PORT = process.env.PORT || 5005;

// MongoDB connection
// Format: mongodb+srv://username:password@cluster.mongodb.net/database
// If password contains special characters, URL encode them
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'indira-gpt';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Debug: Log environment variable loading
if (process.env.NODE_ENV !== 'production') {
  console.log('\n📋 Environment variables check:');
  console.log(`   MONGODB_URI: ${MONGODB_URI ? '✅ Loaded' : '❌ Not found in .env'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Loaded' : '⚠️  Using default'}`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Not found'}`);
  if (!MONGODB_URI) {
    console.log('\n⚠️  MONGODB_URI not found in .env file!');
    console.log('   Make sure your .env file contains:');
    console.log('   MONGODB_URI=mongodb+srv://indiragenai:YOUR_PASSWORD@cluster1.zbw5eso.mongodb.net/indira-gpt');
  }
}

let db = null;
let client = null;

// Connect to MongoDB
async function connectDB() {
  try {
    // Check if MONGODB_URI is set
    if (!MONGODB_URI) {
      if (process.env.NODE_ENV === 'production') {
        // In production, environment variables should be set in App Runner
        console.warn('\n⚠️  MONGODB_URI not set. Make sure it is configured in App Runner environment variables.');
        console.warn('   The application will continue but database features will not work.');
        return; // Don't exit, just skip connection
      } else {
        // In development, show helpful error
        console.error('\n❌ MONGODB_URI not set in .env file!');
        console.error('   Please add MONGODB_URI to your .env file:');
        console.error('   MONGODB_URI=mongodb+srv://indiragenai:YOUR_PASSWORD@cluster1.zbw5eso.mongodb.net/indira-gpt');
        console.error('   Replace YOUR_PASSWORD with your actual MongoDB password');
        console.error('   If password has special characters, URL encode them (e.g., @ becomes %40)');
        // In development, we can exit to force fixing the issue
        return;
      }
    }
    
    if (MONGODB_URI.includes('<db_password>') || MONGODB_URI.includes('<password>')) {
      console.error('\n❌ MONGODB_URI contains placeholder!');
      console.error('   Please replace <db_password> with your actual MongoDB password');
      console.error('   Current value:', MONGODB_URI.replace(/:[^@]+@/, ':***@'));
      return;
    }
    
    // Construct connection string - if MONGODB_URI doesn't include database, append it
    let connectionString = MONGODB_URI;
    if (!connectionString.includes('/indira-gpt') && !connectionString.includes('?')) {
      connectionString = connectionString.replace(/\/$/, '') + `/${DB_NAME}?retryWrites=true&w=majority`;
    } else if (!connectionString.includes('retryWrites')) {
      connectionString += (connectionString.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';
    }
    
    // Log connection attempt (without password)
    const maskedUri = connectionString.replace(/mongodb\+srv:\/\/([^:]+):([^@]+)@/, 'mongodb+srv://$1:***@');
    console.log('🔄 Attempting to connect to MongoDB...');
    console.log(`   Connection string: ${maskedUri}`);
    
    client = new MongoClient(connectionString);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Create indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    
    // Create default admin user if it doesn't exist
    const adminExists = await db.collection('users').findOne({ email: 'admin@indira.com' });
    if (!adminExists) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await db.collection('users').insertOne({
        email: 'admin@indira.com',
        passwordHash: adminPassword,
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null
      });
      console.log('✅ Default admin user created: admin@indira.com / admin123');
      console.log('⚠️  Please change the default admin password after first login!');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // Provide specific error messages
    if (error.message.includes('authentication failed') || error.message.includes('bad auth')) {
      console.error('   🔐 Authentication failed - possible issues:');
      console.error('   1. Wrong password in MONGODB_URI');
      console.error('   2. Password contains special characters that need URL encoding');
      console.error('      Special characters: @ # $ % & + = ? / : ; , < >');
      console.error('      Example: If password is "p@ss#word", use "p%40ss%23word"');
      console.error('   3. Wrong username in MONGODB_URI');
      console.error('   4. Database user doesn\'t exist in MongoDB Atlas');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('   🌐 Network error - check:');
      console.error('   1. Internet connection');
      console.error('   2. MongoDB Atlas cluster is running');
      console.error('   3. Network access in MongoDB Atlas allows your IP');
    } else {
      console.error('   Make sure MONGODB_URI environment variable is set correctly');
      console.error('   Format: mongodb+srv://username:password@cluster.mongodb.net/database');
    }
    // Don't exit - app can still serve static files
  }
}

connectDB();

// Middleware
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// NOTE: Global error handler is intentionally placed AFTER all routes (see bottom of file)

// Multer configuration for file uploads
const upload = multer({ 
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// CORS middleware (for API requests)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.error('JWT verification error:', err.message);
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = user;
      console.log('✅ User authenticated:', { email: user.email, role: user.role });
      next();
    });
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Authentication error', message: error.message });
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      console.error('❌ requireAdmin: req.user is undefined');
      return res.status(401).json({ error: 'User not authenticated' });
    }
    if (req.user.role !== 'admin') {
      console.error('❌ requireAdmin: User is not admin:', req.user.role);
      return res.status(403).json({ error: 'Admin access required' });
    }
    console.log('✅ Admin access granted:', req.user.email);
    next();
  } catch (error) {
    console.error('requireAdmin middleware error:', error);
    res.status(500).json({ error: 'Internal server error in authentication', message: error.message });
  }
};

// ============================================
// MongoDB-Native Data Query Functions
// ============================================

function getCollectionName(fileName) {
  return 'data_' + fileName
    .replace(/\.csv$/i, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function cleanCSVValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // Detect comma-formatted numbers like "8,144,550" or "1,437,800"
    if (/^-?[\d,]+\.?\d*$/.test(trimmed) && trimmed.includes(',')) {
      const stripped = trimmed.replace(/,/g, '');
      const num = parseFloat(stripped);
      if (!isNaN(num)) return num;
    }
    // Detect plain numbers
    if (/^-?\d+\.?\d*$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) return num;
    }
    return trimmed;
  }
  return value;
}

async function parseAndStoreCSVInMongo(fileName, content) {
  const collectionName = getCollectionName(fileName);
  
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
  
  if (!records || records.length === 0) {
    throw new Error(`No data found in CSV file ${fileName}`);
  }
  
  // Clean all values (handle comma-formatted numbers, cast types)
  // Also sanitize MongoDB field names: MongoDB forbids keys containing '.' or starting with '$'
  const cleanedRecords = records.map(row => {
    const cleaned = {};
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = key.trim()
        .replace(/\./g, '_')           // dots → underscore (e.g. "Q1.2025" → "Q1_2025")
        .replace(/^\$/, '_')           // leading $ → _ (e.g. "$Revenue" → "_Revenue")
        .replace(/\$/g, '')            // remaining $ removed (e.g. "Revenue ($)" → "Revenue ()")
        .replace(/[()[\]{}/\\#%]/g, '') // remove other special chars common in financial headers
        .replace(/\s+/g, '_')          // spaces → underscore
        .replace(/_+/g, '_')           // collapse multiple underscores
        .replace(/^_|_$/g, '')         // trim leading/trailing underscores
        || `col_${Object.keys(cleaned).length}`; // fallback if key becomes empty
      cleaned[cleanKey] = cleanCSVValue(value);
    }
    return cleaned;
  });
  
  // Drop existing collection and insert fresh data
  try {
    await db.collection(collectionName).drop();
    console.log(`✓ Dropped existing collection: ${collectionName}`);
  } catch (e) {
    // Collection doesn't exist yet — that's fine
  }
  
  await db.collection(collectionName).insertMany(cleanedRecords);
  console.log(`✓ Stored ${cleanedRecords.length} documents in collection: ${collectionName}`);
  
  const headers = Object.keys(cleanedRecords[0] || {});
  
  return {
    collectionName,
    headers,
    rowCount: cleanedRecords.length
  };
}

function validatePipeline(pipeline) {
  if (!Array.isArray(pipeline)) {
    throw new Error('Pipeline must be an array');
  }
  
  const dangerousStages = ['$out', '$merge', '$currentOp', '$listSessions', '$planCacheStats'];
  
  for (const stage of pipeline) {
    if (typeof stage !== 'object' || stage === null) {
      throw new Error('Each pipeline stage must be an object');
    }
    const stageKeys = Object.keys(stage);
    for (const key of stageKeys) {
      if (dangerousStages.includes(key)) {
        throw new Error(`Dangerous pipeline stage not allowed: ${key}`);
      }
    }
  }
  
  return pipeline;
}

// CRITICAL: Inject environment variables into index.html BEFORE serving static files
// This ensures the API key is injected for all HTML requests
// Only serve static files if dist folder exists (production mode)
const distExists = fs.existsSync(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));

if (distExists) {
  app.get('/', (req, res) => {
    injectApiKeyAndServe(req, res);
  });

  app.get('/index.html', (req, res) => {
    injectApiKeyAndServe(req, res);
  });
} else {
  // Dev mode - just return a message for root route
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Express API server running in dev mode',
      note: 'Frontend is served by Vite on port 3000',
      api: 'API endpoints available at /api/*'
    });
  });
}

// Function to inject API key and serve HTML
function injectApiKeyAndServe(req, res) {
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    return res.status(404).send('Build files not found. Please build the application first.');
  }

  // Read the index.html file
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Get API key from environment variable (set in App Runner)
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  // Log for debugging (only in development or if key is missing)
  if (!apiKey) {
    console.warn('WARNING: GEMINI_API_KEY environment variable is not set!');
  } else {
    console.log(`🔑 Injecting API key into HTML (length: ${apiKey.length}, first 10: ${apiKey.substring(0, 10)}..., source: process.env.GEMINI_API_KEY)`);
  }
  
  // Escape API key for safe injection into HTML/JavaScript
  // Escape single quotes, backslashes, and newlines
  const escapedApiKey = apiKey
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")    // Escape single quotes
    .replace(/\n/g, '\\n')  // Escape newlines
    .replace(/\r/g, '\\r'); // Escape carriage returns
  
  // Inject the API key into the HTML as early as possible
  // Replace the process.env polyfill with actual API key (more flexible regex)
  const processEnvPattern = /window\.process\s*=\s*window\.process\s*\|\|\s*\{\s*env:\s*\{\s*API_KEY:\s*['"](.*?)['"]\s*(?:,\s*GEMINI_API_KEY:\s*['"](.*?)['"])?\s*\}\s*\};/;
  if (processEnvPattern.test(html)) {
    html = html.replace(
      processEnvPattern,
      `window.process = window.process || { env: { API_KEY: '${escapedApiKey}', GEMINI_API_KEY: '${escapedApiKey}' } };`
    );
  } else {
    // If pattern doesn't match, inject it anyway before the existing script
    const existingScriptMatch = html.match(/<script[^>]*>/);
    if (existingScriptMatch) {
      html = html.replace(
        existingScriptMatch[0],
        `<script>window.process = window.process || { env: { API_KEY: '${escapedApiKey}', GEMINI_API_KEY: '${escapedApiKey}' } };</script>\n    ${existingScriptMatch[0]}`
      );
    }
  }
  
  // Inject API key as a script tag early in the head (before other scripts)
  // This ensures it's available immediately when the page loads
  const scriptInjection = `
    <script>
      (function() {
        if (typeof window !== 'undefined') {
          window.__GEMINI_API_KEY__ = '${escapedApiKey}';
          if (!window.process) {
            window.process = { env: {} };
          }
          if (!window.process.env) {
            window.process.env = {};
          }
          window.process.env.API_KEY = '${escapedApiKey}';
          window.process.env.GEMINI_API_KEY = '${escapedApiKey}';
        }
      })();
    </script>
  `;
  
  // Insert script injection right after the opening <head> tag
  // This ensures it runs before any other scripts
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${scriptInjection}`);
  } else if (html.includes('</head>')) {
    html = html.replace('</head>', `${scriptInjection}</head>`);
  } else {
    // Fallback: inject at the very beginning of the body or after <html>
    if (html.includes('<html')) {
      html = html.replace(/<html[^>]*>/, (match) => `${match}${scriptInjection}`);
    }
  }
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// Health check endpoint (BEFORE catch-all route)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    dbConnected: db !== null
  });
});

// ============================================
// Authentication API Endpoints
// ============================================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const user = await db.collection('users').findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint (client-side token removal, but we can log it)
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// ============================================
// Admin API Endpoints
// ============================================

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const users = await db.collection('users')
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    
    // Include accessibleFiles count for each user
    const usersWithFileCount = users.map(user => ({
      ...user,
      fileCount: user.accessibleFiles ? user.accessibleFiles.length : 0
    }));
    
    res.json(usersWithFileCount);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to fetch users'
    });
  }
});

// Add new user (admin only)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('📝 Add user request received:', { 
      email: req.body?.email, 
      role: req.body?.role,
      hasAccessibleFiles: !!req.body?.accessibleFiles,
      userEmail: req.user?.email 
    });
    
    if (!db) {
      console.error('❌ Database not connected');
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email, password, role, accessibleFiles } = req.body;
    
    if (!email || !password) {
      console.error('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.error('❌ User already exists:', email);
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert user with accessible files
    // Safely get addedBy email (handle case where req.user might not have email)
    const addedByEmail = req.user?.email || req.user?.userId || 'system';
    
    const result = await db.collection('users').insertOne({
      email: email.toLowerCase(),
      passwordHash,
      role: role || 'user',
      accessibleFiles: Array.isArray(accessibleFiles) ? accessibleFiles : [],
      createdAt: new Date(),
      lastLogin: null,
      addedBy: addedByEmail
    });
    
    res.status(201).json({
      _id: result.insertedId,
      email: email.toLowerCase(),
      role: role || 'user',
      accessibleFiles: Array.isArray(accessibleFiles) ? accessibleFiles : [],
      createdAt: new Date()
    });
  } catch (error) {
    console.error('❌ Add user error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });
    
    // Provide more detailed error information for debugging
    const errorMessage = error.message || 'Internal server error';
    
    // Check for specific MongoDB errors
    if (error.code === 11000) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Check for validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error', message: errorMessage });
    }
    
    // Return detailed error in development, generic in production
    const errorResponse = {
      error: 'Internal server error',
      message: errorMessage
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = error.stack;
      errorResponse.errorCode = error.code;
    }
    
    res.status(500).json(errorResponse);
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email } = req.params;
    
    // Prevent deleting yourself
    if (email.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const result = await db.collection('users').deleteOne({ email: email.toLowerCase() });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role (admin only)
app.put('/api/admin/users/:email/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Valid role (admin or user) is required' });
    }
    
    // Prevent changing your own role
    if (email.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    
    const result = await db.collection('users').updateOne(
      { email: email.toLowerCase() },
      { $set: { role, updatedAt: new Date(), updatedBy: req.user.email } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// File Management API Endpoints (Admin Only)
// ============================================

// Get all available CSV files
app.get('/api/admin/files', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('📁 Get files request received');
    
    if (!db) {
      console.error('❌ Database not connected');
      // Try to reconnect
      try {
        await connectDB();
        if (!db) {
          return res.status(503).json({ error: 'Database not connected. Please check MongoDB connection.' });
        }
      } catch (reconnectError) {
        console.error('❌ Failed to reconnect to database:', reconnectError);
        return res.status(503).json({ 
          error: 'Database not connected', 
          message: reconnectError.message || 'Failed to connect to MongoDB'
        });
      }
    }
    
    console.log('✅ Database connection verified');
    
    // Query files - handle missing uploadedAt field gracefully
    // Use a more robust sort that handles missing fields
    console.log('🔍 Querying files from database...');
    const files = await db.collection('csvFiles')
      .find({ isActive: { $ne: false } }) // Only get active files
      .toArray();
    
    console.log(`✅ Found ${files.length} files`);
    
    // Sort in memory to handle missing uploadedAt fields
    files.sort((a, b) => {
      try {
        const dateA = a.uploadedAt || a.createdAt || new Date(0);
        const dateB = b.uploadedAt || b.createdAt || new Date(0);
        // Ensure dates are Date objects
        const dateAObj = dateA instanceof Date ? dateA : new Date(dateA);
        const dateBObj = dateB instanceof Date ? dateB : new Date(dateB);
        return dateBObj.getTime() - dateAObj.getTime(); // Newest first
      } catch (sortError) {
        console.error('Error sorting files:', sortError);
        return 0; // Keep original order if sort fails
      }
    });
    
    // Remove fileContent from response to reduce payload size (only include metadata)
    // Handle missing fields gracefully
    const filesWithoutContent = files.map(file => {
      try {
        return {
          _id: file._id ? (file._id.toString ? file._id.toString() : String(file._id)) : null,
          fileName: file.fileName || 'Unknown',
          filePath: file.filePath || `/data/${file.fileName || 'unknown'}`,
          fileSize: file.fileSize || 0,
          uploadedAt: file.uploadedAt || file.createdAt || new Date(),
          uploadedBy: file.uploadedBy || 'Unknown',
          isActive: file.isActive !== false, // Default to true if not set
          storedInGridFS: file.storedInGridFS || false
        };
      } catch (mapError) {
        console.error('Error mapping file:', file, mapError);
        // Return a safe default object
        return {
          _id: file._id ? (file._id.toString ? file._id.toString() : String(file._id)) : null,
          fileName: file.fileName || 'Unknown',
          filePath: `/data/${file.fileName || 'unknown'}`,
          fileSize: 0,
          uploadedAt: new Date(),
          uploadedBy: 'Unknown',
          isActive: true,
          storedInGridFS: false
        };
      }
    });
    
    console.log(`✅ Returning ${filesWithoutContent.length} files to client`);
    res.json(filesWithoutContent);
  } catch (error) {
    console.error('❌ Get files error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    // Check for specific MongoDB errors
    if (error.name === 'MongoServerError' || error.name === 'MongoError' || error.name === 'MongoNetworkError') {
      console.error('❌ MongoDB error detected');
      return res.status(503).json({ 
        error: 'Database error',
        message: error.message || 'Failed to connect to database',
        hint: 'Please check MongoDB connection. The database may not be connected.'
      });
    }
    
    // Check if database is not connected
    if (!db) {
      console.error('❌ Database connection is null');
      return res.status(503).json({ 
        error: 'Database not connected',
        message: 'MongoDB connection is not established. Please check server logs.',
        hint: 'Check if MONGODB_URI is set correctly in .env file'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to fetch files',
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Upload CSV file (admin only) - saves to MongoDB only, overwrites existing file
app.post('/api/admin/files/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileSizeMB = req.file.size / (1024 * 1024);
    const isLargeFile = req.file.size > 16 * 1024 * 1024;
    
    let fileContent = null;
    if (!isLargeFile) {
      try {
        fileContent = fs.readFileSync(req.file.path, 'utf8');
        if (fileContent.trim().toLowerCase().startsWith('<!doctype') || 
            fileContent.trim().toLowerCase().startsWith('<html')) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Uploaded file appears to be HTML, not CSV. Please upload a valid CSV file.' });
        }
      } catch (readError) {
        console.error('Error reading file content:', readError);
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Failed to read file content' });
      }
    } else {
      try {
        const fd = fs.openSync(req.file.path, 'r');
        const buf = Buffer.alloc(1024);
        fs.readSync(fd, buf, 0, 1024, 0);
        fs.closeSync(fd);
        const sample = buf.toString('utf8');
        if (sample.trim().toLowerCase().startsWith('<!doctype') || 
            sample.trim().toLowerCase().startsWith('<html')) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Uploaded file appears to be HTML, not CSV. Please upload a valid CSV file.' });
        }
      } catch (sampleError) {
        console.warn('Could not validate large file sample:', sampleError.message);
      }
    }
    
    // Delete ALL existing records for this filename (full overwrite, no duplicates)
    const existingRecords = await db.collection('csvFiles').find({ fileName: req.file.originalname }).toArray();
    if (existingRecords.length > 0) {
      // Clean up any GridFS data for this filename
      const hasGridFS = existingRecords.some(r => r.storedInGridFS);
      if (hasGridFS) {
        try {
          const bucket = new GridFSBucket(db, { bucketName: 'csvFiles' });
          // Delete ALL GridFS files with this name (there may be multiple)
          let gridFile = await db.collection('csvFiles.files').findOne({ filename: req.file.originalname });
          while (gridFile) {
            await bucket.delete(gridFile._id);
            console.log(`✓ Deleted old GridFS entry: ${req.file.originalname}`);
            gridFile = await db.collection('csvFiles.files').findOne({ filename: req.file.originalname });
          }
        } catch (deleteError) {
          console.warn(`⚠️ Could not delete old GridFS file:`, deleteError.message);
        }
      }
      // Remove ALL duplicate MongoDB records for this filename
      await db.collection('csvFiles').deleteMany({ fileName: req.file.originalname });
      console.log(`✓ Removed ${existingRecords.length} old record(s) for: ${req.file.originalname}`);
    }
    
    if (isLargeFile) {
      console.log(`📦 File is ${fileSizeMB.toFixed(2)}MB, storing in GridFS`);
      const bucket = new GridFSBucket(db, { bucketName: 'csvFiles' });
      
      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        metadata: {
          uploadedAt: new Date(),
          uploadedBy: req.user.email,
          isActive: true
        }
      });
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(uploadStream)
          .on('error', (err) => {
            console.error('GridFS upload error:', err);
            reject(err);
          })
          .on('finish', () => {
            console.log(`✓ Uploaded to GridFS: ${req.file.originalname}`);
            resolve(null);
          });
      });
      
      await db.collection('csvFiles').insertOne({
        fileName: req.file.originalname,
        filePath: `/data/${req.file.originalname}`,
        fileSize: req.file.size,
        fileContent: null,
        storedInGridFS: true,
        uploadedAt: new Date(),
        uploadedBy: req.user.email,
        isActive: true
      });
      console.log(`✓ Stored file metadata in MongoDB: ${req.file.originalname}`);
      
    } else {
      console.log(`📄 File is ${fileSizeMB.toFixed(2)}MB, storing in MongoDB document`);
      
      try {
        await db.collection('csvFiles').insertOne({
          fileName: req.file.originalname,
          filePath: `/data/${req.file.originalname}`,
          fileSize: req.file.size,
          fileContent: fileContent,
          storedInGridFS: false,
          uploadedAt: new Date(),
          uploadedBy: req.user.email,
          isActive: true
        });
        console.log(`✓ Stored file in MongoDB: ${req.file.originalname} (${fileContent ? fileContent.length : 0} chars)`);
      } catch (insertErr) {
        console.error(`❌ MongoDB insertOne failed for "${req.file.originalname}": ${insertErr.message}`);
        fs.unlinkSync(req.file.path);
        return res.status(500).json({
          error: 'Failed to save file to database',
          message: insertErr.message,
          hint: insertErr.message.includes('document too large') 
            ? 'File is too large to store directly. Try splitting the CSV into smaller files.'
            : 'Check MongoDB connection and permissions.'
        });
      }
    }
    
    // Parse CSV and store structured data in a dedicated MongoDB collection
    let csvContent = fileContent;
    if (!csvContent && isLargeFile) {
      csvContent = fs.readFileSync(req.file.path, 'utf8');
    }
    
    let parseResult = null;
    if (csvContent) {
      try {
        parseResult = await parseAndStoreCSVInMongo(req.file.originalname, csvContent);
        console.log(`✓ Parsed and stored ${parseResult.rowCount} documents in collection: ${parseResult.collectionName}`);
        
        // Update csvFiles metadata with collection info
        await db.collection('csvFiles').updateOne(
          { fileName: req.file.originalname, isActive: true },
          { $set: { 
            dataCollection: parseResult.collectionName, 
            columns: parseResult.headers, 
            rowCount: parseResult.rowCount 
          }}
        );
      } catch (parseError) {
        console.error(`⚠️ CSV parse/store failed for "${req.file.originalname}":`);
        console.error(`   Error type : ${parseError.constructor.name}`);
        console.error(`   Message    : ${parseError.message}`);
        // Do NOT re-throw — raw file is already saved in MongoDB; structured parse is best-effort
        parseResult = null;
      }
    }
    
    // Clean up temp file from multer
    fs.unlinkSync(req.file.path);
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedAt: new Date(),
        dataCollection: parseResult?.collectionName || null,
        columns: parseResult?.headers || [],
        rowCount: parseResult?.rowCount || 0
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      console.warn('Could not clean up temp file:', cleanupError.message);
    }
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to upload file'
    });
  }
});

// Get user's accessible files (admin only)
app.get('/api/admin/users/:email/files', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email } = req.params;
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const accessibleFiles = user.accessibleFiles || [];
    res.json(accessibleFiles);
  } catch (error) {
    console.error('Get user files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user's accessible files (admin only)
app.put('/api/admin/users/:email/files', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { email } = req.params;
    const { fileNames } = req.body; // Array of file names
    
    if (!Array.isArray(fileNames)) {
      return res.status(400).json({ error: 'fileNames must be an array' });
    }
    
    const result = await db.collection('users').updateOne(
      { email: email.toLowerCase() },
      { 
        $set: { 
          accessibleFiles: fileNames,
          filesUpdatedAt: new Date(),
          filesUpdatedBy: req.user.email
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'User file access updated successfully',
      accessibleFiles: fileNames
    });
  } catch (error) {
    console.error('Update user files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get accessible files for current user (for chatbot)
app.get('/api/user/files', authenticateToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const user = await db.collection('users').findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // If admin, return all files; otherwise return only accessible files
    if (user.role === 'admin') {
      const allFiles = await db.collection('csvFiles').find({ isActive: true }).toArray();
      res.json(allFiles.map(f => f.fileName));
    } else {
      const accessibleFiles = user.accessibleFiles || [];
      res.json(accessibleFiles);
    }
  } catch (error) {
    console.error('Get user accessible files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files (AFTER HTML injection routes) - only in production
if (distExists) {
  // CRITICAL: Handle /data routes FIRST, before general static middleware
  // This ensures CSV files are served correctly and not intercepted by catch-all routes
  
  // Serve CSV files from MongoDB only
  app.get('/data/:filename', async (req, res, next) => {
    let fileName = req.params.filename;
    try {
      fileName = decodeURIComponent(fileName);
    } catch (e) {
      console.warn(`⚠️ Could not decode filename: ${req.params.filename}`);
    }
    
    console.log(`📁 Request for CSV file: "${req.params.filename}" -> decoded: "${fileName}"`);
    
    if (!fileName.endsWith('.csv')) {
      return next();
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
      if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
      }
      
      let fileDoc = await db.collection('csvFiles').findOne({ 
        fileName: fileName,
        isActive: true 
      });
      
      if (!fileDoc) {
        const decodedFileName = decodeURIComponent(fileName);
        if (decodedFileName !== fileName) {
          fileDoc = await db.collection('csvFiles').findOne({ 
            fileName: decodedFileName,
            isActive: true 
          });
        }
      }
      
      if (!fileDoc) {
        console.warn(`⚠️ CSV file not found in MongoDB: ${fileName}`);
        return res.status(404).json({ error: `CSV file not found: ${fileName}` });
      }
      
      if (fileDoc.storedInGridFS || (fileDoc.fileSize > 16 * 1024 * 1024 && !fileDoc.fileContent)) {
        const bucket = new GridFSBucket(db, { bucketName: 'csvFiles' });
        const stream = bucket.openDownloadStreamByName(fileName);
        
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf-8');
          console.log(`✓ Serving CSV from GridFS: ${fileName} (${content.length} chars)`);
          res.send(content);
        });
        stream.on('error', (err) => {
          console.error(`❌ Error reading from GridFS:`, err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error reading file from GridFS' });
          }
        });
      } else if (fileDoc.fileContent) {
        console.log(`✓ Serving CSV from MongoDB: ${fileName} (${fileDoc.fileContent.length} chars)`);
        return res.send(fileDoc.fileContent);
      } else {
        console.warn(`⚠️ CSV file ${fileName} has no content. Please re-upload.`);
        return res.status(404).json({ 
          error: `CSV file ${fileName} needs to be re-uploaded. Content is missing.` 
        });
      }
    } catch (error) {
      console.error(`❌ Error serving CSV file ${fileName}:`, error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Error serving file from database' });
      }
    }
  });

// ============================================
// MongoDB Data Query Endpoints
// ============================================

// Get file schema (columns, row count, and sample data)
app.get('/api/data/schema/:fileName', authenticateToken, async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'admin') {
      const hasAccess = user.accessibleFiles && user.accessibleFiles.includes(fileName);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this file' });
      }
    }
    
    const fileDoc = await db.collection('csvFiles').findOne({ fileName, isActive: true });
    if (!fileDoc) {
      return res.status(404).json({ error: `File ${fileName} not found` });
    }
    
    const collectionName = fileDoc.dataCollection || getCollectionName(fileName);
    
    const rowCount = await db.collection(collectionName).countDocuments();
    const sample = await db.collection(collectionName).find({}).limit(5).toArray();
    const columns = sample.length > 0 
      ? Object.keys(sample[0]).filter(k => k !== '_id') 
      : (fileDoc.columns || []);
    
    // Detect column types from sample
    const columnTypes = {};
    if (sample.length > 0) {
      for (const col of columns) {
        const sampleValues = sample.map(r => r[col]).filter(v => v !== null && v !== undefined);
        if (sampleValues.length > 0) {
          const firstVal = sampleValues[0];
          columnTypes[col] = typeof firstVal === 'number' ? 'number' : 'string';
        }
      }
    }
    
    // Strip _id from sample rows
    const cleanSample = sample.map(row => {
      const { _id, ...rest } = row;
      return rest;
    });
    
    res.json({
      fileName,
      collectionName,
      columns,
      columnTypes,
      rowCount,
      sample: cleanSample
    });
  } catch (error) {
    console.error('Schema endpoint error:', error);
    res.status(500).json({ error: error.message || 'Failed to get schema' });
  }
});

// Get all schemas at once (for frontend data loading)
app.get('/api/data/schemas', authenticateToken, async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let files;
    if (user.role === 'admin') {
      files = await db.collection('csvFiles').find({ isActive: true }).toArray();
    } else {
      const accessibleFiles = user.accessibleFiles || [];
      if (accessibleFiles.length === 0) {
        return res.json([]);
      }
      files = await db.collection('csvFiles').find({ 
        fileName: { $in: accessibleFiles }, 
        isActive: true 
      }).toArray();
    }
    
    const schemas = [];
    for (const fileDoc of files) {
      const collectionName = fileDoc.dataCollection || getCollectionName(fileDoc.fileName);
      
      try {
        const rowCount = await db.collection(collectionName).countDocuments();
        const sample = await db.collection(collectionName).find({}).limit(3).toArray();
        const columns = sample.length > 0 
          ? Object.keys(sample[0]).filter(k => k !== '_id') 
          : (fileDoc.columns || []);
        
        const columnTypes = {};
        if (sample.length > 0) {
          for (const col of columns) {
            const val = sample.find(r => r[col] !== null && r[col] !== undefined)?.[col];
            columnTypes[col] = typeof val === 'number' ? 'number' : 'string';
          }
        }
        
        schemas.push({
          fileName: fileDoc.fileName,
          collectionName,
          columns,
          columnTypes,
          rowCount
        });
      } catch (e) {
        console.warn(`⚠️ Could not get schema for ${fileDoc.fileName}: ${e.message}`);
      }
    }
    
    res.json(schemas);
  } catch (error) {
    console.error('Schemas endpoint error:', error);
    res.status(500).json({ error: error.message || 'Failed to get schemas' });
  }
});

// Execute MongoDB aggregation pipeline on data collection
app.post('/api/data/query', authenticateToken, async (req, res) => {
  try {
    const { pipeline, fileName, collectionName: reqCollection } = req.body;
    
    if (!pipeline || !Array.isArray(pipeline)) {
      return res.status(400).json({ error: 'pipeline (array) is required' });
    }
    
    if (!fileName && !reqCollection) {
      return res.status(400).json({ error: 'fileName or collectionName is required' });
    }
    
    if (!db) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    // Check user access
    const user = await db.collection('users').findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role !== 'admin' && fileName) {
      const hasAccess = user.accessibleFiles && user.accessibleFiles.includes(fileName);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this file' });
      }
    }
    
    // Validate pipeline for safety
    validatePipeline(pipeline);
    
    // Determine collection name
    let collectionName = reqCollection;
    if (!collectionName && fileName) {
      const fileDoc = await db.collection('csvFiles').findOne({ fileName, isActive: true });
      collectionName = fileDoc?.dataCollection || getCollectionName(fileName);
    }
    
    console.log(`📊 Executing aggregation on ${collectionName}: ${JSON.stringify(pipeline).substring(0, 300)}`);
    
    const startTime = Date.now();
    const result = await db.collection(collectionName).aggregate(pipeline, { allowDiskUse: true }).toArray();
    const queryTime = Date.now() - startTime;
    
    // Strip _id from results unless it's a grouped field
    const cleanResult = result.map(row => {
      if (row._id && typeof row._id === 'object' && row._id.constructor.name === 'ObjectId') {
        const { _id, ...rest } = row;
        return rest;
      }
      return row;
    });
    
    const maxRows = 10000;
    const limitedResult = cleanResult.slice(0, maxRows);
    
    console.log(`✓ Aggregation executed in ${queryTime}ms, returned ${limitedResult.length} rows`);
    
    res.json({
      success: true,
      data: limitedResult,
      rowCount: limitedResult.length,
      totalRows: cleanResult.length,
      truncated: cleanResult.length > maxRows,
      columns: limitedResult.length > 0 ? Object.keys(limitedResult[0]) : [],
      queryTime: `${queryTime}ms`
    });
  } catch (error) {
    console.error('MongoDB query endpoint error:', error);
    res.status(500).json({ 
      error: error.message || 'Query failed',
      hint: 'Check aggregation pipeline syntax and ensure you have access to this file'
    });
  }
});
  
  // All CSV files are served from MongoDB via the /data/:filename route above

  // General static files (AFTER /data routes to avoid conflicts)
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

  // Fallback: For any other routes, serve index.html with API key injection (SPA routing)
  app.get('*', (req, res, next) => {
    // Skip /data routes - they should be handled by route handlers above
    if (req.path.startsWith('/data/')) {
      // If we reach here, the /data route handlers didn't match, so file doesn't exist
      console.warn(`⚠️ /data route not handled, file may not exist: ${req.path}`);
      return res.status(404).json({ error: `CSV file not found: ${req.path}` });
    }
    // Only inject for HTML requests, serve static files for others
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    if (req.path.includes('.')) {
      // Let static middleware handle it or return 404
      return res.status(404).send('Not found');
    }
    // For SPA routes, serve index.html with injection
    injectApiKeyAndServe(req, res);
  });
} else {
  // Dev mode - only handle API routes, return 404 for others
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.status(404).json({ 
      error: 'Not found',
      note: 'In dev mode, static files are served by Vite on port 3000'
    });
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment variables:`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set (' + process.env.GEMINI_API_KEY.length + ' chars)' : '❌ Not set'}`);
  console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? '✅ Set' : '❌ Not set'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '⚠️  Using default (not secure!)'}`);
  if (process.env.MONGODB_URI) {
    const maskedUri = process.env.MONGODB_URI.replace(/mongodb\+srv:\/\/([^:]+):([^@]+)@/, 'mongodb+srv://$1:***@');
    console.log(`   MongoDB URI: ${maskedUri}`);
  }
  console.log(`\n📊 Database connection status: ${db ? '✅ Connected' : '❌ Not connected'}`);
  if (!db) {
    console.log('⚠️  WARNING: Database is not connected. Some features will not work.');
    console.log('   Check server logs above for MongoDB connection errors.');
  }
  console.log('');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error('   Please stop the process using port 5005 or change PORT in .env');
    console.error('   To find and kill the process:');
    console.error('   Windows: netstat -ano | findstr :5005');
    console.error('   Then: taskkill /PID <PID> /F');
    process.exit(1);
  } else {
    throw err;
  }
});

// Global error handler — MUST be after all routes so Express treats it as an error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error caught by global handler:');
  console.error(`   Path    : ${req.method} ${req.path}`);
  console.error(`   Type    : ${err.constructor.name}`);
  console.error(`   Message : ${err.message}`);
  if (!res.headersSent) {
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: err.message || 'An unexpected error occurred'
      });
    } else {
      next(err);
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
