# CoCo - AWS Deployment Guide

This document outlines the steps taken to deploy the CoCo collaborative drawing application to AWS.

## Architecture Overview

*   **Frontend:** React/Vite SPA served via AWS S3 and CloudFront.
*   **Backend:**
    *   Node.js WebSocket server (`websocket-server.js`) for real-time features.
    *   Python Flask API server (`app.py`) for AI features, storage, etc.
    *   Managed together by `server.js`.
*   **Hosting:** Backend runs on an AWS EC2 instance (Ubuntu).
*   **Proxy/SSL:** Nginx on the EC2 instance acts as a reverse proxy, handles SSL termination (via Certbot/Let's Encrypt), and routes traffic to the appropriate backend service or the frontend dev server.
*   **Domain:** `coco.bragai.tech` points to the EC2 instance.
*   **Authentication:** Auth0.

## Prerequisites

*   AWS Account
*   Registered Domain Name (e.g., `coco.bragai.tech`)
*   Locally installed:
    *   Git
    *   Node.js & npm
    *   Python & pip
    *   AWS CLI (configured with credentials)
*   API Keys:
    *   Google Gemini API Key
    *   ElevenLabs API Key
    *   Auth0 Domain and Client ID

## AWS Setup Steps

### 1. EC2 Instance Setup

1.  **Launch Instance:**
    *   Choose an **Ubuntu** AMI.
    *   Select an instance type (e.g., `t2.medium` or similar).
    *   **Network Settings:**
        *   Ensure it's in a **public subnet**.
        *   Enable **Auto-assign public IP** (or allocate and associate an Elastic IP later).
2.  **Configure Security Group:**
    *   Create a new security group.
    *   Add **Inbound Rules**:
        *   **SSH (Port 22):** Source: `My IP` (or specific trusted IPs).
        *   **HTTP (Port 80):** Source: `Anywhere (0.0.0.0/0)` (for Certbot validation and HTTP->HTTPS redirect).
        *   **HTTPS (Port 443):** Source: `Anywhere (0.0.0.0/0)` (for application access via Nginx).
    *   Keep default **Outbound Rules** (Allow all).
3.  **Connect via SSH:** Use your EC2 key pair.
    ```bash
    ssh -i /path/to/your/CoCo.pem ubuntu@YOUR_EC2_PUBLIC_IP
    ```
    *(Replace `YOUR_EC2_PUBLIC_IP` with the actual IP, e.g., `18.224.56.68`)*

### 2. DNS Configuration

*   Point your domain (`coco.bragai.tech`) to the Public IP address of your EC2 instance using an `A` record in your DNS provider's settings (e.g., Route 53, GoDaddy, Cloudflare).

### 3. S3 Bucket for Static Frontend Files (Optional - Currently using EC2 for dev server)

*If you decide to serve the production build from S3:*

1.  **Create Bucket:**
    *   Go to the S3 service in the AWS Console.
    *   Choose a unique bucket name (e.g., `coco-frontend-prod`).
    *   Select the desired AWS Region.
2.  **Permissions:**
    *   **Block Public Access:** Uncheck "Block *all* public access" (acknowledge warning).
    *   **Object Ownership:** Select "ACLs disabled (recommended)".
3.  **Static Website Hosting:**
    *   Go to bucket "Properties" -> "Static website hosting".
    *   Enable it.
    *   Set "Index document" and "Error document" to `index.html`.
    *   Note the **Bucket website endpoint**.
4.  **Bucket Policy (If Public):**
    *   Go to bucket "Permissions" -> "Bucket policy".
    *   Add a policy to allow public read (replace `your-bucket-name`):
      ```json
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/*"
          }
        ]
      }
      ```
5.  **CORS Configuration:**
    *   Go to bucket "Permissions" -> "Cross-origin resource sharing (CORS)".
    *   Add configuration:
      ```json
      [
        {
          "AllowedHeaders": ["*"],
          "AllowedMethods": ["GET", "HEAD"],
          "AllowedOrigins": ["*"],
          "ExposeHeaders": ["ETag"]
        }
      ]
      ```

### 4. CloudFront Distribution (Optional - Currently using EC2 for dev server)

*If serving frontend from S3:*

1.  **Create Distribution:**
    *   Go to the CloudFront service.
    *   **Origin Domain:** Select the S3 bucket's **REST API endpoint** (e.g., `your-bucket-name.s3.amazonaws.com`). **Do NOT use the website endpoint.**
    *   **Origin Access:** Select "Origin access control settings (recommended)" and create/use an OAC. CloudFront will provide a bucket policy to apply to S3.
    *   **Viewer Protocol Policy:** Select "Redirect HTTP to HTTPS".
    *   **Allowed HTTP Methods:** Select "GET, HEAD".
    *   **Default Root Object:** Enter `index.html`.
2.  **Error Pages:**
    *   Go to the distribution's "Error pages" tab.
    *   Create custom error responses for HTTP codes `403` and `404`.
    *   Set "Response page path" to `/index.html` and "HTTP response code" to `200` for both.
3.  Note the **Distribution domain name** (e.g., `dxxxxxxxxx.cloudfront.net`). You would typically point your main domain (`coco.bragai.tech`) to this via a CNAME record if using CloudFront for the frontend.

## Deployment Steps

### 1. Backend Setup (EC2 Instance)

1.  **Install Dependencies:**
    ```bash
    sudo apt update
    sudo apt install nginx nodejs npm python3-pip python3-venv git -y
    ```
2.  **Clone Repository:**
    ```bash
    git clone https://github.com/tahababou12/CoCo.git
    cd CoCo
    ```
3.  **Setup Backend:**
    ```bash
    cd backend
    ./setup-all.sh
    ```
4.  **Configure Backend Environment:**
    ```bash
    nano .env
    ```
    *   Add your API keys:
      ```dotenv
      GOOGLE_API_KEY=your_gemini_api_key
      ELEVENLABS_API_KEY=your_elevenlabs_api_key
      ```
    *   Save and close (Ctrl+O, Enter, Ctrl+X).
5.  **Install PM2:**
    ```bash
    sudo npm install -g pm2
    ```
6.  **Start Backend with PM2:** (This starts both Flask API and WebSocket server via `server.js`)
    ```bash
    pm2 start server.js --name coco-server
    ```
7.  **Enable PM2 Startup on Reboot:**
    ```bash
    pm2 startup
    # Follow the instructions output by the command (copy/paste and run it)
    pm2 save
    ```
8.  **Check Status:**
    ```bash
    pm2 status
    ```

### 2. Nginx Setup (EC2 Instance)

1.  **Add WebSocket Map Directive:**
    ```bash
    sudo nano /etc/nginx/nginx.conf
    ```
    *   Inside the `http { ... }` block, add:
      ```nginx
      map $http_upgrade $connection_upgrade {
          default upgrade;
          ''      close;
      }
      ```
    *   Save and close.
2.  **Create Nginx Site Configuration:**
    ```bash
    sudo nano /etc/nginx/sites-available/coco
    ```
    *   Paste the following configuration:
      ```nginx
      server {
          listen 80;
          server_name coco.bragai.tech;
          # Redirect all HTTP requests to HTTPS (Certbot might manage this too)
          return 301 https://$host$request_uri;
      }

      server {
          listen 443 ssl http2;
          server_name coco.bragai.tech;

          # SSL Configuration - Certbot will add these lines automatically later
          # ssl_certificate /etc/letsencrypt/live/coco.bragai.tech/fullchain.pem;
          # ssl_certificate_key /etc/letsencrypt/live/coco.bragai.tech/privkey.pem;
          # include /etc/letsencrypt/options-ssl-nginx.conf;
          # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

          # API server proxy
          location /api/ {
              proxy_pass http://localhost:5001/;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection 'upgrade';
              proxy_set_header Host $host;
              proxy_cache_bypass $http_upgrade;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              client_max_body_size 10M;
          }

          # WebSocket server proxy
          location /ws/ {
              proxy_pass http://localhost:8080/;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection $connection_upgrade; # Uses the map variable
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_read_timeout 86400;
          }

          # Proxy to Frontend Vite Dev Server
          location / {
              proxy_pass http://localhost:5174; # Vite default dev port
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade"; # Vite HMR needs this specific value
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_read_timeout 86400;
          }

          # Logging
          access_log /var/log/nginx/coco-access.log;
          error_log /var/log/nginx/coco-error.log;
      }
      ```
    *   Save and close.
3.  **Enable the Site:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/coco /etc/nginx/sites-enabled/
    ```
4.  **Test Nginx Configuration:** (It might initially fail on SSL before running Certbot)
    ```bash
    sudo nginx -t
    ```
5.  **Configure Firewall:**
    ```bash
    sudo ufw allow 'Nginx Full'
    sudo ufw enable # If not already enabled
    sudo ufw status
    ```
6.  **Install Certbot:**
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```
7.  **Run Certbot:** (Ensure DNS for `coco.bragai.tech` points to the EC2 IP)
    ```bash
    sudo certbot --nginx -d coco.bragai.tech
    ```
    *   Follow prompts (email, terms).
    *   Choose **option 2 (Redirect)** when asked about HTTP to HTTPS.
8.  **Test Final Nginx Config:**
    ```bash
    sudo nginx -t
    ```
9.  **Restart Nginx:**
    ```bash
    sudo systemctl restart nginx
    ```

### 3. Frontend Setup

1.  **Configure Frontend Environment:**
    *   Navigate to the project root (`cd ~/CoCo`).
    *   ```bash
      nano .env
      ```
    *   Ensure the file contains (replace placeholders):
      ```dotenv
      VITE_AUTH0_DOMAIN=your_auth0_domain
      VITE_AUTH0_CLIENT_ID=your_auth0_client_id
      VITE_API_URL=https://coco.bragai.tech/api
      VITE_WS_URL=wss://coco.bragai.tech/ws
      ```
    *   Save and close.
2.  **Configure Vite Dev Server:**
    ```bash
    nano vite.config.ts
    ```
    *   Update the `server` section:
      ```typescript
      server: {
        host: '0.0.0.0', // Listen on all interfaces
        port: 5174,      // Ensure this matches Nginx proxy_pass port
        strictPort: true,
        allowedHosts: ['coco.bragai.tech'], // Allow access via domain
      }
      ```
    *   Save and close.
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
4.  **Run Development Server:** (Use PM2 for better management)
    ```bash
    # Option 1: PM2 (Recommended)
    pm2 start npm --name coco-frontend -- run dev

    # Option 2: nohup
    # nohup npm run dev &
    # tail -f nohup.out # To view logs
    ```
5.  **Check Status:**
    ```bash
    pm2 status
    ```

**(Production Alternative: Build and Deploy to S3)**

1.  **Build:**
    ```bash
    npm run build
    ```
2.  **Upload to S3:**
    ```bash
    aws s3 sync dist/ s3://your-bucket-name/ --delete
    ```
3.  **Invalidate CloudFront:**
    ```bash
    aws cloudfront create-invalidation --distribution-id YOUR_CLOUDFRONT_ID --paths "/*"
    ```
4.  **(If using S3/CloudFront):** Update the Nginx `location / { ... }` block to serve a maintenance page or remove it if Nginx isn't serving the frontend.

### 4. Auth0 Configuration

*   Go to your Auth0 Application settings.
*   Add `https://coco.bragai.tech` to:
    *   Allowed Callback URLs
    *   Allowed Logout URLs
    *   Allowed Web Origins

## Running the Application

1.  **Start/Ensure Backend is Running:**
    ```bash
    pm2 restart coco-server # Or pm2 start if not running
    pm2 status
    ```
2.  **Start/Ensure Frontend Dev Server is Running (Current Setup):**
    ```bash
    pm2 restart coco-frontend # Or pm2 start if not running
    pm2 status
    ```
3.  **Ensure Nginx is Running:**
    ```bash
    sudo systemctl status nginx
    # If needed: sudo systemctl restart nginx
    ```
4.  **Access:** Open `https://coco.bragai.tech` in your browser.

## Notes

*   **Development Server:** The current setup uses the Vite **development server** (`npm run dev`) proxied via Nginx. This is **not recommended for production** due to performance and security implications. For production, build the frontend (`npm run build`) and serve the static files from the `dist/` directory using either S3/CloudFront or configuring Nginx to serve them directly.
*   **Storage:** Enhanced images and videos are currently stored on the EC2 instance's local filesystem. For scalability and durability in production, consider using AWS S3 for storing this media.
