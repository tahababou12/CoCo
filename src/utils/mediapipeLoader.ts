export const loadMediaPipe = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.Hands && window.Camera && window.drawConnectors) {
      console.log('MediaPipe already loaded');
      resolve();
      return;
    }

    console.log('Loading MediaPipe from CDN...');

    // Load MediaPipe scripts in correct order
    const scripts = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'
    ];

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolveScript, rejectScript) => {
        // Check if script already exists
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
          resolveScript();
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        
        script.onload = () => {
          console.log(`Loaded: ${src}`);
          resolveScript();
        };
        
        script.onerror = () => {
          console.error(`Failed to load: ${src}`);
          rejectScript(new Error(`Failed to load ${src}`));
        };
        
        document.head.appendChild(script);
      });
    };

    // Load scripts sequentially
    const loadSequentially = async () => {
      try {
        for (const src of scripts) {
          await loadScript(src);
        }

        // Wait for all modules to initialize
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        
        const checkLoaded = () => {
          if (window.Hands && window.Camera && window.drawConnectors && window.HAND_CONNECTIONS) {
            console.log('MediaPipe fully initialized');
            resolve();
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkLoaded, 100);
          } else {
            reject(new Error('MediaPipe modules failed to initialize after loading'));
          }
        };

        checkLoaded();
      } catch (error) {
        reject(error);
      }
    };

    loadSequentially();
  });
};

// Extend window interface
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}
