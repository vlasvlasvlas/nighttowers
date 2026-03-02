import * as Tone from 'tone';

// UI Elements
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const scene = document.getElementById('scene');
const svgConnections = document.getElementById('connections');
const beacons = Array.from(document.querySelectorAll('.main-node'));

// HUD & panels
const hudActions = document.getElementById('hud-actions');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const clearBtn = document.getElementById('clearBtn');
const helpBtn = document.getElementById('helpBtn');
const helpPanel = document.getElementById('helpPanel');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const ditherBtn = document.getElementById('ditherBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

const faders = {
    master: document.getElementById('masterVolume'),
    reverb: document.getElementById('masterReverb'),
    delay: document.getElementById('masterDelay'),
    drift: document.getElementById('skyDrift'),
    drones: document.getElementById('vol-drones'),
    noise: document.getElementById('vol-noise'),
    metal: document.getElementById('vol-metal'),
    synths: document.getElementById('vol-synths'),
    pads: document.getElementById('vol-pads'),
    balizas: document.getElementById('vol-balizas')
};

const mutes = {
    drones: document.getElementById('mute-drones'),
    noise: document.getElementById('mute-noise'),
    metal: document.getElementById('mute-metal'),
    synths: document.getElementById('mute-synths'),
    pads: document.getElementById('mute-pads'),
    balizas: document.getElementById('mute-balizas')
};

// State of the 18 antennas/stars (0: off, 1: on)
const TOTAL_NODES = 18;
const activeNodes = new Array(TOTAL_NODES).fill(false);
const synths = [];

// Global Audio Space
Tone.Destination.volume.value = 0;
const masterReverb = new Tone.Reverb(10).toDestination();
masterReverb.wet.value = 0.6;
const masterDelay = new Tone.FeedbackDelay("2n", 0.7).connect(masterReverb);

// Channel Buses for SOTA Mixer
const channels = {
    drones: new Tone.Channel().connect(masterReverb),
    noise: new Tone.Channel().connect(masterDelay),
    metal: new Tone.Channel().connect(masterDelay),
    synths: new Tone.Channel().connect(masterDelay),
    pads: new Tone.Channel().connect(masterReverb),
    balizas: new Tone.Channel().connect(masterDelay)
};

// ======= EGA DITHER ENGINE (Bayer 4×4 ordered dithering, EGA 16-color palette) =======
const EGA = [
    [0,0,0],       [0,0,170],     [0,170,0],     [0,170,170],
    [170,0,0],     [170,0,170],   [170,85,0],    [170,170,170],
    [85,85,85],    [85,85,255],   [85,255,85],   [85,255,255],
    [255,85,85],   [255,85,255],  [255,255,85],  [255,255,255]
];
// Classic Bayer 4×4 ordered dither matrix
const BAYER4 = [
    [0,8,2,10], [12,4,14,6], [3,11,1,9], [15,7,13,5]
];
let egaCanvas = null, egaCtx = null;

function nearestEGA(r, g, b) {
    let best = 0, bestD = 1e9;
    for (let i = 0; i < 16; i++) {
        const dr = r - EGA[i][0], dg = g - EGA[i][1], db = b - EGA[i][2];
        const d = dr*dr + dg*dg + db*db;
        if (d < bestD) { bestD = d; best = i; }
    }
    return EGA[best];
}

function egaSkyColor(t) {
    // t: 0 = top, 1 = bottom of sky area
    // Strategy: wide SOLID EGA-matching zones, narrow transition seams.
    // Solid zones map directly to exact EGA colors so dither has no effect there.
    // Seams interpolate between adjacent EGA colors → dither creates a 50/50 mix.
    if (t < 0.08) {
        // Top: pure black fading in
        return [0, 0, Math.round(t / 0.08 * 20)];
    } else if (t < 0.18) {
        // Seam: black → dark blue
        const p = (t - 0.08) / 0.10;
        return [0, 0, Math.round(20 + p * 150)]; // 20→170
    } else if (t < 0.44) {
        // Wide solid dark blue band — EGA #0000AA = [0,0,170]
        return [0, 0, 170];
    } else if (t < 0.56) {
        // Seam: dark blue → bright blue
        const p = (t - 0.44) / 0.12;
        return [Math.round(p * 85), Math.round(p * 85), Math.round(170 + p * 85)]; // [0,0,170]→[85,85,255]
    } else if (t < 0.66) {
        // Narrow bright blue band — EGA #5555FF = [85,85,255]
        return [85, 85, 255];
    } else if (t < 0.76) {
        // Seam: bright blue → dark blue
        const p = (t - 0.66) / 0.10;
        return [Math.round(85 - p * 85), Math.round(85 - p * 85), 255];
    } else if (t < 0.88) {
        // Solid dark blue again
        return [0, 0, Math.round(255 - (t - 0.76) / 0.12 * 85)]; // 255→170
    } else {
        // Fade to near-black at horizon
        const p = (t - 0.88) / 0.12;
        return [0, 0, Math.round(170 - p * 168)];
    }
}

function renderEGAFrame() {
    if (!egaCanvas || !egaCtx) return;
    const W = egaCanvas.width, H = egaCanvas.height;
    const img = egaCtx.createImageData(W, H);
    const d = img.data;
    const skyH = Math.floor(H * 0.64);
    // Dither spread: small enough so solid EGA zones stay solid
    // (bval 0-15 → normalized -0.5..+0.5 * spread)
    const SPREAD = 20;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const bval = BAYER4[y & 3][x & 3];
            const thr  = (bval / 15 - 0.5) * SPREAD; // ±10
            let r, g, b;
            if (y < skyH) {
                [r, g, b] = egaSkyColor(y / skyH);
            } else {
                // Ground: near-black, tiny blue tint, no dither needed
                const gt = (y - skyH) / (H - skyH);
                r = 0; g = 0; b = Math.round(12 - gt * 12);
            }
            const [qr, qg, qb] = nearestEGA(
                Math.max(0, Math.min(255, r + thr)),
                Math.max(0, Math.min(255, g + thr)),
                Math.max(0, Math.min(255, b + thr))
            );
            const idx = (y * W + x) * 4;
            d[idx] = qr; d[idx+1] = qg; d[idx+2] = qb; d[idx+3] = 255;
        }
    }
    egaCtx.putImageData(img, 0, 0);
}

function startEGADither() {
    egaCanvas = document.getElementById('ega-canvas');
    const sc = scene.getBoundingClientRect();
    // Scale 3: 3×3 px blocks — authentic EGA 320×200 feel
    egaCanvas.width  = Math.ceil(sc.width  / 3);
    egaCanvas.height = Math.ceil(sc.height / 3);
    egaCtx = egaCanvas.getContext('2d');
    renderEGAFrame();
    startEGADither._onResize = () => {
        const s = scene.getBoundingClientRect();
        egaCanvas.width  = Math.ceil(s.width  / 3);
        egaCanvas.height = Math.ceil(s.height / 3);
        renderEGAFrame();
    };
    window.addEventListener('resize', startEGADither._onResize);
}

function stopEGADither() {
    if (startEGADither._onResize) {
        window.removeEventListener('resize', startEGADither._onResize);
        startEGADither._onResize = null;
    }
}
// ======= END EGA DITHER ENGINE =======

// Overload Audio Elements
let baseDrone;
let arpeggiatorPattern;

startBtn.addEventListener('click', async () => {
    await Tone.start();
    initAudio();

    // Add click listeners to all nodes
    beacons.forEach((beacon) => {
        const id = parseInt(beacon.getAttribute('data-id'));
        beacon.addEventListener('click', () => toggleNode(id, beacon));
    });

    Tone.Transport.start();

    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.classList.add('hidden');
        scene.classList.remove('hidden');
        hudActions.classList.remove('hidden');
    }, 2000);
});

// Settings Handlers — same button toggles open/close
settingsBtn.addEventListener('click', () => {
    const isOpen = !settingsPanel.classList.contains('hidden');
    helpPanel.classList.add('hidden');
    settingsPanel.classList.toggle('hidden', isOpen);
});
closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});
helpBtn.addEventListener('click', () => {
    const isOpen = !helpPanel.classList.contains('hidden');
    settingsPanel.classList.add('hidden');
    helpPanel.classList.toggle('hidden', isOpen);
});
closeHelpBtn.addEventListener('click', () => {
    helpPanel.classList.add('hidden');
});
ditherBtn.addEventListener('click', () => {
    const active = document.body.classList.toggle('dither-mode');
    ditherBtn.classList.toggle('active', active);
    if (active) startEGADither();
    else stopEGADither();
});
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.classList.toggle('fullscreen-active', !!document.fullscreenElement);
});
clearBtn.addEventListener('click', () => {
    beacons.forEach((beacon) => {
        const id = parseInt(beacon.getAttribute('data-id'));
        if (activeNodes[id]) toggleNode(id, beacon);
    });
});

// Fader Bindings
faders.master.addEventListener('input', (e) => Tone.Destination.volume.rampTo(e.target.value, 0.1));
faders.reverb.addEventListener('input', (e) => masterReverb.wet.rampTo(e.target.value, 0.1));
faders.delay.addEventListener('input', (e) => masterDelay.wet.rampTo(e.target.value, 0.1));
faders.drones.addEventListener('input', (e) => channels.drones.volume.rampTo(e.target.value, 0.1));
faders.noise.addEventListener('input', (e) => channels.noise.volume.rampTo(e.target.value, 0.1));
faders.metal.addEventListener('input', (e) => channels.metal.volume.rampTo(e.target.value, 0.1));
faders.synths.addEventListener('input', (e) => channels.synths.volume.rampTo(e.target.value, 0.1));
faders.pads.addEventListener('input', (e) => channels.pads.volume.rampTo(e.target.value, 0.1));
faders.balizas.addEventListener('input', (e) => channels.balizas.volume.rampTo(e.target.value, 0.1));

// Deriva: star drift speed + reverb decay coupling
faders.drift.addEventListener('input', (e) => {
    const secs = parseFloat(e.target.value);
    document.getElementById('sky-layer').style.animationDuration = secs + 's';
    // Slower drift = longer, deeper reverb; faster = shorter
    const decay = 2 + ((secs - 60) / (3600 - 60)) * 18; // maps 60-3600s to 2-20s
    masterReverb.decay = decay;
});

// Mute Bindings
Object.keys(mutes).forEach(key => {
    mutes[key].addEventListener('click', (e) => {
        channels[key].mute = !channels[key].mute;
        e.target.classList.toggle('muted', channels[key].mute);
    });
});

function initAudio() {
    Tone.Transport.bpm.value = 40;

    // --- TERRESTRIAL NODES (0-8) ---
    synths.push(createNoise("brown", 150, channels.noise)); // 0
    synths.push(createMetalLoop(1, "C2", "4n", channels.metal)); // 1

    // 2. Base Drone (Will be modulated on Overload)
    baseDrone = createDrone("C1", 0.5, 5, channels.drones);
    synths.push(baseDrone);

    synths.push(createStaticLoop(3, "4n", ["C5", "Eb5", "G5"], channels.synths)); // 3
    synths.push(createSineSiren(65.4, 60, 70, channels.synths)); // 4 
    synths.push(createDrone("G1", 0.3, 2, channels.drones)); // 5
    synths.push(createMetalLoop(6, "Eb2", "2n", channels.metal)); // 6
    synths.push(createStaticLoop(7, "8n", ["Bb4", "D5", "F5"], channels.synths)); // 7
    synths.push(createSineSiren(97.99, 97.99, 97.99, channels.synths)); // 8 

    // --- CELESTIAL NODES (9-17) ---
    synths.push(createPad("C4", channels.pads)); // 9
    synths.push(createPluckLoop(10, ["G4", "Bb4", "C5"], "4n", channels.pads)); // 10
    synths.push(createPad("Eb4", channels.pads)); // 11
    synths.push(createSineCluster([1046.5, 1244.5], channels.pads)); // 12
    synths.push(createPad("Bb3", channels.pads)); // 13
    synths.push(createPluckLoop(14, ["D5", "F5", "G5"], "8n", channels.pads)); // 14

    // New Stars
    synths.push(createPluckLoop(15, ["Eb5", "Bb5", "C6"], "8n", channels.pads)); // 15
    synths.push(createPad("G4", channels.pads)); // 16
    synths.push(createStaticLoop(17, "2n", ["C6", "D6"], channels.synths)); // 17

    // --- OVERLOAD ARPEGGIATOR (Hidden Melody) ---
    const arpSynth = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 1 },
        volume: -15
    }).connect(channels.synths);

    const arpNotes = ["C5", "Eb5", "G5", "Bb5", "D6", "F5"];
    arpeggiatorPattern = new Tone.Pattern((time, note) => {
        arpSynth.triggerAttackRelease(note, "16n", time);
    }, arpNotes, "upDown");
    arpeggiatorPattern.interval = "16n";

    // --- BALIZAS: water-drop ambient drip — alive, liquid, soft ---
    // C minor pentatonic high register: C5 Eb5 G5 Bb5 C6
    const dropNotes = ["C5", "Eb5", "G5", "Bb5", "C6", "G5", "Eb5", "Bb5"];

    // Main drop: sine, fast soft attack, exponential decay, zero sustain
    const dropA = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.003, decay: 0.28, sustain: 0, release: 0.25 },
        volume: -28
    }).connect(channels.balizas);

    // Second drop voice — slightly brighter, slower decay (the "tail" of the drop)
    const dropB = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.006, decay: 0.55, sustain: 0, release: 0.4 },
        volume: -36
    }).connect(channels.balizas);

    // Third ghost voice — very faint upper harmonic like surface tension
    const dropC = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.010, decay: 0.18, sustain: 0, release: 0.12 },
        volume: -44
    }).connect(channels.balizas);

    // Organic random drip pattern — not metronomic, scattered like real drops
    let dropIdx = 0;
    function scheduleDrop() {
        const now = Tone.now();
        const note = dropNotes[dropIdx % dropNotes.length];
        const nextNote = dropNotes[(dropIdx + 2) % dropNotes.length];
        dropA.triggerAttackRelease(note, "32n", now);
        dropB.triggerAttackRelease(note, "32n", now + 0.018);
        // Occasional double-drop (every ~3rd hit) for the "ripple" feel
        if (dropIdx % 3 === 0) {
            dropC.triggerAttackRelease(nextNote, "32n", now + 0.07);
        }
        dropIdx++;
        // Random gap between 0.9s and 2.6s — feels alive, not mechanical
        const gap = 900 + Math.random() * 1700;
        setTimeout(scheduleDrop, gap);
    }
    // Start with a short random delay so it doesn't fire instantly
    setTimeout(scheduleDrop, 600 + Math.random() * 800);

    // --- STAR DRIFT INIT ---
    const skyLayer = document.getElementById('sky-layer');
    skyLayer.style.animationDuration = faders.drift.value + 's';

    // --- CAR LIGHT INIT ---
    scheduleNextCar();

    window.addEventListener('resize', drawConnections);
}

// ---- Synth Creators ----
function createNoise(type, freq, channel) {
    const noise = new Tone.Noise(type);
    const filter = new Tone.Filter(freq, "lowpass").connect(channel);
    noise.connect(filter);
    noise.volume.value = -Infinity;
    noise.start();
    return noise;
}


function createMetalLoop(nodeIndex, pitch, interval, channel) {
    const metal = new Tone.MembraneSynth({ pitchDecay: 0.1, octaves: 4 }).connect(channel);
    metal.volume.value = -Infinity;
    new Tone.Loop(time => {
        if (activeNodes[nodeIndex]) {
            if (Math.random() > 0.2) metal.triggerAttackRelease(pitch, "8n", time);
        }
    }, interval).start(0);
    return metal;
}

function createDrone(pitch, harm, modIdx, channel) {
    const drone = new Tone.FMSynth({
        harmonicity: harm, modulationIndex: modIdx,
        oscillator: { type: "sawtooth" },
        modulation: { type: "sine" },
        volume: -Infinity
    }).connect(channel);
    drone.triggerAttack(pitch);
    return drone;
}

function createStaticLoop(nodeIndex, interval, notes, channel) {
    const staticFm = new Tone.FMSynth({
        harmonicity: 8, modulationIndex: 40,
        oscillator: { type: "square" }
    }).connect(channel);
    staticFm.volume.value = -Infinity;
    new Tone.Loop(time => {
        if (activeNodes[nodeIndex]) {
            const note = notes[Math.floor(Math.random() * notes.length)];
            staticFm.triggerAttackRelease(note, "32n", time);
        }
    }, interval).start(0);
    return staticFm;
}

function createSineSiren(baseFreq, min, max, channel) {
    const osc = new Tone.Oscillator(baseFreq, "sine").connect(channel);
    osc.volume.value = -Infinity;
    osc.start();
    if (min !== max) {
        const lfo = new Tone.LFO(0.05, min, max).start();
        lfo.connect(osc.frequency);
    }
    return osc;
}

function createPad(pitch, channel) {
    const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 4, decay: 2, sustain: 1, release: 6 },
        volume: -Infinity
    }).connect(channel);
    const chorus = new Tone.Chorus(0.1, 2.5, 0.5).start();
    pad.connect(chorus);
    chorus.connect(channel);
    pad.triggerAttack(pitch);
    return pad;
}

function createPluckLoop(nodeIndex, notes, interval, channel) {
    const pluck = new Tone.PluckSynth({
        attackNoise: 1, dampening: 4000, resonance: 0.9
    }).connect(channel);
    pluck.volume.value = -Infinity;

    new Tone.Loop(time => {
        if (activeNodes[nodeIndex]) {
            const note = notes[Math.floor(Math.random() * notes.length)];
            pluck.triggerAttack(note, time);
        }
    }, interval).start(0);
    return pluck;
}

function createSineCluster(freqs, channel) {
    const merge = new Tone.Merge().connect(channel);
    const oscs = freqs.map(f => {
        const osc = new Tone.Oscillator(f, "sine");
        osc.volume.value = -Infinity;
        osc.start();
        osc.connect(merge);
        return osc;
    });
    return {
        volume: {
            rampTo: (val, time) => oscs.forEach(o => o.volume.rampTo(val, time))
        }
    };
}


// ---- Car Light System ----
function scheduleNextCar() {
    // Random delay between 40s and 120s
    const delay = 40000 + Math.random() * 80000;
    setTimeout(animateCar, delay);
}

function animateCar() {
    const car = document.getElementById('car-light');
    // Random direction: ltr or rtl
    const goingRight = Math.random() > 0.5;
    // Duration: 18-32 seconds for crossing
    const duration = 18000 + Math.random() * 14000;

    car.className = goingRight ? 'car-ltr' : 'car-rtl';
    car.style.setProperty('--car-duration', duration + 'ms');
    car.classList.add('car-active');

    // Cleanup after animation
    setTimeout(() => {
        car.className = '';
        scheduleNextCar();
    }, duration + 4000);
}


// ---- Interaction & Overload Logic ----
function toggleNode(index, element) {
    activeNodes[index] = !activeNodes[index];

    if (activeNodes[index]) {
        element.classList.add('active');
        fadeInAudio(index);
    } else {
        element.classList.remove('active');
        fadeOutAudio(index);
    }

    checkOverloadState();
}

function checkOverloadState() {
    const activeCount = activeNodes.filter(Boolean).length;

    // 1. Modulate Drone Distortion based on load
    // Normal: index 5. Overload: up to 50
    const newModIdx = 5 + (activeCount * 3);
    if (baseDrone) baseDrone.modulationIndex.rampTo(newModIdx, 1);

    // 2. Control Arpeggiator Melody
    if (activeCount >= 6) {
        // High energy: start melody if not running
        if (arpeggiatorPattern && arpeggiatorPattern.state !== 'started') {
            arpeggiatorPattern.start(0);
        }
        // Smooth progressive speed map covering all counts
        let newInterval;
        if (activeCount >= 15) newInterval = "64n";
        else if (activeCount >= 12) newInterval = "32n";
        else if (activeCount >= 9) newInterval = "16n";
        else newInterval = "8n";
        arpeggiatorPattern.interval = newInterval;

    } else {
        // Low energy: stop melody
        if (arpeggiatorPattern && arpeggiatorPattern.state === 'started') {
            arpeggiatorPattern.stop();
        }
    }

    drawConnections(activeCount);
}

function fadeInAudio(index) {
    // Target volumes for all 18 nodes (terrestrial + celestial)
    const vols = [
        -10, -18, -5, -22, -20, -8, -18, -22, -20, // 0-8 Terrestrial
        -15, -12, -15, -25, -15, -12, -8, -15, -22  // 9-17 Celestial
    ];
    if (synths[index] && synths[index].volume) {
        synths[index].volume.rampTo(vols[index], 2.5);
    }
}

function fadeOutAudio(index) {
    if (synths[index] && synths[index].volume) {
        synths[index].volume.rampTo(-Infinity, 3.5);
    }
}

function drawConnections(activeCount = activeNodes.filter(Boolean).length) {
    svgConnections.innerHTML = '';
    const activeElements = beacons.filter((b) => activeNodes[parseInt(b.getAttribute('data-id'))]);
    if (activeElements.length < 2) return;

    // Determine OVERLOAD CSS class based on connection count
    let overloadClass = '';
    if (activeCount >= 6 && activeCount < 12) overloadClass = 'lvl-cyan';
    if (activeCount >= 12) overloadClass = 'lvl-violet';

    for (let i = 0; i < activeElements.length; i++) {
        for (let j = i + 1; j < activeElements.length; j++) {
            const rectA = activeElements[i].getBoundingClientRect();
            const rectB = activeElements[j].getBoundingClientRect();

            const x1 = ((rectA.left + rectA.width / 2) / window.innerWidth) * 100;
            const y1 = ((rectA.top + rectA.height / 2) / window.innerHeight) * 100;
            const x2 = ((rectB.left + rectB.width / 2) / window.innerWidth) * 100;
            const y2 = ((rectB.top + rectB.height / 2) / window.innerHeight) * 100;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.classList.add('laser-line');
            if (overloadClass) line.classList.add(overloadClass);

            svgConnections.appendChild(line);
        }
    }
}
