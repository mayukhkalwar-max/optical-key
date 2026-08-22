const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; // Matches transmitter bit duration
const TOTAL_BITS = 19; // 2 preamble + 16 payload + 1 stop bit

let video, canvas, ctx;
let isRunning = false;

let baselineLight = 0;
let bitStream = "";
let lastSampleTime = 0;
let isSampling = false;

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
        calibrateBaseline();
        requestAnimationFrame(processFrame);
    } catch (err) {
        alert("Unable to access camera: " + err.message);
    }
}

function calibrateBaseline() {
    bitStream = "";
    isSampling = false;
    const bufDisp = document.getElementById('buffer-val');
    if (bufDisp) bufDisp.innerText = "Calibrating baseline ambient light...";
    
    setTimeout(() => {
        if (ctx && video) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameData = ctx.getImageData(70, 50, 20, 20).data;
            let sum = 0;
            for (let i = 0; i < frameData.length; i += 4) {
                sum += (frameData[i] + frameData[i+1] + frameData[i+2]) / 3;
            }
            baselineLight = sum / (frameData.length / 4);
            const threshDisp = document.getElementById('thresh-val');
            if (threshDisp) threshDisp.innerText = Math.round(baselineLight + 20);
            if (bufDisp) bufDisp.innerText = "Ready! Waiting for light pulse (Starts with 1)...";
        }
    }, 500);
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

        const frameData = ctx.getImageData(70, 50, 20, 20).data;
        let sum = 0;
        for (let i = 0; i < frameData.length; i += 4) {
            sum += (frameData[i] + frameData[i+1] + frameData[i+2]) / 3;
        }
        const currentLight = sum / (frameData.length / 4);

        const isLightOn = currentLight > (baselineLight + 20);
        const currentBit = isLightOn ? "1" : "0";

        const lightDisp = document.getElementById('light-val');
        const bitDisp = document.getElementById('bit-val');
        if (lightDisp) lightDisp.innerText = Math.round(currentLight);
        if (bitDisp) bitDisp.innerText = currentBit;

        // Triggers strictly on the first "1" bit pulse
        if (!isSampling) {
            if (currentBit === "1") {
                isSampling = true;
                bitStream = "1"; // Strictly starts with "1"
                lastSampleTime = currentTime;
                
                const bufDisp = document.getElementById('buffer-val');
                if (bufDisp) bufDisp.innerText = bitStream;
            }
        } else {
            // Clocked sampling loop
            if (currentTime - lastSampleTime >= BIT_DURATION_MS) {
                lastSampleTime = currentTime;
                bitStream += currentBit;

                const bufDisp = document.getElementById('buffer-val');
                if (bufDisp) bufDisp.innerText = bitStream;

                // Stop once full packet is collected
                if (bitStream.length >= TOTAL_BITS) {
                    verifyStream(bitStream);
                    isSampling = false;
                }
            }
        }
    }
    requestAnimationFrame(processFrame);
}

function verifyStream(stream) {
    const statusElement = document.getElementById('lock-status');
    
    // Expect header "11" followed by 16 bits data
    if (stream.startsWith("11") && stream.length >= 18) {
        const capturedToken = stream.substring(2, 18);
        const expectedToken = generateExpectedToken();

        if (capturedToken === expectedToken) {
            statusElement.className = "unlocked";
            statusElement.innerText = "ACCESS GRANTED! 🔓";
        } else {
            statusElement.className = "invalid";
            statusElement.innerText = `INVALID KEY ❌\n(Recv: ${capturedToken})`;
        }
    } else {
        statusElement.className = "invalid";
        statusElement.innerText = "SIGNAL ERROR ❌\n(Sync Header Missed)";
    }

    setTimeout(() => {
        statusElement.className = "";
        statusElement.innerText = "LOCKED 🔒";
        calibrateBaseline();
    }, 3000);
}
