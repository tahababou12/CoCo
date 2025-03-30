const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../images');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Simple text-to-image generation function (no drawing reference)
async function generateTextToImage(prompt) {
  try {
    console.log('Generating text-to-image from prompt without canvas reference');
    
    // This is a simplified approach - we'll generate a random colored SVG
    const svgColors = [
      '#ff5252', '#ff4081', '#e040fb', '#7c4dff', '#536dfe', 
      '#448aff', '#40c4ff', '#18ffff', '#64ffda', '#69f0ae',
      '#b2ff59', '#eeff41', '#ffff00', '#ffd740', '#ffab40', '#ff6e40'
    ];
    
    // Create a simple abstract SVG with random shapes
    let svgContent = `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="black">Generated image based on: ${prompt}</text>`;
    
    // Add random shapes
    for (let i = 0; i < 20; i++) {
      const color = svgColors[Math.floor(Math.random() * svgColors.length)];
      const x = Math.floor(Math.random() * 700) + 50;
      const y = Math.floor(Math.random() * 700) + 50;
      const size = Math.floor(Math.random() * 100) + 50;
      
      // Randomly choose between circle and rectangle
      if (Math.random() > 0.5) {
        svgContent += `<circle cx="${x}" cy="${y}" r="${size/2}" fill="${color}" opacity="${Math.random() * 0.5 + 0.3}"/>`;
      } else {
        svgContent += `<rect x="${x-size/2}" y="${y-size/2}" width="${size}" height="${size}" fill="${color}" opacity="${Math.random() * 0.5 + 0.3}"/>`;
      }
    }
    
    svgContent += `</svg>`;
    
    // Convert SVG to buffer
    const svgBuffer = Buffer.from(svgContent);
    
    // Save the generated image
    const filename = `generated-${Date.now()}.svg`;
    const outputPath = path.join(__dirname, '../images', filename);
    fs.writeFileSync(outputPath, svgBuffer);
    
    console.log(`Saved generated image to ${outputPath}`);
    
    return {
      text: `I've created an artistic interpretation based on your prompt: "${prompt}".`,
      imageUrl: `/images/${filename}`
    };
    
  } catch (error) {
    console.error('Error generating text-to-image:', error);
    throw error;
  }
}

// Image-to-image generation function
async function generateImageToImage(prompt, imagePath) {
  try {
    console.log('Starting image-to-image generation');
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      console.error('Image file does not exist:', imagePath);
      return { text: 'The uploaded image file could not be found' };
    }
    
    // Log file information - CRUCIAL for debugging
    const fileStats = fs.statSync(imagePath);
    console.log(`Processing image: ${imagePath}, size: ${fileStats.size} bytes`);
    
    // If file is empty or tiny, return error
    if (fileStats.size < 100) {
      console.error('Image file is too small (possibly empty):', fileStats.size, 'bytes');
      return { text: 'The uploaded image appears to be empty or corrupted' };
    }
    
    // Read image file as binary data
    const imageBuffer = fs.readFileSync(imagePath);
    console.log(`Successfully read ${imageBuffer.length} bytes from image file`);
    
    // Create a more advanced SVG based on the drawing and prompt
    try {
      console.log('Creating enhanced SVG based on drawing');
      
      // Get image dimensions using Canvas
      const { createCanvas, loadImage } = require('canvas');
      const img = await loadImage(imagePath);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      
      // Draw the image for analysis
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Analyze the image to find stick figure parts (basic shape detection)
      // We'll look for clusters of non-white pixels to detect drawing elements
      const nonWhitePixels = [];
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          // If pixel is not white (allowing some tolerance)
          if (data[i] < 240 || data[i+1] < 240 || data[i+2] < 240) {
            nonWhitePixels.push({x, y});
          }
        }
      }

      console.log(`Found ${nonWhitePixels.length} non-white pixels in the drawing`);
      
      // Create SVG with advanced styling based on the drawing
      let svgContent = `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f0f9ff" />
            <stop offset="100%" stop-color="#e1f5fe" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="2" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="cool-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4F46E5" />
            <stop offset="100%" stop-color="#8B5CF6" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-gradient)" />
        <text x="50%" y="5%" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#333" filter="url(#shadow)">Enhanced: "${prompt}"</text>`;
      
      if (nonWhitePixels.length > 0) {
        // Calculate center of mass for the drawing
        const centerX = nonWhitePixels.reduce((sum, p) => sum + p.x, 0) / nonWhitePixels.length;
        const centerY = nonWhitePixels.reduce((sum, p) => sum + p.y, 0) / nonWhitePixels.length;
        
        console.log(`Drawing center at X: ${centerX}, Y: ${centerY}`);
        
        // Determine the bounds of the drawing
        const minX = Math.min(...nonWhitePixels.map(p => p.x));
        const maxX = Math.max(...nonWhitePixels.map(p => p.x));
        const minY = Math.min(...nonWhitePixels.map(p => p.y));
        const maxY = Math.max(...nonWhitePixels.map(p => p.y));
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        console.log(`Drawing dimensions: Width: ${width}, Height: ${height}`);
        
        // Create a more realistic stick figure based on the drawing's proportions
        // Scale the figure to be more visible
        const scaleFactor = 400 / Math.max(canvas.width, canvas.height);
        const offsetX = 400; // Center of SVG
        const offsetY = 400; // Center of SVG
        
        // Estimate head size based on drawing
        const headSize = Math.min(width, height) * 0.2 + 30;
        
        // Estimate limb proportions based on drawing height
        const bodyLength = height * 0.4;
        const legLength = height * 0.3;
        const armLength = width * 0.5;
        
        // Stylize the stick figure with enhanced design
        svgContent += `
          <g transform="translate(${offsetX}, ${offsetY}) scale(${scaleFactor})" filter="url(#shadow)">
            <!-- Enhanced character based on stick figure -->
            <circle cx="${centerX}" cy="${centerY - height*0.25}" r="${headSize}" fill="url(#cool-gradient)">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
            </circle>
            <path d="M ${centerX} ${centerY} 
                     L ${centerX} ${centerY + bodyLength} 
                     L ${centerX - width*0.2} ${centerY + bodyLength + legLength} 
                     M ${centerX} ${centerY + bodyLength} 
                     L ${centerX + width*0.2} ${centerY + bodyLength + legLength}
                     M ${centerX} ${centerY + bodyLength*0.3} 
                     L ${centerX - armLength/2} ${centerY + bodyLength*0.2}
                     M ${centerX} ${centerY + bodyLength*0.3} 
                     L ${centerX + armLength/2} ${centerY + bodyLength*0.2}"
                  stroke="url(#cool-gradient)" stroke-width="${Math.max(5, width*0.05)}" stroke-linecap="round" fill="none">
              <animate attributeName="stroke-width" values="${Math.max(5, width*0.05)};${Math.max(7, width*0.07)};${Math.max(5, width*0.05)}" dur="2s" repeatCount="indefinite" />
            </path>
          </g>`;
      } else {
        // Fallback if no drawing detected
        svgContent += `
          <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="red">
            No drawing detected on canvas
          </text>`;
      }
      
      // Add decorative elements based on the prompt
      if (prompt.toLowerCase().includes('cool')) {
        svgContent += `
          <g transform="translate(400, 300)">
            <!-- Sunglasses if "cool" is in the prompt -->
            <path d="M-45,-5 Q0,-35 45,-5 T135,-5" fill="none" stroke="#333" stroke-width="5" />
            <rect x="-50" y="-5" width="80" height="25" rx="10" fill="#333" />
            <rect x="30" y="-5" width="80" height="25" rx="10" fill="#333" />
            <animate attributeName="transform" type="rotate" from="-2 400 300" to="2 400 300" dur="2s" repeatCount="indefinite" />
          </g>`;
      }
      
      // Add stars if the prompt suggests something awesome
      if (prompt.toLowerCase().includes('awesome') || prompt.toLowerCase().includes('cool')) {
        for (let i = 0; i < 12; i++) {
          const starX = Math.random() * 700 + 50;
          const starY = Math.random() * 700 + 50;
          const size = Math.random() * 30 + 10;
          const animDuration = 1 + Math.random() * 3;
          svgContent += `
            <path d="M ${starX},${starY-size} L ${starX+size/4},${starY-size/4} L ${starX+size},${starY} L ${starX+size/4},${starY+size/4} 
                     L ${starX},${starY+size} L ${starX-size/4},${starY+size/4} L ${starX-size},${starY} L ${starX-size/4},${starY-size/4} Z" 
                  fill="gold" opacity="0.7">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="${animDuration}s" repeatCount="indefinite" />
              <animate attributeName="transform" type="rotate" values="0 ${starX} ${starY};360 ${starX} ${starY}" dur="${animDuration*3}s" repeatCount="indefinite" />
            </path>`;
        }
      }
      
      svgContent += `</svg>`;
      
      // Convert SVG to buffer
      const svgBuffer = Buffer.from(svgContent);
      
      // Save the generated image
      const filename = `enhanced-${Date.now()}.svg`;
      const outputPath = path.join(__dirname, '../images', filename);
      fs.writeFileSync(outputPath, svgBuffer);
      
      console.log(`Saved enhanced image to ${outputPath}`);
      
      return {
        text: `I've created an artistic interpretation based on your stick figure drawing and the prompt: "${prompt}". I've made the character more stylized and cool as requested.`,
        imageUrl: `/images/${filename}`
      };
      
    } catch (error) {
      console.error('Error creating enhanced image:', error);
      return { 
        text: `Sorry, I couldn't generate an enhanced image based on your drawing. The error was: ${error.message}`
      };
    }
    
  } catch (error) {
    console.error('Error in image-to-image generation:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

// Route to handle image generation requests
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('Received request to /api/gemini');
    console.log('Body:', req.body);
    
    // Log detailed information about the uploaded file
    if (req.file) {
      console.log('File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });
    } else {
      console.log('No file uploaded');
    }
    
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Get the uploaded image path if available
    const imagePath = req.file ? req.file.path : null;
    
    try {
      let result;
      if (imagePath) {
        // Use image-to-image generation
        result = await generateImageToImage(prompt, imagePath);
      } else {
        // Use text-to-image generation
        result = await generateTextToImage(prompt);
      }
      
      return res.json(result);
    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(500).json({ 
        error: 'Failed to process request',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 