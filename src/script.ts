
let micEnabled = true;
let paused = false;
let recording = false;
let time = 0;
let volumeLevel = 0;

let timer: any = null;
let silenceCounter = 0;
let lastActionTime = 0;
let lastClickTime = 0;

const CLICK_COOLDOWN = 400;

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

let raf: number | null = null;

// DOM
const statusEl = document.getElementById("status")!;
const volumeEl = document.getElementById("volume")!;
const video = document.getElementById("video") as HTMLVideoElement;
const container = document.getElementById("videoContainer")!;
const downloadLink = document.getElementById("downloadLink") as HTMLAnchorElement;
const micBtn = document.getElementById("micBtn")!;
const silenceToggle = document.getElementById("silenceToggle") as HTMLInputElement;
const toggleLabel = document.getElementById("toggleLabel")!;

// buttons
document.getElementById("startBtn")!.onclick = startRecording;
document.getElementById("pauseBtn")!.onclick = pauseRecording;
document.getElementById("resumeBtn")!.onclick = resumeRecording;
document.getElementById("stopBtn")!.onclick = stopRecording;
micBtn.onclick = toggleMic;

// toggle label update
silenceToggle.onchange = () => {
  toggleLabel.textContent = silenceToggle.checked
    ? "Silence Detection: ON"
    : "Silence Detection: OFF";
};

function formatTime(t: number) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(
    t % 60
  ).padStart(2, "0")}`;
}

function startTimer() {
  timer = setInterval(() => {
    time++;
    updateStatus();
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
}

function updateStatus() {
  if (!recording) return;

  const state = mediaRecorder?.state;
  paused = state === "paused";

  statusEl.innerText = `${paused ? "⏸️ Paused" : "🔴 Recording"} ${formatTime(time)}`;
  volumeEl.innerText = `Volume: ${volumeLevel}`;
}

/* -------------------- VOLUME DETECTION -------------------- */

function detectVolume() {
  const SILENCE_THRESHOLD = 10;
  const SOUND_THRESHOLD = 25;
  const SILENCE_FRAMES = 50;
  const COOLDOWN = 1200;

  if (!analyser) return;

  analyser.fftSize = 2048;
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    analyser!.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];

    const volume = sum / data.length;
    volumeLevel = Math.round(volume);

    const now = Date.now();

    if (volume < SILENCE_THRESHOLD) silenceCounter++;
    else silenceCounter = 0;

    // 🔥 ONLY RUN IF TOGGLE ON + MIC ON
    if (silenceToggle.checked && micEnabled) {

      if (
        silenceCounter > SILENCE_FRAMES &&
        mediaRecorder?.state === "recording" &&
        now - lastActionTime > COOLDOWN
      ) {
        mediaRecorder.pause();
        stopTimer();
        lastActionTime = now;
      }

      if (
        volume > SOUND_THRESHOLD &&
        mediaRecorder?.state === "paused" &&
        now - lastActionTime > COOLDOWN
      ) {
        mediaRecorder.resume();
        startTimer();
        lastActionTime = now;
      }
    }

    updateStatus();
    raf = requestAnimationFrame(loop);
  };

  loop();
}

/* -------------------- RECORDING -------------------- */

async function startRecording() {
  chunks = [];
  time = 0;

  container.classList.add("hidden");

  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
  });

  let micStream: MediaStream | null = null;

  if (micEnabled) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      micEnabled = false;
    }
  }

  const combinedStream = new MediaStream([
    ...screenStream.getVideoTracks(),
    ...(micStream ? micStream.getAudioTracks() : []),
  ]);

  stream = combinedStream;

  if (micStream) {
    audioContext = new AudioContext();
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);

    detectVolume();
  }

  screenStream.getVideoTracks()[0].onended = stopRecording;

  mediaRecorder = new MediaRecorder(combinedStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    video.src = url;
    downloadLink.href = url;
    downloadLink.download = "recording.webm";

    container.classList.remove("hidden");

    stream?.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start();

  recording = true;
  paused = false;

  startTimer();
  updateStatus();
}

function stopRecording() {
  mediaRecorder?.stop();

  if (raf) cancelAnimationFrame(raf);

  recording = false;
  paused = false;

  stopTimer();
  audioContext?.close();

  updateStatus();
}

/* -------------------- MANUAL CONTROLS -------------------- */

function pauseRecording() {
  const now = Date.now();
  if (now - lastClickTime < CLICK_COOLDOWN) return;
  lastClickTime = now;

  if (!mediaRecorder || mediaRecorder.state !== "recording") return;

  mediaRecorder.pause();
  stopTimer();
  updateStatus();
}

function resumeRecording() {
  const now = Date.now();
  if (now - lastClickTime < CLICK_COOLDOWN) return;
  lastClickTime = now;

  if (!mediaRecorder || mediaRecorder.state !== "paused") return;

  mediaRecorder.resume();
  startTimer();
  updateStatus();
}

function toggleMic() {
  stream?.getAudioTracks().forEach((t) => {
    t.enabled = !t.enabled;
  });

  micEnabled = !micEnabled;
  micBtn.textContent = micEnabled ? "Mic On 🎙️" : "Mic Off 🔇";
}