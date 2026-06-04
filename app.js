let player = null;
let libraryData = null;
let currentGroup = null;
let youtubeReady = false;
let currentMode = null; // youtube / html / null
const SKIP_VALUES = [-30, -15, -10, -5, -1, 1, 5, 10, 15, 30];
let skipButtonsTimer = null;
let currentSegment = null;
let advancingAfterEnded = false;
let audioVisualizerAnimationId = null;
let audioWaveformData = null;
let audioVisualizerMedia = null;
let audioContext = null;
let audioAnalyser = null;
let audioStreamSource = null;

function getDataFileName() {
  const params = new URLSearchParams(window.location.search);
  const dataName = params.get('data') || 'choir-example';

  if (dataName.includes('/') || dataName.includes('\\') || dataName.includes('..')) {
    return 'choir-example.json';
  }

  return `${dataName}.json`;
}

async function loadLibraryData() {
  const fileName = getDataFileName();
  const url = `data/${fileName}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Cannot load ${url}`);
    }

    libraryData = await response.json();
    currentGroup = null;

    document.getElementById('libraryTitle').textContent =
      libraryData.libraryTitle || 'ספריית וידאו';

    document.getElementById('currentTitle').textContent =
      'בחר קול ולאחר מכן בחר קטע';

    clearPlayer();
    renderGroupButtons();
    renderSegmentButtons();
    initMobileMode();
	createSkipButtons();
	startSkipButtonsUpdater();
    setupPlaybackOptions();

  } catch (error) {
    document.getElementById('currentTitle').innerHTML =
      `<span class="error">שגיאה בטעינת קובץ הנתונים: ${url}</span>`;
    console.error(error);
  }
}

function onYouTubeIframeAPIReady() {
  youtubeReady = true;
}

function renderGroupButtons() {
  renderGroupRow('groupButtons', libraryData.groups || [], false);
  renderGroupRow('groupButtons2', libraryData.groups2 || [], true);
}

function renderGroupRow(containerId, groups, hideIfAllEmpty) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const hasAnyContent = groups.some(group => hasGroupContent(group.id));

  if (hideIfAllEmpty && !hasAnyContent) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';

  groups.forEach(group => {
    const btn = document.createElement('button');
    btn.textContent = group.label;

    const hasContent = hasGroupContent(group.id);
    btn.disabled = !hasContent;

    if (group.id === currentGroup) {
      btn.classList.add('active');
    }

    btn.onclick = function () {
      if (!hasContent) {
        return;
      }

      currentGroup = group.id;
      currentSegment = null;
      clearPlayer();

      document.getElementById('currentTitle').textContent =
        'בחר קטע מהרשימה';

      renderGroupButtons();
      renderSegmentButtons();
      showMobileMenu();
    };

    container.appendChild(btn);
  });
}

function hasGroupContent(groupId) {
  const segments = libraryData.segments[groupId] || [];
  return segments.length > 0;
}

function renderSegmentButtons() {
  const container = document.getElementById('segmentButtons');
  container.innerHTML = '';

  if (!currentGroup) {
    container.textContent = 'בחר קול';
    return;
  }

  const segments = libraryData.segments[currentGroup] || [];

  if (segments.length === 0) {
    container.textContent = 'אין קטעים בקבוצה זו';
    return;
  }

  segments.forEach(segment => {
    const btn = document.createElement('button');
    btn.className = 'segment-button';
    btn.textContent = segment.title;
	
	if (currentSegment === segment) {
	  btn.classList.add('active');
	}

    applyTextDirection(btn, segment);

    btn.onclick = function () {
      loadSegment(segment, true);
    };

    container.appendChild(btn);
  });
}

function applyTextDirection(element, segment) {
  const isLtr = segment.ltr !== false;

  if (isLtr) {
    element.style.direction = 'ltr';
    element.style.textAlign = 'left';
  } else {
    element.style.direction = 'rtl';
    element.style.textAlign = 'right';
  }
}

function loadSegment(segment, autoplay) {
  currentSegment = segment;
  renderSegmentButtons();
  const currentTitle = document.getElementById('currentTitle');

  const groupLabel = getCurrentGroupLabel();
  currentTitle.textContent = groupLabel
    ? `${groupLabel} -----> ${segment.title}`
    : segment.title;

  applyTextDirection(currentTitle, segment);

  const source = segment.source || 'youtube';

  if (source === 'youtube') {
    loadYouTubeSegment(segment, autoplay);
    return;
  }

  if (source === 'gdrive') {
    loadHtmlMedia(
      getGoogleDriveDirectUrl(segment.fileId),
      autoplay,
      getSegmentMediaType(segment),
      Number(segment.start) || 0
    );
    showMobilePlayer();
    return;
  }

  if (source === 'url') {
    loadHtmlMedia(
      segment.url,
      autoplay,
      getSegmentMediaType(segment),
      Number(segment.start) || 0
    );
    showMobilePlayer();
    return;
  }

  currentTitle.innerHTML =
    `<span class="error">סוג מקור לא נתמך: ${source}</span>`;
}

function getSegmentMediaType(segment) {
  const explicitType = String(segment.type || segment.mediaType || '').toLowerCase();

  if (explicitType === 'audio' || explicitType === 'video') {
    return explicitType;
  }

  const url = String(segment.url || segment.fileName || '').toLowerCase().split('?')[0];

  if (url.match(/\.(mp3|wav|m4a|aac|ogg|oga|flac)$/)) {
    return 'audio';
  }

  return 'video';
}

function loadYouTubeSegment(segment, autoplay) {
  if (!window.YT || typeof YT.Player !== 'function') {
    document.getElementById('currentTitle').innerHTML =
      '<span class="error">נגן YouTube עדיין נטען, נסה שוב בעוד רגע</span>';
    return;
  }

  youtubeReady = true;
  ensureYouTubeContainer();

  const videoId = segment.videoId;
  const startSeconds = Number(segment.start) || 0;

  if (!player) {
    player = new YT.Player('player', {
      videoId: videoId,
      playerVars: {
        start: startSeconds,
        rel: 0,
        modestbranding: 1,
        autoplay: autoplay ? 1 : 0
      },
      events: {
        onStateChange: onYouTubePlayerStateChange
      }
    });
  } else {
    player.loadVideoById({
      videoId: videoId,
      startSeconds: startSeconds
    });
  }

  currentMode = 'youtube';
  showMobilePlayer();
}

function loadHtmlMedia(mediaUrl, autoplay, mediaType, startSeconds) {
  const wrapper = document.getElementById('videoWrapper');

  stopCurrentVideo();
  destroyAudioVisualizer();
  wrapper.innerHTML = '';

  wrapper.classList.toggle('audio-wrapper', mediaType === 'audio');

  const media = document.createElement(mediaType === 'audio' ? 'audio' : 'video');
  media.id = 'htmlVideo';
  media.controls = true;
  media.src = mediaUrl;

  if (mediaType === 'audio') {
    media.className = 'audio-player';

    const visualizer = document.createElement('canvas');
    visualizer.id = 'audioVisualizer';
    visualizer.className = 'audio-visualizer';
    visualizer.setAttribute('aria-label', 'תצוגת עוצמת שמע');
    wrapper.appendChild(visualizer);
  }

  if (autoplay) {
    media.autoplay = true;
  }

  media.addEventListener('loadedmetadata', () => {
    if (startSeconds && startSeconds > 0 && startSeconds < media.duration) {
      media.currentTime = startSeconds;
    }

    updateSkipButtons();
  });

  media.addEventListener('timeupdate', updateSkipButtons);
  media.addEventListener('ended', handleSegmentEnded);

  wrapper.appendChild(media);
  currentMode = 'html';

  if (mediaType === 'audio') {
    initAudioVisualizer(media, mediaUrl);
  }
}

function loadHtmlVideo(videoUrl, autoplay) {
  loadHtmlMedia(videoUrl, autoplay, 'video', 0);
}

function ensureYouTubeContainer() {
  const wrapper = document.getElementById('videoWrapper');

  if (currentMode !== 'youtube') {
    destroyAudioVisualizer();
    wrapper.classList.remove('audio-wrapper');
    wrapper.innerHTML = '<div id="player"></div>';
    player = null;
  }
}

function clearPlayer() {
  stopCurrentVideo();
  destroyAudioVisualizer();

  const wrapper = document.getElementById('videoWrapper');
  wrapper.classList.remove('audio-wrapper');
  wrapper.innerHTML = '<div id="player"></div>';

  player = null;
  currentMode = null;
}

function stopCurrentVideo() {
  if (currentMode === 'youtube' && player && typeof player.stopVideo === 'function') {
    player.stopVideo();
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }
}

function getGoogleDriveDirectUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function isMobileView() {
  return window.matchMedia('(max-width: 800px)').matches;
}

function showMobileMenu() {
  if (!isMobileView()) {
    return;
  }

  document.body.classList.remove('mobile-player-mode');
  document.body.classList.add('mobile-menu-mode');
}

function showMobilePlayer() {
  if (!isMobileView()) {
    return;
  }

  document.body.classList.remove('mobile-menu-mode');
  document.body.classList.add('mobile-player-mode');
}

function initMobileMode() {
  document.body.classList.remove('mobile-menu-mode');
  document.body.classList.remove('mobile-player-mode');

  if (isMobileView()) {
    document.body.classList.add('mobile-menu-mode');
  }
}
function setupOpenFullButton() {
  const btn = document.getElementById('openFullBtn');

  if (!btn) {
    return;
  }

  btn.onclick = function () {
    window.open(window.location.href, '_blank');
  };
}

setupOpenFullButton();
function isInsideIframe() {
  return window.self !== window.top;
}

function setupOpenFullButton() {
  const btn = document.getElementById('openFullBtn');

  if (!btn) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');

  if (isInsideIframe()) {
    btn.textContent = 'פתח במסך מלא';

    btn.onclick = function () {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('return', document.referrer || '');

      window.open(currentUrl.toString(), '_blank');
    };
  } else {
    btn.textContent = 'חזרה לאתר המקהלה';

    btn.onclick = function () {
      if (returnUrl) {
        window.location.href = returnUrl;
      } else {
        history.back();
      }
    };
  }
}
function setupPlaybackOptions() {
  const playAll = document.getElementById('playAllCheckbox');
  const repeatOne = document.getElementById('repeatSegmentCheckbox');

  if (playAll) {
    playAll.checked = false;
  }

  if (repeatOne) {
    repeatOne.checked = false;
  }
}

function isPlayAllEnabled() {
  const checkbox = document.getElementById('playAllCheckbox');
  return !!(checkbox && checkbox.checked);
}

function isRepeatSegmentEnabled() {
  const checkbox = document.getElementById('repeatSegmentCheckbox');
  return !!(checkbox && checkbox.checked);
}

function getCurrentGroupSegments() {
  if (!libraryData || !currentGroup) {
    return [];
  }

  return libraryData.segments[currentGroup] || [];
}

function getCurrentSegmentIndex() {
  const segments = getCurrentGroupSegments();
  return segments.indexOf(currentSegment);
}

function handleSegmentEnded() {
  if (advancingAfterEnded) {
    return;
  }

  advancingAfterEnded = true;

  try {
    if (isPlayAllEnabled()) {
      playNextSegmentInGroup(isRepeatSegmentEnabled());
      return;
    }

    if (isRepeatSegmentEnabled() && currentSegment) {
      loadSegment(currentSegment, true);
    }
  } finally {
    setTimeout(() => {
      advancingAfterEnded = false;
    }, 250);
  }
}

function playNextSegmentInGroup(loopToFirst) {
  const segments = getCurrentGroupSegments();
  const currentIndex = getCurrentSegmentIndex();

  if (!segments.length || currentIndex < 0) {
    return;
  }

  const nextIndex = currentIndex + 1;

  if (nextIndex < segments.length) {
    loadSegment(segments[nextIndex], true);
    return;
  }

  if (loopToFirst) {
    loadSegment(segments[0], true);
  }
}

function onYouTubePlayerStateChange(event) {
  if (window.YT && event.data === YT.PlayerState.ENDED) {
    handleSegmentEnded();
  }
}

function getCurrentGroupLabel() {
  const allGroups = [
    ...(libraryData.groups || []),
    ...(libraryData.groups2 || [])
  ];

  const group = allGroups.find(g => g.id === currentGroup);
  return group ? group.label : '';
}

function createSkipButtons() {
  const container = document.getElementById('skipButtons');

  if (!container) {
    return;
  }

  container.innerHTML = '';

  const positiveRow = document.createElement('div');
  positiveRow.className = 'skip-row skip-positive';

  const negativeRow = document.createElement('div');
  negativeRow.className = 'skip-row skip-negative';

  SKIP_VALUES
    .filter(seconds => seconds > 0)
    .forEach(seconds => {
      const btn = document.createElement('button');

      btn.textContent = `+${seconds}`;
      btn.dataset.skip = seconds;

      btn.onclick = function () {
        skipVideo(seconds);
      };

      positiveRow.appendChild(btn);
    });

  const endBtn = document.createElement('button');
  endBtn.textContent = '>>|';
  endBtn.className = 'skip-end';
  endBtn.onclick = jumpToEnd;
  positiveRow.appendChild(endBtn);

  const startBtn = document.createElement('button');
  startBtn.textContent = '|<<';
  startBtn.className = 'skip-start';
  startBtn.onclick = jumpToStart;
  negativeRow.appendChild(startBtn);

  SKIP_VALUES
    .filter(seconds => seconds < 0)
    .forEach(seconds => {
      const btn = document.createElement('button');

      btn.textContent = `${seconds}`;
      btn.dataset.skip = seconds;

      btn.onclick = function () {
        skipVideo(seconds);
      };

      negativeRow.appendChild(btn);
    });

  container.appendChild(negativeRow);
  container.appendChild(positiveRow);

  updateSkipButtons();
}

function getCurrentVideoTime() {
  if (currentMode === 'youtube' &&
      player &&
      typeof player.getCurrentTime === 'function') {
    return player.getCurrentTime();
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');
    if (video) {
      return video.currentTime;
    }
  }

  return 0;
}

function getVideoDuration() {
  if (currentMode === 'youtube' &&
      player &&
      typeof player.getDuration === 'function') {
    return player.getDuration();
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');
    if (video && !isNaN(video.duration)) {
      return video.duration;
    }
  }

  return 0;
}

function skipVideo(seconds) {
  const current = getCurrentVideoTime();
  const duration = getVideoDuration();

  if (!duration) {
    return;
  }

  let target = current + seconds;

  target = Math.max(0, target);
  target = Math.min(duration, target);

  if (currentMode === 'youtube') {
    player.seekTo(target, true);
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');

    if (video) {
      video.currentTime = target;
    }
  }

  updateSkipButtons();
}

function jumpToStart() {
  if (currentMode === 'youtube') {
    player.seekTo(0, true);
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');

    if (video) {
      video.currentTime = 0;
    }
  }

  updateSkipButtons();
}

function jumpToEnd() {
  const duration = getVideoDuration();

  if (!duration) {
    return;
  }

  if (currentMode === 'youtube') {
    player.seekTo(duration, true);
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');

    if (video) {
      video.currentTime = duration;
    }
  }

  updateSkipButtons();
}

function updateSkipButtons() {
  const container = document.getElementById('skipButtons');

  if (!container) {
    return;
  }

  const current = getCurrentVideoTime();
  const duration = getVideoDuration();

  const buttons = container.querySelectorAll('button[data-skip]');

  buttons.forEach(btn => {
    const skip = Number(btn.dataset.skip);

    if (!duration) {
      btn.disabled = true;
      return;
    }

    const target = current + skip;

    btn.disabled =
      target < 0 ||
      target > duration;
  });

  const startBtn = container.querySelector('.skip-start');
  const endBtn = container.querySelector('.skip-end');

  if (startBtn) {
    startBtn.disabled = !duration || current <= 0;
  }

  if (endBtn) {
    endBtn.disabled = !duration || current >= duration;
  }
}

function startSkipButtonsUpdater() {
  if (skipButtonsTimer) {
    clearInterval(skipButtonsTimer);
  }

  skipButtonsTimer = setInterval(updateSkipButtons, 500);
}

function parseTimeString(text) {

  text = text.trim();

  const parts = text.split(':').map(Number);

  if (parts.some(isNaN)) {
    return null;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return (
      parts[0] * 3600 +
      parts[1] * 60 +
      parts[2]
    );
  }

  return null;
}

function jumpToExactTime() {

  const input =
    document.getElementById('jumpToTimeInput');

  if (!input) {
    return;
  }

  const seconds =
    parseTimeString(input.value);

  if (seconds === null) {
    return;
  }

  const duration = getVideoDuration();

  if (!duration) {
    return;
  }

  const target =
    Math.max(0, Math.min(duration, seconds));

  if (currentMode === 'youtube') {
    player.seekTo(target, true);
  }

  if (currentMode === 'html') {
    const video =
      document.getElementById('htmlVideo');

    if (video) {
      video.currentTime = target;
    }
  }

  updateSkipButtons();
}

function destroyAudioVisualizer() {
  if (audioVisualizerAnimationId) {
    cancelAnimationFrame(audioVisualizerAnimationId);
    audioVisualizerAnimationId = null;
  }

  if (audioStreamSource) {
    try {
      audioStreamSource.disconnect();
    } catch (error) {
      // ignore
    }
    audioStreamSource = null;
  }

  if (audioAnalyser) {
    try {
      audioAnalyser.disconnect();
    } catch (error) {
      // ignore
    }
    audioAnalyser = null;
  }

  audioWaveformData = null;
  audioVisualizerMedia = null;
}

function initAudioVisualizer(media, mediaUrl) {
  const canvas = document.getElementById('audioVisualizer');

  if (!canvas) {
    return;
  }

  audioVisualizerMedia = media;
  audioWaveformData = createFallbackWaveformData(160);
  drawAudioVisualizerFrame(canvas, media);
  startAudioVisualizerLoop(canvas, media);

  setupLiveAudioAnalyser(media);

  loadDecodedWaveform(mediaUrl)
    .then(data => {
      if (audioVisualizerMedia === media && data && data.length) {
        audioWaveformData = data;
      }
    })
    .catch(() => {
      // אם ניתוח קובץ חיצוני נחסם, נשארת תצוגת ברירת מחדל.
      // השמע עצמו ממשיך להתנגן רגיל דרך תגית audio.
    });
}

function setupLiveAudioAnalyser(media) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const captureStream = media.captureStream || media.mozCaptureStream;

  if (!AudioContextClass || !captureStream) {
    return;
  }

  media.addEventListener('play', () => {
    if (audioVisualizerMedia !== media || audioAnalyser) {
      return;
    }

    try {
      if (!audioContext) {
        audioContext = new AudioContextClass();
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const stream = captureStream.call(media);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 512;
      audioAnalyser.smoothingTimeConstant = 0.72;

      audioStreamSource = audioContext.createMediaStreamSource(stream);
      audioStreamSource.connect(audioAnalyser);

      // לא מחברים ל-destination כדי לא להתערב בשרשרת ההשמעה של תגית audio.
    } catch (error) {
      audioAnalyser = null;
      audioStreamSource = null;
    }
  });
}

function startAudioVisualizerLoop(canvas, media) {
  function draw() {
    if (audioVisualizerMedia !== media) {
      return;
    }

    drawAudioVisualizerFrame(canvas, media);
    audioVisualizerAnimationId = requestAnimationFrame(draw);
  }

  draw();
}

async function loadDecodedWaveform(mediaUrl) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass || !mediaUrl) {
    return null;
  }

  const response = await fetch(mediaUrl, { mode: 'cors' });

  if (!response.ok) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const context = new AudioContextClass();

  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    return extractWaveformData(audioBuffer, 160);
  } finally {
    if (typeof context.close === 'function') {
      context.close().catch(() => {});
    }
  }
}

function extractWaveformData(audioBuffer, bars) {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / bars));
  const result = [];

  for (let i = 0; i < bars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(channelData.length, start + samplesPerBar);
    let peak = 0;
    let sum = 0;

    for (let j = start; j < end; j++) {
      const value = Math.abs(channelData[j]);
      if (value > peak) {
        peak = value;
      }
      sum += value * value;
    }

    const rms = Math.sqrt(sum / Math.max(1, end - start));
    result.push(Math.min(1, peak * 0.75 + rms * 4.2));
  }

  return normalizeWaveformData(result);
}

function normalizeWaveformData(data) {
  const maxValue = Math.max(...data, 0.01);
  return data.map(value => Math.max(0.04, Math.min(1, value / maxValue)));
}

function createFallbackWaveformData(bars) {
  const result = [];

  for (let i = 0; i < bars; i++) {
    const value =
      0.10 +
      0.38 * Math.abs(Math.sin(i * 0.17)) +
      0.32 * Math.abs(Math.sin(i * 0.041 + 1.9)) +
      0.20 * Math.abs(Math.sin(i * 0.77 + 0.4));

    result.push(Math.min(1, value));
  }

  return normalizeWaveformData(result);
}

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawAudioVisualizerFrame(canvas, media) {
  const ctx = canvas.getContext('2d');

  resizeCanvasToDisplaySize(canvas);

  const width = canvas.width;
  const height = canvas.height;
  const duration = media && media.duration && !isNaN(media.duration) ? media.duration : 0;
  const current = media && media.currentTime ? media.currentTime : 0;
  const progress = duration ? Math.max(0, Math.min(1, current / duration)) : 0;

  if (audioAnalyser) {
    const liveData = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(liveData);
    drawLiveAudioBars(ctx, width, height, liveData);
    drawProgressLine(ctx, width, height, progress);
    return;
  }

  drawWaveformBars(ctx, width, height, audioWaveformData || createFallbackWaveformData(160), progress);
}

function drawWaveformBars(ctx, width, height, data, progress) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#eaf0f7';
  ctx.fillRect(0, 0, width, height);

  const bars = data.length;
  const gap = Math.max(1, Math.floor(width / bars * 0.18));
  const barWidth = Math.max(2, Math.floor((width - gap * (bars - 1)) / bars));
  const progressX = width * progress;

  for (let i = 0; i < bars; i++) {
    const value = Math.max(0.04, Math.min(1, data[i] || 0));
    const barHeight = Math.max(3, value * height * 0.86);
    const x = i * (barWidth + gap);
    const y = (height - barHeight) / 2;

    ctx.fillStyle = x <= progressX ? '#64748b' : '#a8b7c9';
    roundRect(ctx, x, y, barWidth, barHeight, Math.min(3, barWidth / 2));
    ctx.fill();
  }
}

function drawLiveAudioBars(ctx, width, height, data) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#eaf0f7';
  ctx.fillRect(0, 0, width, height);

  const bars = 96;
  const step = Math.max(1, Math.floor(data.length / bars));
  const gap = Math.max(1, Math.floor(width / bars * 0.20));
  const barWidth = Math.max(2, Math.floor((width - gap * (bars - 1)) / bars));

  ctx.fillStyle = '#64748b';

  for (let i = 0; i < bars; i++) {
    let sum = 0;

    for (let j = 0; j < step; j++) {
      sum += data[i * step + j] || 0;
    }

    let value = sum / step / 255;
    value = Math.pow(value, 0.55);

    const barHeight = Math.max(3, value * height * 0.90);
    const x = i * (barWidth + gap);
    const y = (height - barHeight) / 2;

    roundRect(ctx, x, y, barWidth, barHeight, Math.min(3, barWidth / 2));
    ctx.fill();
  }
}

function drawProgressLine(ctx, width, height, progress) {
  const x = width * progress;

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = Math.max(1, Math.floor(width / 600));
  ctx.beginPath();
  ctx.moveTo(x, 4);
  ctx.lineTo(x, height - 4);
  ctx.stroke();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

document.addEventListener('DOMContentLoaded', () => {

  const btn =
    document.getElementById('jumpToTimeBtn');

  const input =
    document.getElementById('jumpToTimeInput');

  if (btn) {
    btn.onclick = jumpToExactTime;
  }

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        jumpToExactTime();
      }
    });
  }
});

setupOpenFullButton();
loadLibraryData();