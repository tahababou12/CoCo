import cv2
import mediapipe as mp

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# Initialize MediaPipe Hands
hands = mp_hands.Hands(min_detection_confidence=0.7, min_tracking_confidence=0.7)

# Start video capture
cap = cv2.VideoCapture(1)

def is_fist(landmarks):
    # Tip landmarks for each finger (excluding thumb)
    finger_tips = [8, 12, 16, 20]
    finger_pips = [6, 10, 14, 18]  # PIP joints of fingers

    closed_fingers = 0
    for tip, pip in zip(finger_tips, finger_pips):
        if landmarks[tip].y > landmarks[pip].y:
            closed_fingers += 1

    return closed_fingers == 4

while True:
    success, frame = cap.read()
    if not success:
        break

    frame = cv2.flip(frame, 1)  # Flip the image horizontally
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)

    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
            
            if is_fist(hand_landmarks.landmark):
                cv2.putText(frame, "Fist Detected!", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 4)

    cv2.imshow("Hand Tracker", frame)
    if cv2.waitKey(1) & 0xFF == 27:  # ESC to quit
        break

cap.release()
cv2.destroyAllWindows()
