/* ===== SceneFinder.AI Frontend ===== */

const API_BASE = window.location.origin + '/api';

// ===== Tab Navigation =====
const navBtns = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    navBtns.forEach(b => b.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');

    if (target === 'library') loadLibrary();
  });
});

// ===== Helpers =====
function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function confidenceClass(c) {
  if (c >= 0.8) return 'confidence-high';
  if (c >= 0.6) return 'confidence-med';
  return 'confidence-low';
}

function statusClass(s) {
  return `status-${s}`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function markdownToHtml(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

// ===== Chat =====
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatSend = document.getElementById('chat-send');

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendChatMessage('user', message);
  chatInput.value = '';
  chatSend.disabled = true;

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    removeTypingIndicator(typingId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    appendChatMessage('bot', data.response, data.results);
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatMessage('bot', `Something went wrong: ${err.message}. Please try again.`);
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
});

function appendChatMessage(role, text, results) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (role === 'user') {
    bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
  } else {
    bubble.innerHTML = markdownToHtml(text);

    // Add result cards
    if (results && results.length > 0) {
      results.forEach(r => {
        const card = document.createElement('div');
        card.className = 'chat-result-card';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${escapeHtml(r.anime_title)}</strong>
            <span class="confidence-badge ${confidenceClass(r.confidence)}">${(r.confidence * 100).toFixed(0)}%</span>
          </div>
          ${r.clip_name ? `<div class="result-label">Clip</div><div class="result-value">${escapeHtml(r.clip_name)}</div>` : ''}
          <div class="result-label" style="margin-top:6px">Timestamp</div>
          <div class="result-value">${formatTimestamp(r.start_timestamp)} – ${formatTimestamp(r.end_timestamp)}</div>
          ${r.drive_link ? `<a href="${escapeHtml(r.drive_link)}" target="_blank" rel="noopener" class="result-link">📥 Download from Google Drive</a>` : ''}
        `;
        bubble.appendChild(card);
      });
    }
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

let typingCounter = 0;
function appendTypingIndicator() {
  const id = `typing-${++typingCounter}`;
  const msg = document.createElement('div');
  msg.className = 'chat-msg bot';
  msg.id = id;
  msg.innerHTML = `
    <div class="chat-avatar">🤖</div>
    <div class="chat-bubble"><span class="spinner"></span> Searching...</div>
  `;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ===== Search =====
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  searchResults.innerHTML = '<div class="no-results"><span class="spinner"></span> Searching...</div>';

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderSearchResults(data);
  } catch (err) {
    searchResults.innerHTML = `<div class="no-results">Search failed: ${escapeHtml(err.message)}</div>`;
  }
});

function renderSearchResults(data) {
  if (!data.results || data.results.length === 0) {
    searchResults.innerHTML = `
      <div class="no-results">
        <p>No matches found for "${escapeHtml(data.query)}"</p>
        <p style="margin-top:8px">Try describing the action with more detail (character, weapon, movement).</p>
      </div>
    `;
    return;
  }

  searchResults.innerHTML = data.results.map(r => `
    <div class="result-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h3>${escapeHtml(r.anime_title)}${r.clip_name ? ` — ${escapeHtml(r.clip_name)}` : ''}</h3>
        <span class="confidence-badge ${confidenceClass(r.confidence)}">${(r.confidence * 100).toFixed(0)}%</span>
      </div>
      <div class="result-meta">
        <span>⏱ ${formatTimestamp(r.start_timestamp)} – ${formatTimestamp(r.end_timestamp)}</span>
        <span>📊 Confidence: ${r.confidence.toFixed(2)}</span>
      </div>
      ${r.description ? `<div class="result-desc">${escapeHtml(r.description)}</div>` : ''}
      ${r.drive_link ? `<a href="${escapeHtml(r.drive_link)}" target="_blank" rel="noopener" class="result-link">📥 Download from Google Drive</a>` : ''}
    </div>
  `).join('');
}

// ===== Library =====
const libraryGrid = document.getElementById('library-grid');
const refreshLibrary = document.getElementById('refresh-library');

refreshLibrary.addEventListener('click', loadLibrary);

async function loadLibrary() {
  libraryGrid.innerHTML = '<p class="empty-state"><span class="spinner"></span> Loading...</p>';

  try {
    const res = await fetch(`${API_BASE}/library`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.videos || data.videos.length === 0) {
      libraryGrid.innerHTML = '<p class="empty-state">No videos uploaded yet. Go to Upload to add your first clip!</p>';
      return;
    }

    libraryGrid.innerHTML = data.videos.map(v => `
      <div class="library-card">
        <h3>${escapeHtml(v.title)}</h3>
        <div class="meta">
          ${v.anime_title ? `<span>Anime: ${escapeHtml(v.anime_title)}</span>` : ''}
          ${v.clip_name ? `<span>Clip: ${escapeHtml(v.clip_name)}</span>` : ''}
          <span>Frames: ${v.frame_count}</span>
          <span>Status: <span class="status-badge ${statusClass(v.status)}">${v.status}</span></span>
          ${v.drive_link ? `<a href="${escapeHtml(v.drive_link)}" target="_blank" rel="noopener" class="result-link">📥 Google Drive</a>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    libraryGrid.innerHTML = `<p class="empty-state">Failed to load library: ${escapeHtml(err.message)}</p>`;
  }
}

// ===== Upload =====
const uploadForm = document.getElementById('upload-form');
const uploadFile = document.getElementById('upload-file');
const fileInfo = document.getElementById('file-info');
const fileDrop = document.getElementById('file-drop');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const uploadStatus = document.getElementById('upload-status');
const uploadBtn = document.getElementById('upload-btn');

uploadFile.addEventListener('change', () => {
  if (uploadFile.files.length > 0) {
    const file = uploadFile.files[0];
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    fileInfo.textContent = `${file.name} (${sizeMB} MB)`;
  }
});

fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    uploadFile.files = e.dataTransfer.files;
    uploadFile.dispatchEvent(new Event('change'));
  }
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!uploadFile.files.length) return;

  const formData = new FormData();
  formData.append('video', uploadFile.files[0]);
  formData.append('title', document.getElementById('upload-title').value);

  const anime = document.getElementById('upload-anime').value;
  if (anime) formData.append('anime_title', anime);

  const clip = document.getElementById('upload-clip').value;
  if (clip) formData.append('clip_name', clip);

  const drive = document.getElementById('upload-drive').value;
  if (drive) formData.append('drive_link', drive);

  uploadBtn.disabled = true;
  uploadProgress.style.display = 'block';
  uploadStatus.textContent = 'Uploading...';
  progressFill.style.width = '0%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${pct}%`;
        uploadStatus.textContent = `Uploading... ${pct}%`;
      }
    });

    const result = await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(JSON.parse(xhr.responseText).error || `HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });

    progressFill.style.width = '100%';
    uploadStatus.textContent = `Upload complete! Video ID: ${result.videoId}. Indexing in progress...`;

    // Poll for indexing status
    if (result.videoId) {
      pollIndexStatus(result.videoId);
    }

    uploadForm.reset();
    fileInfo.textContent = '';
  } catch (err) {
    uploadStatus.textContent = `Upload failed: ${err.message}`;
    progressFill.style.width = '0%';
  } finally {
    uploadBtn.disabled = false;
  }
});

async function pollIndexStatus(videoId) {
  const poll = async () => {
    try {
      const res = await fetch(`${API_BASE}/index-status/${videoId}`);
      if (!res.ok) return;
      const data = await res.json();

      uploadStatus.textContent = `${data.message} (${data.frames_processed}/${data.total_frames} frames)`;

      if (data.status === 'ready') {
        uploadStatus.textContent = 'Indexing complete! Video is ready for search.';
        return;
      }
      if (data.status === 'failed') {
        uploadStatus.textContent = 'Indexing failed. Please try re-uploading.';
        return;
      }

      setTimeout(poll, 3000);
    } catch {
      // ignore polling errors
    }
  };

  setTimeout(poll, 2000);
}

// ===== Index Status Bar =====
const statusText = document.getElementById('status-text');

async function updateStatusBar() {
  try {
    const res = await fetch(`${API_BASE}/index-status`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    statusText.textContent = `${data.totalVideos} videos · ${data.indexedFrames}/${data.totalFrames} frames indexed · Status: ${data.status}`;
  } catch {
    statusText.textContent = 'Backend not connected';
  }
}

updateStatusBar();
setInterval(updateStatusBar, 15000);
