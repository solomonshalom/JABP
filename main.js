/**
 * CD Music Player
 * Supports local audio files and YouTube videos
 */
import YouTubePlayer from 'youtube-player';

// Tauri API for native haptics
let invoke = null;
const isTauri = '__TAURI__' in window;
if (isTauri) {
    import('@tauri-apps/api/core').then(mod => {
        invoke = mod.invoke;
        console.log('Tauri native haptics enabled');
    }).catch(() => {
        console.log('Tauri API not available');
    });
}

// ============================================
// DOM Elements
// ============================================
const $ = (id) => document.getElementById(id);

const elements = {
    audio: $('audioPlayer'),
    playBtn: $('playBtn'),
    playText: $('playText'),
    playIcon: $('playIcon'),
    uploadBtn: $('uploadBtn'),
    uploadMenu: $('uploadMenu'),
    fileBtn: $('fileBtn'),
    ytBtn: $('ytBtn'),
    ytOverlay: $('ytOverlay'),
    ytInput: $('ytInput'),
    ytCancel: $('ytCancel'),
    ytLoad: $('ytLoad'),
    fileInput: $('fileInput'),
    cdWrapper: $('cdWrapper'),
    cdDisc: $('cdDisc'),
    songTitle: $('songTitle'),
    songTime: $('songTime'),
    ytPlayerContainer: $('ytPlayerContainer'),
    // CD cover elements
    coverBtn: $('coverBtn'),
    resetCoverBtn: $('resetCoverBtn'),
    coverInput: $('coverInput')
};

// ============================================
// State
// ============================================
const state = {
    isPlaying: false,
    currentRotation: 0,
    angularVelocity: 0,
    lastTime: performance.now(),
    isDragging: false,
    lastAngle: 0,
    sourceMode: null, // 'local' | 'youtube'
    hasSource: false,
    currentTime: 0,
    duration: 0,
    currentCdImage: 0,
    customCover: null, // Custom CD cover data URL
    showingCustomCover: false // Whether currently displaying custom cover
};

// Constants
const BASE_SPEED = 90;
const SECONDS_PER_ROTATION = 3;
const CD_IMAGES = [
    '/cd-disc-1.png',
    '/cd-disc-2.png'
];
const DEFAULT_TRACK = {
    url: '/default-track.mp3',
    title: 'Mondays Thoughts'
};

// ============================================
// YouTube Player (youtube-player package)
// ============================================
let ytPlayer = null;

function initYouTubePlayer() {
    if (!elements.ytPlayerContainer) {
        console.error('YouTube player container not found');
        return;
    }

    try {
        ytPlayer = YouTubePlayer(elements.ytPlayerContainer, {
            width: 1,
            height: 1,
            playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
                playsinline: 1
            }
        });

        // YouTube state constants
        const YT_STATES = {
            UNSTARTED: -1,
            ENDED: 0,
            PLAYING: 1,
            PAUSED: 2,
            BUFFERING: 3,
            CUED: 5
        };

        ytPlayer.on('stateChange', async (event) => {
            if (state.sourceMode !== 'youtube') return;

            console.log('YT state:', event.data);

            switch (event.data) {
                case YT_STATES.PLAYING:
                    state.isPlaying = true;
                    updatePlayButton(true);
                    // Don't clear status while dragging (scrubbing shows time)
                    if (!state.isDragging) showStatus('');
                    // Fetch title for current video (works for playlists too)
                    try {
                        const url = await ytPlayer.getVideoUrl();
                        const { videoId } = parseYouTubeURL(url);
                        if (videoId) {
                            const title = await fetchYouTubeTitle(videoId);
                            if (title) showTitle(title);
                        }
                    } catch (e) {}
                    break;
                case YT_STATES.PAUSED:
                    if (!state.isDragging) {
                        state.isPlaying = false;
                        updatePlayButton(false);
                    }
                    break;
                case YT_STATES.ENDED:
                    state.isPlaying = false;
                    updatePlayButton(false);
                    state.angularVelocity = 0;
                    break;
                case YT_STATES.BUFFERING:
                    if (!state.isDragging) {
                        showStatus('Buffering...');
                    }
                    break;
            }
        });

        ytPlayer.on('error', (event) => {
            console.error('YT error:', event.data);
            haptics.error();
            const messages = {
                2: 'Invalid video ID',
                5: 'Cannot play video',
                100: 'Video not found',
                101: 'Embedding disabled',
                150: 'Embedding disabled'
            };
            showStatus(messages[event.data] || 'Video error');
            state.isPlaying = false;
            updatePlayButton(false);
        });

        console.log('YouTube player initialized');
    } catch (e) {
        console.error('YouTube player init error:', e);
    }
}

// Initialize YouTube player
initYouTubePlayer();

// Update YouTube time periodically
setInterval(async () => {
    if (state.sourceMode === 'youtube' && ytPlayer && !state.isDragging) {
        try {
            const [time, dur] = await Promise.all([
                ytPlayer.getCurrentTime(),
                ytPlayer.getDuration()
            ]);
            state.currentTime = time || 0;
            state.duration = dur || 0;
            if (state.duration > 0) {
                showStatus(`${formatTime(state.currentTime)} / ${formatTime(state.duration)}`);
            }
        } catch (e) {
            // Ignore errors during polling
        }
    }
}, 500);

// ============================================
// Utility Functions
// ============================================
function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function showStatus(msg) {
    if (elements.songTime) elements.songTime.textContent = msg || '';
}

function showTitle(title) {
    if (elements.songTitle) elements.songTitle.textContent = title || '';
}

// ============================================
// Haptic Feedback (Exceptional vinyl-like experience)
// ============================================
const haptics = {
    webSupported: 'vibrate' in navigator,

    // Vinyl groove simulation state
    lastGrooveAngle: 0,
    grooveInterval: 15,          // Degrees between "grooves" - like vinyl ridges
    lastDirection: 0,            // Track direction for reversal detection
    scrubVelocity: 0,            // Track scrub speed
    lastScrubTime: 0,

    // Fire native haptic or web fallback
    _fire(command, fallbackMs = 10) {
        if (invoke) {
            invoke(command).catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate(fallbackMs);
        }
    },

    _fireWithArg(command, arg, fallbackMs = 10) {
        if (invoke) {
            invoke(command, { intensity: arg }).catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate(fallbackMs);
        }
    },

    // === Button Feedback ===

    // Light tap for button press
    tap() {
        this._fire('haptic_tap', 8);
    },

    // Soft feedback for hover/subtle interactions
    soft() {
        this._fire('haptic_soft', 5);
    },

    // === Playback Feedback ===

    // Play - ascending energy feel
    play() {
        if (invoke) {
            invoke('haptic_play').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([10, 40, 20]);
        }
    },

    // Pause - descending/settling feel
    pause() {
        if (invoke) {
            invoke('haptic_pause').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([20, 40, 10]);
        }
    },

    // === CD Interaction Feedback ===

    // CD swap - satisfying double-tap "click-clack"
    cdSwap() {
        if (invoke) {
            invoke('haptic_double_tap').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([15, 50, 25]);
        }
    },

    // Grab CD - initial contact feedback
    grab() {
        this._fire('haptic_alignment', 12);
    },

    // === Vinyl Groove Scrubbing ===

    // Initialize scrub session
    startScrub(angle) {
        this.lastGrooveAngle = angle;
        this.lastDirection = 0;
        this.scrubVelocity = 0;
        this.lastScrubTime = performance.now();
    },

    // Main scrub handler - creates vinyl groove feel
    scrub(currentAngle, delta) {
        const now = performance.now();
        const dt = (now - this.lastScrubTime) / 1000;
        this.lastScrubTime = now;

        // Calculate velocity (degrees per second)
        this.scrubVelocity = dt > 0 ? Math.abs(delta) / dt : 0;

        // Detect direction change (feels like needle jumping)
        const currentDirection = delta > 0 ? 1 : delta < 0 ? -1 : 0;
        if (this.lastDirection !== 0 && currentDirection !== 0 &&
            this.lastDirection !== currentDirection) {
            // Direction reversed! Special haptic
            if (invoke) {
                invoke('haptic_direction_change').catch(() => {});
            } else if (this.webSupported) {
                navigator.vibrate(25);
            }
            this.lastGrooveAngle = currentAngle;
        }
        this.lastDirection = currentDirection;

        // Vinyl groove simulation - fire haptic at regular angular intervals
        const angleDiff = Math.abs(currentAngle - this.lastGrooveAngle);

        // Dynamic groove interval based on velocity
        // Faster = slightly wider grooves (feels more natural)
        const dynamicInterval = this.grooveInterval + Math.min(10, this.scrubVelocity / 50);

        if (angleDiff >= dynamicInterval) {
            // We've passed a "groove" - fire haptic!
            const intensity = Math.min(1, this.scrubVelocity / 500);

            if (invoke) {
                invoke('haptic_scrub', { intensity }).catch(() => {});
            } else if (this.webSupported) {
                const strength = Math.max(5, Math.min(30, intensity * 30));
                navigator.vibrate(strength);
            }

            // Reset groove position
            this.lastGrooveAngle = currentAngle;
        }
    },

    // === Status Feedback ===

    // Success - satisfying confirmation
    success() {
        if (invoke) {
            invoke('haptic_success').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([15, 30, 8]);
        }
    },

    // Error - warning triple-tap
    error() {
        if (invoke) {
            invoke('haptic_triple_tap').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([30, 60, 30, 60, 30]);
        }
    },

    // Heavy thunk - for significant actions
    thunk() {
        if (invoke) {
            invoke('haptic_thunk').catch(() => {});
        } else if (this.webSupported) {
            navigator.vibrate([35, 20, 10]);
        }
    }
};

function updatePlayButton(playing) {
    if (!elements.playText || !elements.playIcon) return;
    if (playing) {
        elements.playText.textContent = 'Pause';
        elements.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>';
    } else {
        elements.playText.textContent = 'Play';
        elements.playIcon.innerHTML = '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"></polygon>';
    }
}

// ============================================
// YouTube URL Parsing
// ============================================
function parseYouTubeURL(url) {
    try {
        url = (url || '').trim();
        if (!url) return { error: 'Empty URL' };
        if (!url.startsWith('http')) url = 'https://' + url;

        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '').replace('m.', '');
        let videoId = null;
        let listId = urlObj.searchParams.get('list');

        if (hostname === 'youtu.be') {
            videoId = urlObj.pathname.slice(1).split('/')[0].split('?')[0];
        } else if (['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'].includes(hostname)) {
            const path = urlObj.pathname;
            if (path.startsWith('/watch')) {
                videoId = urlObj.searchParams.get('v');
            } else if (path.startsWith('/embed/')) {
                videoId = path.split('/embed/')[1]?.split('/')[0]?.split('?')[0];
            } else if (path.startsWith('/shorts/')) {
                videoId = path.split('/shorts/')[1]?.split('/')[0]?.split('?')[0];
            } else if (path.startsWith('/live/')) {
                videoId = path.split('/live/')[1]?.split('/')[0]?.split('?')[0];
            } else if (path.startsWith('/playlist')) {
                listId = urlObj.searchParams.get('list');
            }
        } else {
            return { error: 'Not a YouTube URL' };
        }

        if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            videoId = null;
        }

        return { videoId, listId };
    } catch (e) {
        return { error: 'Invalid URL' };
    }
}

// ============================================
// Load YouTube
// ============================================
async function fetchYouTubeTitle(videoId) {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (res.ok) {
            const data = await res.json();
            return data.title || null;
        }
    } catch (e) {
        console.log('Could not fetch title:', e);
    }
    return null;
}

async function loadYouTube(url) {
    console.log('loadYouTube:', url);

    if (!ytPlayer) {
        showStatus('Player not ready');
        return false;
    }

    showStatus('Loading...');
    showTitle('');
    const { videoId, listId, error } = parseYouTubeURL(url);
    console.log('Parsed:', { videoId, listId, error });

    if (error) {
        showStatus(error);
        return false;
    }

    if (!videoId && !listId) {
        showStatus('No video found');
        return false;
    }

    // Stop local audio
    stopLocalAudio();

    state.sourceMode = 'youtube';
    state.hasSource = true;
    state.currentTime = 0;
    state.duration = 0;

    try {
        if (videoId) {
            console.log('Loading video:', videoId);
            await ytPlayer.loadVideoById(videoId);
            haptics.success();
            // Fetch title in background
            fetchYouTubeTitle(videoId).then(title => {
                if (title) showTitle(title);
            });
            return true;
        } else if (listId) {
            console.log('Loading playlist:', listId);
            await ytPlayer.loadPlaylist({ list: listId, listType: 'playlist' });
            haptics.success();
            showTitle('Playlist');
            return true;
        }
    } catch (e) {
        console.error('Load error:', e);
        showStatus('Failed to load');
        state.hasSource = false;
        state.sourceMode = null;
        return false;
    }

    return false;
}

// ============================================
// Custom CD Cover
// ============================================
const COVER_STORAGE_KEY = 'jabp_custom_cover';

function loadSavedCover() {
    try {
        const saved = localStorage.getItem(COVER_STORAGE_KEY);
        if (saved) {
            state.customCover = saved;
            state.showingCustomCover = true;
            if (elements.cdDisc) {
                elements.cdDisc.src = saved;
            }
            console.log('Loaded custom CD cover from storage');
        }
    } catch (e) {
        console.log('Could not load saved cover:', e);
    }
}

function saveCustomCover(dataUrl) {
    try {
        localStorage.setItem(COVER_STORAGE_KEY, dataUrl);
        state.customCover = dataUrl;
        console.log('Saved custom CD cover to storage');
    } catch (e) {
        console.error('Could not save cover:', e);
        showStatus('Cover too large to save');
    }
}

function resetCover() {
    try {
        localStorage.removeItem(COVER_STORAGE_KEY);
        state.customCover = null;
        state.showingCustomCover = false;
        state.currentCdImage = 0;
        if (elements.cdDisc) {
            elements.cdDisc.src = CD_IMAGES[0];
        }
        haptics.success();
        console.log('Reset CD cover to default');
    } catch (e) {
        console.log('Could not reset cover:', e);
    }
}

async function handleCoverUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        showStatus('Please select an image');
        return;
    }

    // Check file size (max 2MB for localStorage)
    if (file.size > 2 * 1024 * 1024) {
        showStatus('Image too large (max 2MB)');
        haptics.error();
        return;
    }

    showStatus('Loading cover...');

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        if (elements.cdDisc) {
            elements.cdDisc.src = dataUrl;
        }
        saveCustomCover(dataUrl);
        state.showingCustomCover = true;
        haptics.success();
        showStatus('');
    };
    reader.onerror = () => {
        showStatus('Failed to load image');
        haptics.error();
    };
    reader.readAsDataURL(file);
}

// Load saved cover on startup
loadSavedCover();

// ============================================
// Local Audio
// ============================================
function stopLocalAudio() {
    if (elements.audio) {
        elements.audio.pause();
        if (elements.audio.src?.startsWith('blob:')) {
            URL.revokeObjectURL(elements.audio.src);
        }
        elements.audio.src = '';
    }
}

async function loadDefaultTrack() {
    if (!elements.audio) return false;

    // Stop YouTube if active
    if (state.sourceMode === 'youtube' && ytPlayer) {
        try { await ytPlayer.stopVideo(); } catch (e) {}
    }

    state.sourceMode = 'local';
    state.hasSource = true;
    stopLocalAudio();

    showTitle(DEFAULT_TRACK.title);
    showStatus('Loading...');

    // Wait for audio to be ready before playing
    const loadPromise = new Promise((resolve, reject) => {
        const onCanPlay = () => {
            elements.audio.removeEventListener('canplay', onCanPlay);
            elements.audio.removeEventListener('error', onError);
            resolve();
        };
        const onError = (e) => {
            elements.audio.removeEventListener('canplay', onCanPlay);
            elements.audio.removeEventListener('error', onError);
            reject(new Error('Failed to load audio'));
        };
        elements.audio.addEventListener('canplay', onCanPlay);
        elements.audio.addEventListener('error', onError);
    });

    elements.audio.src = DEFAULT_TRACK.url;
    elements.audio.load();

    initAudioContext();

    try {
        await loadPromise;
        await elements.audio.play();
        haptics.success();
        state.isPlaying = true;
        updatePlayButton(true);
        showStatus('');
    } catch (e) {
        console.error('Audio load/play error:', e);
        if (e.name === 'NotAllowedError') {
            showStatus('Tap play to start');
        } else {
            showStatus('Could not load audio');
            haptics.error();
        }
    }

    return true;
}

async function loadLocalAudio(file) {
    if (!file || !elements.audio) return false;

    // Stop YouTube
    if (state.sourceMode === 'youtube' && ytPlayer) {
        try { await ytPlayer.stopVideo(); } catch (e) {}
    }

    state.sourceMode = 'local';
    state.hasSource = true;
    stopLocalAudio();

    // Show filename as title (strip extension)
    const title = file.name.replace(/\.[^/.]+$/, '');
    showTitle(title);
    showStatus('Loading...');

    // Wait for audio to be ready before playing
    const loadPromise = new Promise((resolve, reject) => {
        const onCanPlay = () => {
            elements.audio.removeEventListener('canplay', onCanPlay);
            elements.audio.removeEventListener('error', onError);
            resolve();
        };
        const onError = (e) => {
            elements.audio.removeEventListener('canplay', onCanPlay);
            elements.audio.removeEventListener('error', onError);
            reject(new Error('Failed to load audio'));
        };
        elements.audio.addEventListener('canplay', onCanPlay);
        elements.audio.addEventListener('error', onError);
    });

    elements.audio.src = URL.createObjectURL(file);
    elements.audio.load();

    initAudioContext();

    try {
        await loadPromise;
        await elements.audio.play();
        haptics.success();
        state.isPlaying = true;
        updatePlayButton(true);
        showStatus('');
    } catch (e) {
        console.error('Audio load/play error:', e);
        if (e.name === 'NotAllowedError') {
            showStatus('Tap play to start');
        } else {
            showStatus('Could not load audio');
            haptics.error();
        }
    }

    return true;
}

// ============================================
// Playback Controls
// ============================================
async function play() {
    console.log('play()', state.sourceMode);
    if (state.sourceMode === 'youtube' && ytPlayer) {
        await ytPlayer.playVideo();
    } else if (state.sourceMode === 'local' && elements.audio) {
        await elements.audio.play().catch(() => showStatus('Tap to play'));
    }
    state.isPlaying = true;
    updatePlayButton(true);
}

async function pause() {
    console.log('pause()', state.sourceMode);
    if (state.sourceMode === 'youtube' && ytPlayer) {
        await ytPlayer.pauseVideo();
    } else if (state.sourceMode === 'local' && elements.audio) {
        elements.audio.pause();
    }
    state.isPlaying = false;
    updatePlayButton(false);
}

function togglePlayPause() {
    if (state.isPlaying) {
        haptics.pause();
        pause();
    } else {
        haptics.play();
        play();
    }
}

async function seek(time) {
    time = Math.max(0, time);
    if (state.duration > 0) time = Math.min(time, state.duration);

    if (state.sourceMode === 'youtube' && ytPlayer) {
        await ytPlayer.seekTo(time, true);
    } else if (state.sourceMode === 'local' && elements.audio) {
        elements.audio.currentTime = time;
    }
    state.currentTime = time;
}

// ============================================
// Audio Context (Glitch Effect)
// ============================================
let audioContext = null;
let glitchGain = null;
let noiseBuffer = null;
let noiseSource = null;

function initAudioContext() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const size = audioContext.sampleRate * 0.5;
        noiseBuffer = audioContext.createBuffer(1, size, audioContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        glitchGain = audioContext.createGain();
        glitchGain.gain.value = 0;
        glitchGain.connect(audioContext.destination);
    } catch (e) {
        console.error('AudioContext error:', e);
    }
}

function playGlitch(intensity) {
    if (!audioContext || !glitchGain) return;
    if (noiseSource) try { noiseSource.stop(); } catch (e) {}

    noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseSource.playbackRate.value = 0.5 + Math.abs(intensity) * 2;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800 + Math.abs(intensity) * 2000;
    filter.Q.value = 1;

    noiseSource.connect(filter);
    filter.connect(glitchGain);
    glitchGain.gain.setTargetAtTime(Math.min(0.15, Math.abs(intensity) * 0.3), audioContext.currentTime, 0.01);
    noiseSource.start();
}

function stopGlitch() {
    if (!glitchGain || !audioContext) return;
    glitchGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.05);
    setTimeout(() => {
        if (noiseSource) try { noiseSource.stop(); } catch (e) {}
        noiseSource = null;
    }, 100);
}

// ============================================
// CD Animation
// ============================================
function getAngle(x, y) {
    if (!elements.cdWrapper) return 0;
    const rect = elements.cdWrapper.getBoundingClientRect();
    return Math.atan2(y - (rect.top + rect.height / 2), x - (rect.left + rect.width / 2)) * (180 / Math.PI);
}

function animate(time) {
    const dt = (time - state.lastTime) / 1000;
    state.lastTime = time;

    if (!state.isDragging) {
        if (state.isPlaying) {
            state.angularVelocity += (BASE_SPEED - state.angularVelocity) * 0.05;
        } else {
            state.angularVelocity *= 0.95;
            if (Math.abs(state.angularVelocity) < 0.5) state.angularVelocity = 0;
        }
    }

    state.currentRotation += state.angularVelocity * dt;
    if (elements.cdDisc) {
        elements.cdDisc.style.transform = `rotate(${state.currentRotation}deg)`;
    }

    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// ============================================
// Drag/Scrub
// ============================================
let dragStartX = 0, dragStartY = 0, hasDragged = false;

async function startDrag(e) {
    if (!state.hasSource || state.isDragging) return;

    initAudioContext();
    if (audioContext?.state === 'suspended') audioContext.resume();

    state.isDragging = true;
    const pt = e.touches ? e.touches[0] : e;
    state.lastAngle = getAngle(pt.clientX, pt.clientY);

    // Initialize haptic scrub session with current angle
    haptics.grab();
    haptics.startScrub(state.lastAngle);

    if (elements.cdWrapper) elements.cdWrapper.style.cursor = 'grabbing';

    // Get current state for scrubbing
    if (state.sourceMode === 'youtube' && ytPlayer) {
        try {
            const [t, d] = await Promise.all([ytPlayer.getCurrentTime(), ytPlayer.getDuration()]);
            state.currentTime = t || 0;
            state.duration = d || 0;
        } catch (e) {}
    } else if (state.sourceMode === 'local' && elements.audio) {
        state.currentTime = elements.audio.currentTime || 0;
        state.duration = elements.audio.duration || 0;
    }

    console.log('startDrag:', state.currentTime, '/', state.duration);
}

function doDrag(e) {
    if (!state.isDragging) return;
    e.preventDefault();

    const pt = e.touches ? e.touches[0] : e;
    const newAngle = getAngle(pt.clientX, pt.clientY);
    let delta = newAngle - state.lastAngle;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    state.currentRotation += delta;
    state.angularVelocity = delta * 10;
    state.lastAngle = newAngle;

    if (state.duration > 0) {
        const secDelta = (delta / 360) * SECONDS_PER_ROTATION;
        state.currentTime = Math.max(0, Math.min(state.duration, state.currentTime + secDelta));
        seek(state.currentTime);
        showStatus(`${formatTime(state.currentTime)} / ${formatTime(state.duration)}`);

        // Vinyl groove haptic feedback - fires at regular angular intervals
        haptics.scrub(newAngle, delta);

        if (Math.abs(delta) > 2 && elements.cdWrapper) {
            elements.cdWrapper.classList.toggle('rewinding', delta < 0);
            elements.cdWrapper.classList.toggle('scrubbing', delta > 0);
            playGlitch(delta / 30);
        } else if (elements.cdWrapper) {
            elements.cdWrapper.classList.remove('scrubbing', 'rewinding');
            stopGlitch();
        }
    }
}

function endDrag() {
    if (!state.isDragging) return;
    state.isDragging = false;
    if (elements.cdWrapper) {
        elements.cdWrapper.style.cursor = 'grab';
        elements.cdWrapper.classList.remove('scrubbing', 'rewinding');
    }
    stopGlitch();
}

// ============================================
// Click/Tap (Manual double-tap detection for trackpad reliability)
// ============================================
let clickTimeout = null;
let lastClickTime = 0;
let doubleTapHandled = false; // Prevent native dblclick from firing after manual detection
const DOUBLE_TAP_THRESHOLD = 400; // ms

function handleClick(e) {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;

    // Check double-tap FIRST (CD swap should always work, even with micro-movement)
    if (timeSinceLastClick < DOUBLE_TAP_THRESHOLD && timeSinceLastClick > 50) {
        // Double tap detected!
        clearTimeout(clickTimeout);
        lastClickTime = 0;
        hasDragged = false;
        doubleTapHandled = true; // Flag to prevent native dblclick from also firing

        // Swap CD image (always works, even without source)
        // Cycle through: CD1 → CD2 → custom (if exists) → CD1 → ...
        haptics.cdSwap();

        if (state.showingCustomCover) {
            // Currently showing custom, go back to first default CD
            state.showingCustomCover = false;
            state.currentCdImage = 0;
            if (elements.cdDisc) elements.cdDisc.src = CD_IMAGES[0];
            console.log('Double tap - switched from custom to CD1');
        } else if (state.customCover && state.currentCdImage === CD_IMAGES.length - 1) {
            // At last default CD and custom exists, show custom
            state.showingCustomCover = true;
            if (elements.cdDisc) elements.cdDisc.src = state.customCover;
            console.log('Double tap - switched to custom cover');
        } else {
            // Cycle through default CDs
            state.currentCdImage = (state.currentCdImage + 1) % CD_IMAGES.length;
            if (elements.cdDisc) elements.cdDisc.src = CD_IMAGES[state.currentCdImage];
            console.log('Double tap - CD swap to', state.currentCdImage);
        }

        // Reset flag after a short delay (native dblclick fires immediately after)
        setTimeout(() => { doubleTapHandled = false; }, 100);
        return;
    }

    // Always track click time for double-tap detection
    lastClickTime = now;

    // Only block single-tap play/pause if dragged (not double-tap)
    if (hasDragged) {
        hasDragged = false;
        return;
    }

    // Single tap - wait to see if second tap comes
    clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
        if (state.hasSource) {
            togglePlayPause();
            console.log('Single tap - toggle play/pause');
        }
        lastClickTime = 0;
    }, DOUBLE_TAP_THRESHOLD);
}

function handleDoubleClick() {
    // Backup for devices where native dblclick works
    // Skip if manual detection already handled this double-tap
    if (doubleTapHandled) {
        console.log('Native dblclick skipped - already handled');
        return;
    }

    clearTimeout(clickTimeout);
    lastClickTime = 0;

    // Cycle through: CD1 → CD2 → custom (if exists) → CD1 → ...
    haptics.cdSwap();

    if (state.showingCustomCover) {
        // Currently showing custom, go back to first default CD
        state.showingCustomCover = false;
        state.currentCdImage = 0;
        if (elements.cdDisc) elements.cdDisc.src = CD_IMAGES[0];
        console.log('Native dblclick - switched from custom to CD1');
    } else if (state.customCover && state.currentCdImage === CD_IMAGES.length - 1) {
        // At last default CD and custom exists, show custom
        state.showingCustomCover = true;
        if (elements.cdDisc) elements.cdDisc.src = state.customCover;
        console.log('Native dblclick - switched to custom cover');
    } else {
        // Cycle through default CDs
        state.currentCdImage = (state.currentCdImage + 1) % CD_IMAGES.length;
        if (elements.cdDisc) elements.cdDisc.src = CD_IMAGES[state.currentCdImage];
        console.log('Native dblclick - CD swap to', state.currentCdImage);
    }
}

// ============================================
// Event Listeners
// ============================================

// CD drag
if (elements.cdWrapper) {
    elements.cdWrapper.addEventListener('mousedown', (e) => {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        hasDragged = false;
        startDrag(e);
    });

    elements.cdWrapper.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        dragStartX = t.clientX;
        dragStartY = t.clientY;
        hasDragged = false;
        startDrag(e);
    }, { passive: true });

    elements.cdWrapper.addEventListener('click', handleClick);
    elements.cdWrapper.addEventListener('dblclick', handleDoubleClick);
    elements.cdWrapper.addEventListener('contextmenu', (e) => e.preventDefault());
}

window.addEventListener('mousemove', (e) => {
    if (state.isDragging) {
        // 20px threshold - Mac trackpads need higher tolerance during double-taps
        if (Math.abs(e.clientX - dragStartX) > 20 || Math.abs(e.clientY - dragStartY) > 20) hasDragged = true;
    }
    doDrag(e);
});

window.addEventListener('mouseup', endDrag);

window.addEventListener('touchmove', (e) => {
    if (state.isDragging && e.touches[0]) {
        if (Math.abs(e.touches[0].clientX - dragStartX) > 15 || Math.abs(e.touches[0].clientY - dragStartY) > 15) hasDragged = true;
    }
    doDrag(e);
}, { passive: false });

window.addEventListener('touchend', endDrag);

// Play button
if (elements.playBtn) {
    elements.playBtn.addEventListener('click', async () => {
        console.log('Play button clicked');
        if (!state.hasSource) {
            // Load default track on first play
            await loadDefaultTrack();
            return;
        }
        initAudioContext();
        if (audioContext?.state === 'suspended') audioContext.resume();
        togglePlayPause();
    });
}

// Upload menu
if (elements.uploadBtn) {
    elements.uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.tap();
        console.log('Upload clicked');
        elements.uploadMenu?.classList.toggle('open');
    });
}

document.addEventListener('click', (e) => {
    if (!elements.uploadBtn?.contains(e.target)) {
        elements.uploadMenu?.classList.remove('open');
    }
});

if (elements.fileBtn) {
    elements.fileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.tap();
        console.log('File button clicked');
        elements.uploadMenu?.classList.remove('open');
        elements.fileInput?.click();
    });
}

if (elements.ytBtn) {
    elements.ytBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.tap();
        console.log('YouTube button clicked');
        elements.uploadMenu?.classList.remove('open');
        elements.ytOverlay?.classList.add('open');
        elements.ytInput?.focus();
    });
}

// CD Cover upload
if (elements.coverBtn) {
    elements.coverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.tap();
        console.log('Cover button clicked');
        elements.uploadMenu?.classList.remove('open');
        elements.coverInput?.click();
    });
}

if (elements.resetCoverBtn) {
    elements.resetCoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.tap();
        console.log('Reset cover clicked');
        elements.uploadMenu?.classList.remove('open');
        resetCover();
    });
}

if (elements.coverInput) {
    elements.coverInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        console.log('Cover file:', file?.name);
        if (file) await handleCoverUpload(file);
        elements.coverInput.value = '';
    });
}

// YouTube overlay
if (elements.ytCancel) {
    elements.ytCancel.addEventListener('click', () => {
        haptics.tap();
        elements.ytOverlay?.classList.remove('open');
        if (elements.ytInput) elements.ytInput.value = '';
    });
}

if (elements.ytLoad) {
    elements.ytLoad.addEventListener('click', async () => {
        haptics.tap();
        const url = elements.ytInput?.value?.trim();
        if (!url) return;
        console.log('Loading:', url);
        elements.ytOverlay?.classList.remove('open');
        const ok = await loadYouTube(url);
        if (ok) {
            if (elements.ytInput) elements.ytInput.value = '';
        } else {
            haptics.error();
            elements.ytOverlay?.classList.add('open');
        }
    });
}

if (elements.ytInput) {
    elements.ytInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.ytLoad?.click();
    });
}

if (elements.ytOverlay) {
    elements.ytOverlay.addEventListener('click', (e) => {
        if (e.target === elements.ytOverlay) {
            elements.ytOverlay.classList.remove('open');
            if (elements.ytInput) elements.ytInput.value = '';
        }
    });
}

// File input
if (elements.fileInput) {
    elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        console.log('File:', file?.name);
        if (file) await loadLocalAudio(file);
        elements.fileInput.value = '';
    });
}

// Local audio events
if (elements.audio) {
    elements.audio.addEventListener('timeupdate', () => {
        if (state.sourceMode === 'local' && !state.isDragging) {
            state.currentTime = elements.audio.currentTime || 0;
            state.duration = elements.audio.duration || 0;
            if (state.duration > 0) {
                showStatus(`${formatTime(state.currentTime)} / ${formatTime(state.duration)}`);
            }
        }
    });

    elements.audio.addEventListener('ended', () => {
        if (state.sourceMode === 'local') {
            state.isPlaying = false;
            updatePlayButton(false);
            state.angularVelocity = 0;
        }
    });

    elements.audio.addEventListener('error', (e) => {
        // Ignore errors when not in local mode or when src was intentionally cleared
        if (state.sourceMode !== 'local' || !elements.audio.src) {
            return;
        }
        haptics.error();
        const error = elements.audio.error;
        let message = 'Audio error';
        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    message = 'Playback aborted';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    message = 'Network error';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    message = 'Audio decode error';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    message = 'Format not supported';
                    break;
            }
            console.error('Audio error:', error.code, error.message);
        }
        showStatus(message);
        state.isPlaying = false;
        updatePlayButton(false);
    });
}

// Drag & drop
document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});

document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith('audio/')) await loadLocalAudio(file);
});

// Keyboard
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT') return;
    switch (e.key) {
        case ' ':
        case 'k':
            e.preventDefault();
            if (state.hasSource) togglePlayPause();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (state.hasSource && state.duration > 0) seek(Math.max(0, state.currentTime - 5));
            break;
        case 'ArrowRight':
            e.preventDefault();
            if (state.hasSource && state.duration > 0) seek(Math.min(state.duration, state.currentTime + 5));
            break;
        case 'Escape':
            elements.ytOverlay?.classList.remove('open');
            elements.uploadMenu?.classList.remove('open');
            break;
    }
});

// Cleanup
window.addEventListener('beforeunload', () => {
    stopLocalAudio();
    if (ytPlayer) try { ytPlayer.destroy(); } catch (e) {}
});

console.log('CD Player ready');
