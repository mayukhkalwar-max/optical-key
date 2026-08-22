const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 150; // Expected duration of a single bit

let video, canvas, ctx;
let isRunning = false;

let minBrightness = 255;
let maxBrightness = 0;
let rawBitBuffer = "";

// State tracking for pulse width measurement
let currentBitState = "0";
let lastStateChangeTime = 0;
let isReceivingSignal = false;

async function startReceiver() {
    video = document.getElementById('webcam');
    canvas = document.getElementById('analyzer-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    const startBtn = document.getElementById('start-btn');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: 640, height: 480 }
        });
        video.srcObject = stream;
        await video.play();

        canvas.width = 160;
        canvas.height = 120;

        if (startBtn) startBtn.style.display = 'none';
        isRunning = true;
        calibrateNoise();
        requestAnimationFrame(processFrame);
    } catch (err) {
        alert("Unable to access camera: " + err.message);
    }
}

function calibrateNoise() {
    minBrightness = 255;
    maxBrightness = 0;
    rawBitBuffer = "";
    isReceivingSignal = false;
    currentBitState = "0";
    lastStateChangeTime = performance.now();
    const bufDisp = document.getElementById('buffer-val');
    if (bufDisp) bufDisp.innerText = "Waiting for start bit (1)...";
}

function generateExpectedToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');
}

function processFrame(currentTime) {
    if (!isRunning) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const startX = Math.floor(canvas.width / 2) - 10;
        const startY = Math.floor(canvas.height / 2) - 10;
        const frameData = ctx.getImageData(startX, startY, 20, 20).data;

        let totalLuminance = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            totalLuminance += 0.299 * frameData[i] + 0.587 * frameData[i + 1] + 0.114 * frameData[i + 2];
        }
        const avgBrightness = totalLuminance / (frameData.length / 4);

        if (avgBrightness < minBrightness) minBrightness = avgBrightness;
        if (avgBrightness > maxBrightness) maxBrightness = avgBrightness;

        const range = maxBrightness - minBrightness;
        const threshold = minBrightness + (range * 0.5);
        const sampledBit = (range > 20 && avgBrightness > threshold) ? "1" : "0";

        document.getElementById('light-val').innerText = Math.round(avgBrightness);
        document.getElementById('thresh-val').innerText = Math.round(threshold);
        document.getElementById('bit-val').innerText = sampledBit;

        // Trigger reception only when the first '1' bit appears
        if (!isReceivingSignal) {
            if (sampledBit === "1") {
                isReceivingSignal = true;
                currentBitState = "1";
                lastStateChangeTime = currentTime;
                rawBitBuffer = "";
            }
            requestAnimationFrame(processFrame);
            return;
        }

        // Measure time spent in the current light state (1 or 0)
        if (sampledBit !== currentBitState) {
            const duration = currentTime - lastStateChangeTime;
            const bitCount = Math.max(1, Math.round(duration / BIT_DURATION_MS));

            rawBitBuffer += currentBitState.repeat(bitCount);
            document.getElementById('buffer-val').innerText = rawBitBuffer;

            currentBitState = sampledBit;
            lastStateChangeTime = currentTime;

            // Check buffer for preamble (1100) and 16-bit payload
            const preambleIdx = rawBitBuffer.indexOf("1100");
            if (preambleIdx !== -1 && (rawBitBuffer.length - preambleIdx) >= 20) {
                const capturedToken = rawBitBuffer.substring(preambleIdx + 4, preambleIdx + 20);
                const expectedToken = generateExpectedToken();

                const statusElement = document.getElementById('lock-status');
                
                if (capturedToken === expectedToken) {
                    statusElement.className = "unlocked";
                    statusElement.innerText = "ACCESS GRANTED! 🔓";
                } else {
                    statusElement.className = "invalid";
                    statusElement.innerText = `INVALID KEY ❌\n(Recv: ${capturedToken})`;
                }

                setTimeout(() => {
                    statusElement.className = "";
                    statusElement.innerText = "LOCKED 🔒";
                    calibrateNoise();
                }, 3000);
                
                return;
            }
        }
    }
    requestAnimationFrame(processFrame);
}
