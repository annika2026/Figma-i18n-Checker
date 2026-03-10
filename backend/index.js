const express = require('express');
const multer = require('multer');
const cors = require('cors');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const FigmaAPI = require('./figma');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Figma i18n Checker Backend API' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test Figma API connection
app.post('/test-figma', async (req, res) => {
  try {
    const { figmaApiKey } = req.body;
    
    if (!figmaApiKey) {
      return res.status(400).json({ 
        error: 'Figma API key is required',
        details: 'Please provide your Figma API key'
      });
    }

    console.log('Testing Figma API connection...');
    
    // Test with a simple API call to get user info
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.figma.com/v1/me', {
      headers: {
        'X-Figma-Token': figmaApiKey
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Figma API test failed:', response.status, errorText);
      
      if (response.status === 401) {
        return res.status(400).json({ 
          error: 'Invalid API key',
          details: 'The provided Figma API key is invalid or expired'
        });
      } else {
        return res.status(400).json({ 
          error: 'API connection failed',
          details: `Figma API returned status ${response.status}`
        });
      }
    }

    const userData = await response.json();
    console.log('Figma API test successful');
    
    res.json({
      success: true,
      message: 'Figma API connection successful',
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name
      }
    });

  } catch (error) {
    console.error('Figma API test error:', error);
    res.status(500).json({ 
      error: 'API test failed', 
      details: error.message 
    });
  }
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const results = [];

    // Parse CSV file
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        res.json({
          message: 'File uploaded and parsed successfully',
          filename: req.file.originalname,
          records: results.length,
          data: results
        });
      })
      .on('error', (error) => {
        res.status(500).json({ error: 'Error parsing CSV file', details: error.message });
      });

  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Figma analysis endpoint
app.post('/analyze-figma', async (req, res) => {
  try {
    const { figmaUrl, figmaApiKey, csvData } = req.body;

    if (!figmaUrl) {
      return res.status(400).json({ error: 'Figma URL is required' });
    }

    if (!figmaApiKey) {
      return res.status(400).json({ error: 'Figma API key is required' });
    }

    const figmaAPI = new FigmaAPI(figmaApiKey);
    const analysis = await figmaAPI.analyzeFigmaFile(figmaUrl, csvData || []);

    res.json({
      message: 'Figma analysis completed successfully',
      analysis
    });

  } catch (error) {
    res.status(500).json({ error: 'Figma analysis failed', details: error.message });
  }
});

// Combined analysis endpoint (Figma + CSV)
app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    console.log('Received analysis request');
    console.log('Request body:', { 
      figmaUrl: req.body.figmaUrl ? 'provided' : 'missing',
      figmaApiKey: req.body.figmaApiKey ? 'provided' : 'missing',
      hasFile: !!req.file
    });

    const { figmaUrl, figmaApiKey } = req.body;
    let csvData = [];

    // Parse CSV if uploaded
    if (req.file) {
      console.log('Parsing uploaded CSV file:', req.file.originalname);
      const filePath = req.file.path;
      csvData = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', () => {
            console.log(`CSV parsed successfully: ${results.length} records`);
            resolve(results);
          })
          .on('error', (error) => {
            console.error('CSV parsing error:', error);
            reject(error);
          });
      });
    }

    // Validate required fields
    if (!figmaUrl) {
      console.log('Error: Figma URL is missing');
      return res.status(400).json({ 
        error: 'Figma URL is required',
        details: 'Please provide a valid Figma file URL'
      });
    }

    if (!figmaApiKey) {
      console.log('Error: Figma API key is missing');
      return res.status(400).json({ 
        error: 'Figma API key is required',
        details: 'Please provide your Figma API key'
      });
    }

    console.log('Starting Figma analysis...');
    const figmaAPI = new FigmaAPI(figmaApiKey);
    const analysis = await figmaAPI.analyzeFigmaFile(figmaUrl, csvData);

    console.log('Analysis completed successfully');
    res.json({
      message: 'Analysis completed successfully',
      csvData: csvData.length > 0 ? {
        filename: req.file?.originalname,
        records: csvData.length
      } : null,
      analysis
    });

  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
