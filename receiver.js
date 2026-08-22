const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 150; // Synced timing interval

let video, canvas, ctx;
let isRunning = false;

let minBrightness = 255;
let maxBrightness = 0;
let rawBitBuffer = "";
let lastSampleTime = 0;

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
        lastSampleTime = performance.now();
        requestAnimationFrame(processFrame);
    } catch (err) {
        alert("Unable to access camera: " + err.message);
    }
}

function calibrateNoise() {
    minBrightness = 255;
    maxBrightness = 0;
    rawBitBuffer = "";
    document.getElementById('buffer-val').innerText = "...";
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
        const currentBit = (range > 20 && avgBrightness > threshold) ? "1" : "0";

        document.getElementById('light-val').innerText = Math.round(avgBrightness);
        document.getElementById('thresh-val').innerText = Math.round(threshold);
        document.getElementById('bit-val').innerText = currentBit;

        if (currentTime - lastSampleTime >= BIT_DURATION_MS) {
            lastSampleTime = currentTime;
            rawBitBuffer += currentBit;

            if (rawBitBuffer.length > 30) rawBitBuffer = rawBitBuffer.slice(-30);
            document.getElementById('buffer-val').innerText = rawBitBuffer;

            const preambleIdx = rawBitBuffer.indexOf("1100");
            if (preambleIdx !== -1 && (rawBitBuffer.length - preambleIdx) >= 20) {
                const capturedToken = rawBitBuffer.substring(preambleIdx + 4, preambleIdx + 20);
                const expectedToken = generateExpectedToken();

                const statusElement = document.getElementById('lock-status');
                
                // STRICT SECURITY: Validates captured token against time-bucket hash
                if (capturedToken === expectedToken) {
                    statusElement.className = "unlocked";
                    statusElement.innerText = "ACCESS GRANTED! 🔓";
                } else {
                    statusElement.className = "invalid";
                    statusElement.innerText = `INVALID KEY ❌\n(Recv: ${capturedToken})`;
                }

                rawBitBuffer = "";
                setTimeout(() => {
                    statusElement.className = "";
                    statusElement.innerText = "LOCKED 🔒";
                    calibrateNoise();
                }, 3000);
            }
        }
    }
    requestAnimationFrame(processFrame);
}