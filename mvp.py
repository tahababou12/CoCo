import cv2
import mediapipe as mp
import numpy as np

# Initialize MediaPipe Hand solution
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Initialize drawing canvas
canvas = None
prev_point = None
drawing_color = (0, 0, 255)  # Red color by default
drawing_thickness = 5

# Start webcam
cap = cv2.VideoCapture(1)
if not cap.isOpened():
    print("Cannot open camera")
    exit()

# Get initial frame to set canvas size
success, frame = cap.read()
if not success:
    print("Can't receive frame")
    exit()
    
h, w, _ = frame.shape
canvas = np.zeros((h, w, 3), dtype=np.uint8)

while True:
    # Read frame from webcam
    success, frame = cap.read()
    if not success:
        print("Can't receive frame")
        break
        
    # Flip the frame horizontally for a more intuitive mirror view
    frame = cv2.flip(frame, 1)
    
    # Convert BGR to RGB
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Process hand landmarks
    results = hands.process(rgb_frame)
    
    # Display canvas on frame
    combined_img = cv2.addWeighted(frame, 0.7, canvas, 0.3, 0)
    
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            # Draw hand landmarks
            mp_drawing.draw_landmarks(
                combined_img, 
                hand_landmarks, 
                mp_hands.HAND_CONNECTIONS
            )
            
            # Get landmarks positions
            landmarks = []
            for lm in hand_landmarks.landmark:
                landmarks.append([int(lm.x * w), int(lm.y * h)])
            
            # Check if index finger is extended and other fingers are closed
            # Index finger tip (landmark 8)
            index_finger_tip = landmarks[8]
            
            # Check if hand is open or closed by comparing positions
            thumb_tip = landmarks[4]
            index_mcp = landmarks[5]  # Index finger MCP joint
            middle_tip = landmarks[12]
            ring_tip = landmarks[16]
            pinky_tip = landmarks[20]
            wrist = landmarks[0]
            
            # Calculate distances to determine if fingers are extended
            fingers_extended = []
            
            # For thumb (using different method)
            thumb_extended = thumb_tip[0] < landmarks[3][0] if wrist[0] < index_mcp[0] else thumb_tip[0] > landmarks[3][0]
            fingers_extended.append(thumb_extended)
            
            # For other fingers (compare y-coordinate of tip with PIP joint)
            fingers_extended.append(landmarks[8][1] < landmarks[6][1])  # Index
            fingers_extended.append(landmarks[12][1] < landmarks[10][1])  # Middle
            fingers_extended.append(landmarks[16][1] < landmarks[14][1])  # Ring
            fingers_extended.append(landmarks[20][1] < landmarks[18][1])  # Pinky
            
            # If only index finger is extended (drawing mode)
            if fingers_extended[1] and not fingers_extended[2] and not fingers_extended[3] and not fingers_extended[4]:
                # Draw circle at index finger tip position
                cv2.circle(combined_img, tuple(index_finger_tip), 10, drawing_color, -1)
                
                # Draw line on canvas
                if prev_point:
                    cv2.line(canvas, prev_point, tuple(index_finger_tip), drawing_color, drawing_thickness)
                
                prev_point = tuple(index_finger_tip)
            else:
                # Reset previous point if hand is open (not drawing)
                prev_point = None
                
    else:
        # If no hand is detected, reset previous point
        prev_point = None
    
    # Display the resulting frame
    cv2.imshow('Hand Drawing', combined_img)
    
    # Controls
    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord('q'):  # Esc or q to quit
        break
    elif key == ord('c'):  # c to clear canvas
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
    elif key == ord('r'):  # r for red
        drawing_color = (0, 0, 255)
    elif key == ord('g'):  # g for green
        drawing_color = (0, 255, 0)
    elif key == ord('b'):  # b for blue
        drawing_color = (255, 0, 0)
    elif key == ord('+') or key == ord('='):  # + to increase thickness
        drawing_thickness = min(30, drawing_thickness + 1)
    elif key == ord('-'):  # - to decrease thickness
        drawing_thickness = max(1, drawing_thickness - 1)

# Release resources
cap.release()
cv2.destroyAllWindows()