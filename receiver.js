const SHARED_SECRET = "MY_SECRET_KEY_123";
const DEVICE_LOCK_ID = "LOCK_01"; // Set to "LOCK_01" or "LOCK_02"
const BRIGHTNESS_THRESHOLD = 200; 
const BIT_SAMPLE_INTERVAL_MS = 200; // Matches transmitter rate (200ms)

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

        const frameData = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2).data;
        let totalBrightness = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            totalBrightness += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (frameData.length / 4);

        const currentBit = avgBrightness > BRIGHTNESS_THRESHOLD ? '1' : '0';

        if (timestamp - lastSampleTime >= BIT_SAMPLE_INTERVAL_MS) {
            lastSampleTime = timestamp;
            sampleBit(currentBit);
        }
    }
    requestAnimationFrame(processVideoFrame);
}

function sampleBit(bit) {
    signalState.innerText = bit === '1' ? 'HIGH (1)' : 'LOW (0)';
    
    // State 1: Capturing the 20-bit key after preamble sync
    if (isReadingPayload) {
        payloadBuffer += bit;
        bufferVal.innerText = payloadBuffer;

        if (payloadBuffer.length >= 20) {
            const capturedToken = payloadBuffer.substring(0, 20);
            isReadingPayload = false;
            processPayload(capturedToken);
            bitBuffer = "";
            payloadBuffer = "";
        }
        return;
    }

    // State 2: Searching for sync preamble sequence "111100"
    bitBuffer += bit;
    if (bitBuffer.length > 30) {
        bitBuffer = bitBuffer.slice(-30);
    }

    const preambleIdx = bitBuffer.indexOf("111100");
    if (preambleIdx !== -1) {
        isReadingPayload = true;
        payloadBuffer = "";
        bitBuffer = ""; 
        lockStatus.className = "";
        lockStatus.innerText = "CAPTURING KEY... ⌛";
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
        lockStatus.innerText = `ACCESS DENIED ❌`;
    }

    setTimeout(() => {
        decodedKey.innerText = "NONE";
        bufferVal.innerText = "Waiting...";
        lockStatus.className = "";
        lockStatus.innerText = "LOCKED 🔒";
    }, 4000);
}
