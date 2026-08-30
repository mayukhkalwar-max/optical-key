const SHARED_SECRET = "MY_SECRET_KEY_123";
const DEVICE_LOCK_ID = "LOCK_01"; 

const BIT_DURATION_MS = 194; 

let isReadingPayload = false;
let bitBuffer = "";
let payloadBuffer = "";
let lastSampleTime = 0;

// Dynamic Ambient Floor Thresholding
let minObservedBrightness = 255;
let maxObservedBrightness = 0;

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const signalState = document.getElementById('signal-state');
const bufferVal = document.getElementById('buffer-val');
const decodedKey = document.getElementById('decoded-key');
const decodedKey2 = document.getElementById('decoded-key-2');
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

        // Target center region of camera
        const frameData = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2).data;
        let totalBrightness = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            totalBrightness += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (frameData.length / 4);

        // Auto-calibrate brightness range
        if (avgBrightness < minObservedBrightness) minObservedBrightness = avgBrightness;
        if (avgBrightness > maxObservedBrightness) maxObservedBrightness = avgBrightness;
        
        // Midpoint thresholding adapts to ambient room lighting
        const dynamicThreshold = (minObservedBrightness + maxObservedBrightness) / 2;
        const currentBit = (avgBrightness > dynamicThreshold && (maxObservedBrightness - minObservedBrightness > 30)) ? '1' : '0';

        if (timestamp - lastSampleTime >= BIT_DURATION_MS) {
            lastSampleTime = timestamp;
            sampleBit(currentBit, timestamp);
        }
    }
    requestAnimationFrame(processVideoFrame);
}

function sampleBit(bit, currentTimestamp) {
    signalState.innerText = bit === '1' ? 'HIGH (1)' : 'LOW (0)';
    
    // State 1: Capturing the 20-bit key after preamble sync
    if (isReadingPayload) {
        payloadBuffer += bit;
        bufferVal.innerText = payloadBuffer;
        // Skip first 8 stabilization bits and extract 20 payload bits
        if (payloadBuffer.length >= 30) {
            const token1 = payloadBuffer.substring(10, 30);
            const token2 = payloadBuffer.substring(9, 29);
            isReadingPayload = false;
            processPayload(token1, token2);
            bitBuffer = "";
            payloadBuffer = "";
        } else if (payloadBuffer.length > 7) {
            bufferVal.innerText = payloadBuffer.substring(8);
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
        
        // Phase-Lock: Offset next sample point by 1.5x bit length to sample center of bit
        lastSampleTime = currentTimestamp + (BIT_DURATION_MS / 2);

        lockStatus.className = "";
        lockStatus.innerText = "CAPTURING KEY... ⌛";
    }
}

function getHammingDistance(str1, str2) {
    let distance = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
        if (str1[i] !== str2[i]) distance++;
    }
    return distance + Math.abs(str1.length - str2.length);
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

function processPayload(token1, token2) {
    const expectedToken = generateExpectedToken();
    decodedKey.innerText = token1;
    decodedKey2.innerText = token2;

    // Allow 1-bit Hamming error window for camera frame rate dropouts
    const bitErrors1 = getHammingDistance(token1, expectedToken);
    const bitErrors2 = getHammingDistance(token2, expectedToken);
    if (bitErrors1 <= 1 || bitErrors2 <= 1) {
        lockStatus.className = "unlocked";
        lockStatus.innerText = `ACCESS GRANTED (${DEVICE_LOCK_ID}) 🔓`;
    } else {
        lockStatus.className = "invalid";
        lockStatus.innerText = `ACCESS DENIED ❌`;
    }

    setTimeout(() => {
        decodedKey.innerText = "NONE";
        decodedKey2.innerText = "NONE";
        bufferVal.innerText = "Waiting...";
        lockStatus.className = "";
        lockStatus.innerText = "LOCKED 🔒";
    }, 4000);
}
