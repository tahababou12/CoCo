#!/bin/bash
# Update environment variables for HTTPS

DOMAIN=$1
if [ -z "$DOMAIN" ]; then
    echo "Usage: ./update-env-https.sh yourdomain.com"
    exit 1
fi

echo "🔄 Updating environment variables for HTTPS..."

# Update frontend environment
cat > .env << EOF
VITE_WS_URL=wss://${DOMAIN}/ws
VITE_API_URL=https://${DOMAIN}/api
VITE_AUTH0_DOMAIN=your-auth0-domain
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
EOF

# Update Vite config to allow the domain
echo "🔄 Updating Vite configuration for domain: $DOMAIN"
sed -i "s/'coco\.bragai\.tech'/'$DOMAIN'/g" vite.config.ts

echo "✅ Environment updated for domain: $DOMAIN"
echo "Frontend: https://$DOMAIN"
echo "API: https://$DOMAIN/api"
echo "WebSocket: wss://$DOMAIN/ws"

# Rebuild frontend with new environment
echo "🔄 Rebuilding frontend..."
pnpm run build

# Stop and restart services to pick up new config
echo "🔄 Restarting services..."
./ec2-stop.sh
sleep 2
./ec2-start.sh

echo "✅ Ready for HTTPS deployment!" 