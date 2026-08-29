const SHARED_SECRET = "MY_SECRET_KEY_123";
const DEVICE_LOCK_ID = "LOCK_01"; // Set to "LOCK_01" or "LOCK_02"
const BRIGHTNESS_THRESHOLD = 200; // Pixel brightness threshold (0-255)
const BIT_SAMPLE_INTERVAL_MS = 100;

let isReading = false;
let bitBuffer = "";
let lastSampleTime = 0;

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const signalState = document.getElementById('signal-state');
const bufferVal = document.getElementById('buffer-val');
const decodedKey = document.getElementById('decoded-key');
const lockStatus = document.getElementById('lock-status');

// Initialize WebCam stream
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

        // Calculate average luminosity at center of webcam view
        const frameData = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2).data;
        let totalBrightness = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            totalBrightness += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (frameData.length / 4);

        // Determine if light is High (1) or Low (0)
        const currentBit = avgBrightness > BRIGHTNESS_THRESHOLD ? '1' : '0';

        // Sample bit every 100ms
        if (timestamp - lastSampleTime >= BIT_SAMPLE_INTERVAL_MS) {
            lastSampleTime = timestamp;
            sampleBit(currentBit);
        }
    }
    requestAnimationFrame(processVideoFrame);
}

function sampleBit(bit) {
    signalState.innerText = bit === '1' ? 'HIGH (1)' : 'LOW (0)';
    bitBuffer += bit;

    if (bitBuffer.length > 50) {
        bitBuffer = bitBuffer.slice(-50); // Keep buffer light
    }

    // Dynamic Initialization: Look for Preamble "1100"
    const preambleIdx = bitBuffer.indexOf("1100");
    if (preambleIdx !== -1) {
        if (!isReading) {
            isReading = true;
            lockStatus.className = "";
            lockStatus.innerText = "READING 20 BITS... ⌛";
        }

        const capturedStream = bitBuffer.substring(preambleIdx + 4);
        bufferVal.innerText = capturedStream;

        // STOP CONDITION: Automatically stops after receiving exactly 20 payload bits
        if (capturedStream.length >= 20) {
            const capturedToken = capturedStream.substring(0, 20);
            processPayload(capturedToken);
            bitBuffer = ""; // Reset buffer
            isReading = false;
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
    decodedKey.innerText = capturedToken;

    if (capturedToken === expectedToken) {
        lockStatus.className = "unlocked";
        lockStatus.innerText = `ACCESS GRANTED (${DEVICE_LOCK_ID}) 🔓`;
    } else {
        lockStatus.className = "invalid";
        lockStatus.innerText = `ACCESS DENIED ❌\nWrong Lock Key`;
    }

    setTimeout(() => {
        decodedKey.innerText = "NONE";
        bufferVal.innerText = "Waiting...";
        lockStatus.className = "";
        lockStatus.innerText = "LOCKED 🔒";
    }, 4000);
}
