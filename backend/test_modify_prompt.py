import os
import requests
import time

BACKEND_URL = 'http://localhost:5001'
IMG_DIR = os.path.join(os.path.dirname(__file__), 'img')

def check_img_dir():
    if not os.path.exists(IMG_DIR):
        print(f"[TEST] WARNING: img/ directory does not exist at {IMG_DIR}")
        return False
    files = [f for f in os.listdir(IMG_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not files:
        print(f"[TEST] WARNING: No images found in img/ directory. Modification will fail.")
        return False
    print(f"[TEST] Found {len(files)} image(s) in img/: {files}")
    return True

# 1. Send a modification request with a custom prompt
def send_modify_request(prompt):
    resp = requests.post(f'{BACKEND_URL}/api/modify-image', json={'prompt': prompt})
    resp.raise_for_status()
    data = resp.json()
    print(f"[TEST] Sent prompt: {prompt}")
    print(f"[TEST] Response: {data}")
    return data.get('request_id')

# 2. Poll for completion
def poll_status(request_id, poll_interval=2, timeout=60):
    url = f'{BACKEND_URL}/api/modification-status/{request_id}'
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(url)
        if resp.status_code == 200:
            data = resp.json()
            print(f"[TEST] Status: {data.get('status')}")
            if data.get('status') in ('completed', 'complete', 'error'):
                return data
        else:
            print(f"[TEST] Status check failed: {resp.text}")
        time.sleep(poll_interval)
    raise TimeoutError("Modification did not complete in time.")

if __name__ == '__main__':
    if not check_img_dir():
        print("[TEST] Aborting test due to missing images.")
        exit(1)
    test_prompt = "Make the drawing look like a Van Gogh painting with swirling blue skies."
    request_id = send_modify_request(test_prompt)
    if not request_id:
        print("[TEST] No request_id returned!")
        exit(1)
    result = poll_status(request_id)
    print("\n[TEST] --- Final Backend Response ---")
    print(result)
    print(f"\n[TEST] Prompt used by backend: {result.get('prompt')}")
    if result.get('status') == 'error':
        print(f"\n[TEST] Error message: {result.get('message')}")
        if 'traceback' in result:
            print(f"[TEST] Traceback:\n{result['traceback']}") 