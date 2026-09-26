import LibRaw from 'libraw-wasm';
import { zipSync } from 'fflate';
import { encodePng, previewDataUrl } from './png.js';
import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar"><div class="brand"><span class="brand-symbol">N<span></span></span><span>NEF <strong>STUDIO</strong></span></div><span class="top-note">RAW DEVELOPMENT / PNG EXPORT</span></header>
  <main class="workspace">
    <section class="intro"><div class="eyebrow">A SIMPLE RAW WORKSPACE <span>01 / 03</span></div><h1>From camera raw<br>to ready-to-use color.</h1><p>Convert Nikon NEF photos to full-resolution PNGs, right in your browser.</p></section>
    <div class="work-grid">
      <section class="panel input-panel" aria-labelledby="files-title">
        <div class="panel-heading"><div><span class="step">01 / IMPORT</span><h2 id="files-title">Your files</h2></div><span id="file-count" class="count">0 FILES</span></div>
        <label id="dropzone" class="dropzone"><input id="files" type="file" accept=".nef,image/x-nikon-nef" multiple /><span class="upload-icon" aria-hidden="true">↥</span><strong>Choose NEF files</strong><span>or drop them here</span><small>One photo or a whole set. Files stay on this device.</small></label>
        <div id="file-list" class="file-list" aria-live="polite"></div>
        <div class="privacy"><span class="privacy-mark">◎</span><span><strong>Private by design.</strong> Nothing is uploaded. Conversion happens on your device.</span></div>
      </section>
      <section class="panel settings-panel" aria-labelledby="settings-title">
        <div class="panel-heading"><div><span class="step">02 / DEVELOP</span><h2 id="settings-title">Export settings</h2></div></div>
        <div class="field"><label for="white-balance">White balance</label><select id="white-balance"><option value="camera">As shot · camera setting</option><option value="auto">Automatic</option></select><p>Camera setting is the most faithful starting point.</p></div>
        <div class="field"><label for="exposure">Exposure <output id="exposure-value">0.0 EV</output></label><input id="exposure" type="range" min="-2" max="2" value="0" step="0.1"/><div class="range-labels"><span>−2</span><span>0</span><span>+2</span></div></div>
        <div class="field"><label for="bit-depth">PNG depth</label><select id="bit-depth"><option value="8">8-bit · smaller file</option><option value="16">16-bit · more tonal detail</option></select></div>
        <label class="checkbox"><input id="half-size" type="checkbox"/><span><strong>Half-size output</strong><small>Useful if a large file exceeds your phone’s memory.</small></span></label>
        <div class="color-note"><span class="color-swatch"></span><span>Output: sRGB color space, tagged in every PNG.</span></div>
        <button id="convert" class="primary" disabled>Convert to PNG <span>→</span></button>
        <p class="settings-foot">Changed a setting? Convert again to update the results.</p>
      </section>
    </div>
    <section class="results" aria-labelledby="results-title"><div class="results-heading"><div><span class="step">03 / COLLECT</span><h2 id="results-title">Converted photos</h2></div><button id="download-all" class="outline" hidden>Download all as ZIP ↓</button></div><div id="result-area" class="empty-results"><div class="empty-mark">▧</div><p>Your PNG files will appear here after conversion.</p></div></section>
  </main><footer><span>NEF STUDIO</span><span>Made for a calmer RAW workflow.</span></footer>`;

const fileInput = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
const fileList = document.querySelector('#file-list');
const resultArea = document.querySelector('#result-area');
const convertButton = document.querySelector('#convert');
const downloadAllButton = document.querySelector('#download-all');
const exposure = document.querySelector('#exposure');
const exposureValue = document.querySelector('#exposure-value');
const items = [];
let busy = false;

function formatBytes(bytes) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function renderFiles() {
  document.querySelector('#file-count').textContent = `${items.length} ${items.length === 1 ? 'FILE' : 'FILES'}`;
  fileList.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'file-row';
    const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = 'NEF';
    const details = document.createElement('span'); details.className = 'file-details';
    const name = document.createElement('strong'); name.textContent = item.file.name;
    const sub = document.createElement('small'); sub.textContent = `${formatBytes(item.file.size)} · ${item.status}`;
    details.append(name, sub);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${item.file.name}`); remove.textContent = '×'; remove.disabled = busy;
    remove.onclick = () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); renderFiles(); renderResults(); };
    row.append(icon, details, remove); fileList.append(row);
  }
  convertButton.disabled = busy || !items.length;
}
function addFiles(files) {
  if (busy) return;
  let invalid = 0;
  for (const file of files) {
    if (!/\.nef$/i.test(file.name)) { invalid++; continue; }
    if (items.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    items.push({ file, status: 'Ready', blob: null, preview: null, error: null });
  }
  renderFiles();
  if (invalid) showNotice(`${invalid} file${invalid === 1 ? ' was' : 's were'} skipped. Choose Nikon .NEF files.`, 'error');
}
function showNotice(message, type = '') {
  let notice = document.querySelector('#notice');
  if (!notice) { notice = document.createElement('p'); notice.id = 'notice'; document.querySelector('.input-panel').append(notice); }
  notice.className = `notice ${type}`; notice.textContent = message;
}
function renderResults() {
  const successes = items.filter(item => item.blob);
  const failures = items.filter(item => item.error);
  downloadAllButton.hidden = successes.length < 2;
  resultArea.className = successes.length || failures.length ? 'result-list' : 'empty-results';
  resultArea.replaceChildren();
  if (!successes.length && !failures.length) { resultArea.innerHTML = '<div class="empty-mark">▧</div><p>Your PNG files will appear here after conversion.</p>'; return; }
  for (const item of [...successes, ...failures]) {
    const card = document.createElement('article'); card.className = 'result-card';
    if (item.preview) { const img = document.createElement('img'); img.src = item.preview; img.alt = `Preview of ${item.file.name}`; card.append(img); }
    else { const placeholder = document.createElement('div'); placeholder.className = 'result-error-icon'; placeholder.textContent = '!'; card.append(placeholder); }
    const body = document.createElement('div'); body.className = 'result-body';
    const title = document.createElement('strong'); title.textContent = item.file.name.replace(/\.nef$/i, '.png');
    const meta = document.createElement('small'); meta.textContent = item.error || `${formatBytes(item.blob.size)} · PNG · sRGB`;
    body.append(title, meta); card.append(body);
    if (item.blob) { const button = document.createElement('button'); button.className = 'download'; button.textContent = 'Download ↓'; button.onclick = () => download(item.blob, item.file.name.replace(/\.nef$/i, '.png')); card.append(button); }
    resultArea.append(card);
  }
}
fileInput.onchange = e => { addFiles(e.target.files); fileInput.value = ''; };
dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('dragging'); };
dropzone.ondragleave = () => dropzone.classList.remove('dragging');
dropzone.ondrop = e => { e.preventDefault(); dropzone.classList.remove('dragging'); addFiles(e.dataTransfer.files); };
exposure.oninput = () => { const n = Number(exposure.value); exposureValue.textContent = `${n > 0 ? '+' : ''}${n.toFixed(1)} EV`; };
convertButton.onclick = async () => {
  busy = true; renderFiles(); convertButton.textContent = 'Preparing converter…';
  const whiteBalance = document.querySelector('#white-balance').value;
  const bits = Number(document.querySelector('#bit-depth').value);
  const ev = Number(exposure.value);
  const halfSize = document.querySelector('#half-size').checked;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!items.includes(item)) continue;
    item.blob = null; item.preview = null; item.error = null;
    item.status = `Converting ${index + 1} of ${items.length}…`;
    convertButton.textContent = `Converting ${index + 1} of ${items.length}…`;
    renderFiles(); renderResults();
    await new Promise(resolve => setTimeout(resolve, 30));
    let raw;
    try {
      raw = new LibRaw();
      const input = new Uint8Array(await item.file.arrayBuffer());
      await raw.open(input, { useCameraWb: whiteBalance === 'camera', useAutoWb: whiteBalance === 'auto', useCameraMatrix: 3, outputColor: 1, outputBps: bits, noAutoBright: true, bright: 1, halfSize, expCorrec: ev !== 0, expShift: Math.pow(2, ev), expPreser: 0.3 });
      const pixels = await raw.imageData();
      if (!pixels?.data?.length) throw new Error('This NEF could not be decoded.');
      item.preview = previewDataUrl(pixels);
      item.blob = await encodePng(pixels);
      item.status = 'Converted';
    } catch (error) {
      item.error = error?.message || 'Conversion failed. Try half-size output.';
      item.status = 'Could not convert';
    } finally { raw?.dispose(); renderFiles(); renderResults(); }
  }
  busy = false; convertButton.innerHTML = 'Convert to PNG <span>→</span>'; renderFiles();
};
downloadAllButton.onclick = () => {
  const files = items.filter(item => item.blob);
  try {
    const names = new Set(); const entries = {};
    for (const item of files) {
      const base = item.file.name.replace(/\.nef$/i, '');
      let name = `${base}.png`; let n = 2;
      while (names.has(name.toLowerCase())) name = `${base}-${n++}.png`;
      names.add(name.toLowerCase());
      entries[name] = new Uint8Array(0);
    }
    Promise.all(files.map(item => item.blob.arrayBuffer())).then(buffers => {
      Object.keys(entries).forEach((name, index) => { entries[name] = new Uint8Array(buffers[index]); });
      download(new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }), 'nef-studio-exports.zip');
    }).catch(() => showNotice('Could not prepare the ZIP. Download the PNGs individually.', 'error'));
  } catch { showNotice('Could not prepare the ZIP. Download the PNGs individually.', 'error'); }
};
