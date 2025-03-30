import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Configure middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Ensure the img directory exists
const imgDir = path.join(__dirname, 'img');
if (!fs.existsSync(imgDir)) {
  fs.mkdirSync(imgDir, { recursive: true });
  console.log('Created img directory');
}

// Endpoint to save canvas image
app.post('/api/save-image', (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    
    // Extract the base64 data from the data URL
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    
    // Generate a unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `canvas-drawing-${timestamp}.png`;
    const filepath = path.join(imgDir, filename);
    
    // Save the file
    fs.writeFileSync(filepath, base64Data, 'base64');
    
    console.log(`Image saved to ${filepath}`);
    
    // Return the file path
    res.json({ 
      success: true, 
      filename,
      path: `/img/${filename}`,
      absolutePath: filepath
    });
  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: 'Failed to save image', details: error.message });
  }
});

// Serve the img folder statically
app.use('/img', express.static(path.join(__dirname, 'img')));

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 