const SHARED_SECRET = "MY_SECRET_KEY_123";
const DEVICE_LOCK_ID = "LOCK_01"; // Change to "LOCK_02" for second lock target
const BRIGHTNESS_THRESHOLD = 200; // Adjust (0-255) based on room lighting
const BIT_SAMPLE_INTERVAL_MS = 100;

let isReadingPayload = false;
let bitBuffer = "";
let payloadBuffer = "";
let lastSampleTime = 0;

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const signalState = document.getElementById('signal-state');
const bufferVal = document.getElementById('buffer-val');
const decodedKey = document.getElementById('decoded-key');
const lockStatus = document.getElementById('lock-status');

// Initialize Laptop Webcam Stream
navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
    .then(stream => {
        video.srcObject = stream;
        video.play();
        requestAnimationFrame(processVideoFrame);
    })
    .catch(err => console.error("Camera access denied:", err));

function processVideoFrame(timestamp) {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Analyze center region luminosity
        const frameData = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2).data;
        let totalBrightness = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            totalBrightness += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (frameData.length / 4);

        // Convert brightness to bit state
        const currentBit = avgBrightness > BRIGHTNESS_THRESHOLD ? '1' : '0';

        // Sample at fixed 100ms timing interval
        if (timestamp - lastSampleTime >= BIT_SAMPLE_INTERVAL_MS) {
            lastSampleTime = timestamp;
            sampleBit(currentBit);
        }
    }
    requestAnimationFrame(processVideoFrame);
}

function sampleBit(bit) {
    if (signalState) signalState.innerText = bit === '1' ? 'HIGH (1)' : 'LOW (0)';

    // Phase 2: Capturing the 20-bit key payload after preamble detection
    if (isReadingPayload) {
        payloadBuffer += bit;
        if (bufferVal) bufferVal.innerText = payloadBuffer;

        if (payloadBuffer.length >= 20) {
            const capturedToken = payloadBuffer.substring(0, 20);
            isReadingPayload = false;
            processPayload(capturedToken);
            bitBuffer = "";
            payloadBuffer = "";
        }
        return;
    }

    // Phase 1: Scanning incoming bits for preamble sequence "111100"
    bitBuffer += bit;
    if (bitBuffer.length > 20) {
        bitBuffer = bitBuffer.slice(-20);
    }

    const preambleIdx = bitBuffer.indexOf("111100");
    if (preambleIdx !== -1) {
        isReadingPayload = true;
        payloadBuffer = "";
        bitBuffer = ""; // Flush preamble from buffer
        if (lockStatus) {
            lockStatus.className = "";
            lockStatus.innerText = "CAPTURING KEY... ⌛";
        }
    }
}

function generateExpectedToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + DEVICE_LOCK_ID + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) & 0xFFFFF).toString(2).padStart(20, '0');
}

function processPayload(capturedToken) {
    const expectedToken = generateExpectedToken();
    if (decodedKey) decodedKey.innerText = capturedToken;

    if (capturedToken === expectedToken) {
        if (lockStatus) {
            lockStatus.className = "unlocked";
            lockStatus.innerText = `ACCESS GRANTED (${DEVICE_LOCK_ID}) 🔓`;
        }
    } else {
        if (lockStatus) {
            lockStatus.className = "invalid";
            lockStatus.innerText = `ACCESS DENIED ❌\nToken Mismatch`;
        }
    }

    // Reset interface back to listening mode after 4 seconds
    setTimeout(() => {
        if (decodedKey) decodedKey.innerText = "NONE";
        if (bufferVal) bufferVal.innerText = "Waiting...";
        if (lockStatus) {
            lockStatus.className = "";
            lockStatus.innerText = "LOCKED 🔒";
        }
    }, 4000);
}
