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
let segmentEndMonitorTimer = null;
let manualSegmentEndSeconds = null;
let countdownTimer = null;
let countdownActive = false;



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
  const title = document.getElementById('segmentsTitle');
  const container = document.getElementById('segmentButtons');
  container.innerHTML = '';
  container.classList.remove('segment-buttons-ltr');

  if (!currentGroup) {
    title.textContent = 'בחר קול';
    return;
  }

  title.textContent = 'קטעים';

  const segments = libraryData.segments[currentGroup] || [];

  if (segments.length === 0) {
    title.textContent = 'אין קטעים בקבוצה זו';
    return;
  }

  if (segments[0] && segments[0].ltr !== false) {
    container.classList.add('segment-buttons-ltr');
  }

  segments.forEach(segment => {
    const btn = document.createElement('button');
    btn.className = 'segment-button';
    btn.textContent = segment.title;

    applySegmentNumberColor(btn, segment);

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

function applySegmentNumberColor(button, segment) {
  const title = String(segment.title || '');
  const match = title.match(/^\s*(\d+)/);

  if (!match) {
    return;
  }

  const number = Number(match[1]);

  if (!Number.isFinite(number)) {
    return;
  }

const colors = [
  '#dbeafe', // כחול
  '#dcfce7', // ירוק
  '#fef3c7', // צהוב
  '#fde2e8', // ורוד
  '#e9d5ff', // סגול
  '#fed7aa', // כתום
  '#bfdbfe', // כחול חזק יותר
  '#bbf7d0', // ירוק חזק יותר
  '#fde68a', // צהוב חזק יותר
  '#fbcfe8', // ורוד חזק יותר
  '#ddd6fe', // סגול חזק יותר
  '#fdba74'  // כתום חזק יותר
];

  button.classList.add('segment-numbered');
  button.style.setProperty(
    '--segment-group-bg',
    colors[(number - 1) % colors.length]
  );
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
  const jumpInput = document.getElementById('jumpToTimeInput');
  if (jumpInput) {
    jumpInput.value = formatTime(getSegmentStartSeconds(segment));
  }

  resetSegmentEndInput();

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
        onReady: refreshSegmentEndInput,
        onStateChange: onYouTubePlayerStateChange
      }
    });
  } else {
    player.loadVideoById({
      videoId: videoId,
      startSeconds: startSeconds
    });
    setTimeout(refreshSegmentEndInput, 500);
  }

  currentMode = 'youtube';
  showMobilePlayer();
}

function ensureCountdownOverlay() {
  const wrapper = document.getElementById('videoWrapper');

  if (!wrapper || document.getElementById('countdownOverlay')) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'countdownOverlay';
  overlay.className = 'countdown-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(overlay);
}

function loadHtmlMedia(mediaUrl, autoplay, mediaType, startSeconds) {
  const wrapper = document.getElementById('videoWrapper');

  stopCurrentVideo();
  wrapper.innerHTML = '';

  wrapper.classList.toggle('audio-wrapper', mediaType === 'audio');

  const media = document.createElement(mediaType === 'audio' ? 'audio' : 'video');
  media.id = 'htmlVideo';
  media.controls = true;
  media.src = mediaUrl;

  if (mediaType === 'audio') {
    media.className = 'audio-player';
  }

  if (autoplay) {
    media.autoplay = true;
  }

  media.addEventListener('loadedmetadata', () => {
    if (startSeconds && startSeconds > 0 && startSeconds < media.duration) {
      media.currentTime = startSeconds;
    }

    refreshSegmentEndInput();
    updateSkipButtons();
  });

  media.addEventListener('timeupdate', updateSkipButtons);
  media.addEventListener('ended', handleSegmentEnded);

  wrapper.appendChild(media);

  if (mediaType === 'audio') {
    addAudioVolumeControl(wrapper, media);
  }

  ensureCountdownOverlay();
  currentMode = 'html';
}

function addAudioVolumeControl(wrapper, media) {
  const control = document.createElement('div');
  control.className = 'audio-volume-control';

  const label = document.createElement('span');
  label.textContent = 'עוצמה';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = String(media.volume);
  slider.setAttribute('aria-label', 'עוצמת קול');

  const value = document.createElement('span');
  value.className = 'audio-volume-value';
  value.textContent = `${Math.round(media.volume * 100)}%`;

  slider.addEventListener('input', () => {
    media.volume = Number(slider.value);
    media.muted = media.volume === 0;
    value.textContent = `${Math.round(media.volume * 100)}%`;
  });

  control.appendChild(label);
  control.appendChild(slider);
  control.appendChild(value);
  wrapper.appendChild(control);
}


function loadHtmlVideo(videoUrl, autoplay) {
  loadHtmlMedia(videoUrl, autoplay, 'video', 0);
}

function ensureYouTubeContainer() {
  const wrapper = document.getElementById('videoWrapper');

  if (currentMode !== 'youtube') {
    wrapper.classList.remove('audio-wrapper');
    wrapper.innerHTML = '<div id="player"></div>';
    ensureCountdownOverlay();
    player = null;
  }
}

function clearPlayer() {
  stopCurrentVideo();

  const wrapper = document.getElementById('videoWrapper');
  wrapper.classList.remove('audio-wrapper');
  wrapper.innerHTML = '<div id="player"></div>';
  ensureCountdownOverlay();

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
    document.body.classList.add('mobile-player-mode');
  }
}

function isInsideIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

function setupOpenFullButton() {
  const btn = document.getElementById('openFullBtn');

  if (!btn) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('return');

  btn.style.display = 'none';
  btn.onclick = null;

  if (isInsideIframe()) {
    btn.style.display = '';
    btn.textContent = 'פתח במסך מלא';

    btn.onclick = function () {
      const currentUrl = new URL(window.location.href);

      if (
        document.referrer &&
        document.referrer.startsWith('https://sites.google.com/')
      ) {
        currentUrl.searchParams.set('return', document.referrer);
      }

      window.open(currentUrl.toString(), '_blank');
    };

    return;
  }

  if (
    returnUrl &&
    returnUrl.startsWith('https://sites.google.com/')
  ) {
    btn.style.display = '';
    btn.textContent = 'חזרה לאתר המקהלה';

    btn.onclick = function () {
      window.location.href = returnUrl;
    };
  }
}

function setupPlaybackOptions() {
  const playAll = document.getElementById('playAllCheckbox');
  const repeatOne = document.getElementById('repeatSegmentCheckbox');

  if (playAll) {
    playAll.checked = false;
    playAll.onchange = function () {
      if (playAll.checked && repeatOne) {
        repeatOne.checked = false;
      }
    };
  }

  if (repeatOne) {
    repeatOne.checked = false;
    repeatOne.onchange = function () {
      if (repeatOne.checked && playAll) {
        playAll.checked = false;
      }
    };
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
  finishCurrentSegment();
}

function playNextSegmentInGroup(loopToFirst) {
  const segments = getCurrentGroupSegments();
  const currentIndex = getCurrentSegmentIndex();

  if (!segments.length || currentIndex < 0) {
    return false;
  }

  const nextIndex = currentIndex + 1;

  if (nextIndex < segments.length) {
    loadSegment(segments[nextIndex], true);
    return true;
  }

  if (loopToFirst) {
    loadSegment(segments[0], true);
    return true;
  }

  return false;
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

  const start = getSegmentStartSeconds(currentSegment);
  const end = getActiveSegmentEndSeconds() || duration;

  target = Math.max(start, target);
  target = Math.min(end, target);

  seekToTime(target);
}

function jumpToStart() {
  seekToTime(getSegmentStartSeconds(currentSegment));
}

function jumpToEnd() {
  const end = getActiveSegmentEndSeconds() || getVideoDuration();

  if (!end) {
    return;
  }

  seekToTime(end);
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
    const start = getSegmentStartSeconds(currentSegment);
    const end = getActiveSegmentEndSeconds() || duration;

    btn.disabled =
      target < start ||
      target > end;
  });

  const startBtn = container.querySelector('.skip-start');
  const endBtn = container.querySelector('.skip-end');

  if (startBtn) {
    startBtn.disabled = !duration || current <= getSegmentStartSeconds(currentSegment);
  }

  if (endBtn) {
    endBtn.disabled = !duration || current >= (getActiveSegmentEndSeconds() || duration);
  }
}

function startSkipButtonsUpdater() {
  if (skipButtonsTimer) {
    clearInterval(skipButtonsTimer);
  }

  skipButtonsTimer = setInterval(updateSkipButtons, 500);
}


function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return '';
  }

  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  return `${m}:${String(sec).padStart(2, '0')}`;
}

function getSegmentStartSeconds(segment) {
  return Number(segment && segment.start) || 0;
}

function getSegmentDataEndSeconds(segment) {
  if (!segment) {
    return null;
  }

  const value =
    segment.end ??
    segment.endTime ??
    segment.stop ??
    segment.stopAt;

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return null;
  }

  if (seconds === -1) {
    return -1;
  }

  return seconds > 0 ? seconds : null;
}

function sameMediaSegment(a, b) {
  if (!a || !b) {
    return false;
  }

  const aSource = a.source || 'youtube';
  const bSource = b.source || 'youtube';

  if (aSource !== bSource) {
    return false;
  }

  if (aSource === 'youtube') {
    return a.videoId && a.videoId === b.videoId;
  }

  if (aSource === 'gdrive') {
    return a.fileId && a.fileId === b.fileId;
  }

  if (aSource === 'url') {
    return a.url && a.url === b.url;
  }

  return false;
}

function getNextSegmentStartMinusGap() {
  const segments = getCurrentGroupSegments();
  const index = getCurrentSegmentIndex();

  if (index < 0 || index + 1 >= segments.length) {
    return null;
  }

  const nextSegment = segments[index + 1];

  if (!sameMediaSegment(currentSegment, nextSegment)) {
    return null;
  }

  const nextStart = getSegmentStartSeconds(nextSegment);
  const candidate = nextStart - 1;

  return candidate > getSegmentStartSeconds(currentSegment) ? candidate : null;
}

function getDefaultSegmentEndSeconds() {
  if (!currentSegment) {
    return null;
  }

  const start = getSegmentStartSeconds(currentSegment);
  const dataEnd = getSegmentDataEndSeconds(currentSegment);

  // end: -1 = אין זמן סיום. לא עוצרים בתחילת הקטע הבא.
  if (dataEnd === -1) {
    return null;
  }

  // end רגיל בקובץ הוא הקובע.
  if (dataEnd !== null && dataEnd > start) {
    return dataEnd;
  }

  // אין end בכלל: שנייה לפני תחילת הקטע הבא באותו מקור.
  const nextGapEnd = getNextSegmentStartMinusGap();

  if (nextGapEnd !== null && nextGapEnd > start) {
    return nextGapEnd;
  }

  // אין קטע הבא באותו מקור: אין זמן סיום.
  return null;
}

function getActiveSegmentEndSeconds() {
  if (manualSegmentEndSeconds !== null) {
    return manualSegmentEndSeconds;
  }

  return getDefaultSegmentEndSeconds();
}

function resetSegmentEndInput() {
  manualSegmentEndSeconds = null;
  const input = document.getElementById('segmentEndTimeInput');

  if (input) {
    input.value = '';
    input.classList.remove('invalid');
  }

  setTimeout(refreshSegmentEndInput, 300);
}

function refreshSegmentEndInput() {
  const input = document.getElementById('segmentEndTimeInput');

  if (!input) {
    return;
  }

  if (manualSegmentEndSeconds !== null) {
    input.value = formatTime(manualSegmentEndSeconds);
    return;
  }

  if (document.activeElement === input) {
    return;
  }

  const end = getDefaultSegmentEndSeconds();

  if (end !== null) {
    input.value = formatTime(end);
  } else {
    input.value = '';
  }
}
  const input = document.getElementById('segmentEndTimeInput');

	if (!input || manualSegmentEndSeconds !== null || document.activeElement === input) {
	  return;
	}

  const end = getDefaultSegmentEndSeconds();

	if (getSegmentDataEndSeconds(currentSegment) === -1) {
	  input.value = '';
	} else if (end !== null) {
	  input.value = formatTime(end);
	} else {
	  input.value = '';
	}
}

function validateManualSegmentEnd() {
  const input = document.getElementById('segmentEndTimeInput');

  if (!input) {
    return true;
  }

  const text = input.value.trim();

  if (!text) {
    manualSegmentEndSeconds = null;
    refreshSegmentEndInput();
    return true;
  }

  const seconds = parseTimeString(text);
  const start = getSegmentStartSeconds(currentSegment);
  const duration = getVideoDuration();

  if (seconds === null || seconds <= start) {
    input.classList.add('invalid');
    manualSegmentEndSeconds = null;
    alert(`זמן הסיום חייב להיות גדול מ-${formatTime(start)}.`);
    return false;
  }

  if (duration && seconds > duration) {
    manualSegmentEndSeconds = duration;
    input.value = formatTime(duration);
    input.classList.remove('invalid');
    return true;
  }

  manualSegmentEndSeconds = seconds;
  input.value = formatTime(seconds);
  input.classList.remove('invalid');
  return true;
}
function seekToTime(seconds) {
  if (currentMode === 'youtube' && player && typeof player.seekTo === 'function') {
    player.seekTo(seconds, true);
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');

    if (video) {
      video.currentTime = seconds;
    }
  }

  updateSkipButtons();
}

function pauseCurrentMedia() {
  if (currentMode === 'youtube' && player && typeof player.pauseVideo === 'function') {
    player.pauseVideo();
  }

  if (currentMode === 'html') {
    const video = document.getElementById('htmlVideo');

    if (video) {
      video.pause();
    }
  }
}

function finishCurrentSegment() {
  if (advancingAfterEnded || countdownActive) {
    return;
  }

  advancingAfterEnded = true;

  try {
    if (isPlayAllEnabled()) {
      if (playNextSegmentInGroup(false)) {
        return;
      }

      const end = getActiveSegmentEndSeconds();

      if (end !== null) {
        seekToTime(end);
      }

      pauseCurrentMedia();
      return;
    }

    if (isRepeatSegmentEnabled() && currentSegment) {
      repeatCurrentSegmentWithCountdown();
      return;
    }

    const end = getActiveSegmentEndSeconds();

    if (end !== null) {
      seekToTime(end);
    }

    pauseCurrentMedia();
  } finally {
    setTimeout(() => {
      advancingAfterEnded = false;
    }, 350);
  }
}

function repeatCurrentSegmentWithCountdown() {
  const segmentToRepeat = currentSegment;
  const start = getSegmentStartSeconds(segmentToRepeat);

  countdownActive = true;
  pauseCurrentMedia();
  seekToTime(start);
  showCountdown(3, () => {
    countdownActive = false;
    loadSegment(segmentToRepeat, true);
  });
}

function showCountdown(fromNumber, callback) {
  const overlay = document.getElementById('countdownOverlay');
  let value = fromNumber;

  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  if (!overlay) {
    setTimeout(callback, fromNumber * 1000);
    return;
  }

  overlay.classList.add('show');
  overlay.textContent = String(value);

  countdownTimer = setInterval(() => {
    value -= 1;
    overlay.textContent = String(value);

    if (value <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      setTimeout(() => {
        overlay.classList.remove('show');
        overlay.textContent = '';
        callback();
      }, 250);
    }
  }, 1000);
}

function startSegmentEndMonitor() {
  if (segmentEndMonitorTimer) {
    clearInterval(segmentEndMonitorTimer);
  }

  segmentEndMonitorTimer = setInterval(() => {
    if (!currentSegment || advancingAfterEnded || countdownActive) {
      return;
    }

    const end = getActiveSegmentEndSeconds();

    if (end === null) {
		return;
	}

    const current = getCurrentVideoTime();

    if (current >= end - 0.2) {
      finishCurrentSegment();
    }
  }, 250);
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

  const start = getSegmentStartSeconds(currentSegment);
  const end = getActiveSegmentEndSeconds() || duration;
  const target = Math.max(start, Math.min(end, seconds));

  seekToTime(target);
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

  const endInput = document.getElementById('segmentEndTimeInput');

  if (endInput) {
    endInput.addEventListener('blur', validateManualSegmentEnd);
    endInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        validateManualSegmentEnd();
      }
    });
  }

  startSegmentEndMonitor();
});

setupOpenFullButton();
loadLibraryData();