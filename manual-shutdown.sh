#!/bin/bash

echo "🛑 Triggering manual shutdown of CoCo servers..."
echo "shutdown" > /tmp/coco_shutdown
echo "✅ Shutdown signal sent. Servers should stop within 10 seconds."
echo "💡 If servers don't stop, you can also run: ./stop-all-servers.sh" 