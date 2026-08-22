const SHARED_SECRET = "MY_SECRET_KEY_123";

let video, canvas, ctx;
let isRunning = false;

let minBrightness = 255;
let maxBrightness = 0;

// Pulse Tracking Engine
let samples = [];
let isCapturing = false;

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
    samples = [];
    isCapturing = false;
    const bufDisp = document.getElementById('buffer-val');
    if (bufDisp) bufDisp.innerText = "Waiting for flash sequence...";
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
        const currentBit = (range > 20 && avgBrightness > threshold) ? 1 : 0;

        document.getElementById('light-val').innerText = Math.round(avgBrightness);
        document.getElementById('thresh-val').innerText = Math.round(threshold);
        document.getElementById('bit-val').innerText = currentBit;

        // Trigger on light pulse rising edge
        if (!isCapturing && currentBit === 1) {
            isCapturing = true;
            samples = [];
        }

        if (isCapturing) {
            samples.push({ bit: currentBit, time: currentTime });

            // Automatically analyze once enough raw frame samples are collected (~4 seconds)
            if (samples.length >= 75) {
                decodeCapturedStream();
                isCapturing = false;
            }
        }
    }
    requestAnimationFrame(processFrame);
}

function decodeCapturedStream() {
    // 1. Identify state transitions (Edge detection)
    let transitions = [];
    for (let i = 1; i < samples.length; i++) {
        if (samples[i].bit !== samples[i - 1].bit) {
            transitions.push(samples[i].time);
        }
    }

    if (transitions.length < 4) {
        calibrateNoise();
        return;
    }

    // 2. Auto-calculate Bit Clock Speed from the preamble duration
    let bitDurationEstimate = (transitions[2] - transitions[0]) / 2; // Duration of '11' preamble
    if (bitDurationEstimate < 80 || bitDurationEstimate > 300) bitDurationEstimate = 150;

    // 3. Resample at estimated bit center points
    let decodedBits = "";
    let startTime = samples[0].time;
    let endTime = samples[samples.length - 1].time;

    for (let t = startTime + (bitDurationEstimate / 2); t < endTime; t += bitDurationEstimate) {
        // Find closest sample in time
        let closestSample = samples.reduce((prev, curr) => 
            Math.abs(curr.time - t) < Math.abs(prev.time - t) ? curr : prev
        );
        decodedBits += closestSample.bit;
    }

    document.getElementById('buffer-val').innerText = decodedBits;

    // 4. Verify decoded binary payload
    const preambleIdx = decodedBits.indexOf("1100");
    if (preambleIdx !== -1 && (decodedBits.length - preambleIdx) >= 20) {
        const capturedToken = decodedBits.substring(preambleIdx + 4, preambleIdx + 20);
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
    } else {
        calibrateNoise();
    }
}
