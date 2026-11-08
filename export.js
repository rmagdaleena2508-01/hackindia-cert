// Turns the animated canvas into files: a looping MP4 (kept under 3 MB) and a PNG.
(function () {
  const MAX_BYTES = 3 * 1024 * 1024;
  const VW = 1280, VH = 904; // 0.8 x the design size, even numbers for H.264

  const FPS = 30;
  const OFF = 5; // start on the finished certificate so the first frame (the thumbnail LinkedIn shows) is complete

  function makeCanvas() {
    const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
    const ctx = cv.getContext('2d'); const s = VW / Cert.W;
    const draw = (t, cert, theme) => { ctx.setTransform(s, 0, 0, s, 0, 0); Cert.render(ctx, cert, t, { theme, loop: true }); };
    return { cv, draw };
  }

  // Best path: WebCodecs encodes every frame exactly (270 frames, faster than real time), then we mux to MP4.
  async function encodeWebCodecs(cert, theme, bitrate, onProgress) {
    const { cv, draw } = makeCanvas();
    let config = null;
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
      const c = { codec, width: VW, height: VH, bitrate, framerate: FPS, avc: { format: 'avc' } };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; }
    }
    if (!config) return null;
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: VW, height: VH, frameRate: FPS }, fastStart: 'in-memory' });
    let failed = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failed = e) });
    enc.configure(config);
    const total = Math.round(Cert.LOOP * FPS);
    for (let i = 0; i < total; i++) {
      if (failed) throw failed;
      draw(OFF + i / FPS, cert, theme);
      const frame = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(frame, { keyFrame: i % (FPS * 3) === 0 });
      frame.close();
      if (enc.encodeQueueSize > 6 || i % 10 === 0) { onProgress && onProgress(i / total); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); enc.close();
    if (failed) throw failed;
    muxer.finalize();
    onProgress && onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  // Fallback for browsers without WebCodecs: record in real time.
  async function encodeRecorder(cert, theme, bitrate, onProgress) {
    const types = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mimeType = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error('This browser cannot make videos. Try Chrome, Edge or Safari.');
    const { cv, draw } = makeCanvas();
    cv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(cv);
    draw(OFF, cert, theme);
    const stream = cv.captureStream(0); const track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    const start = performance.now();
    await new Promise((res) => {
      const id = setInterval(() => {
        const e = (performance.now() - start) / 1000;
        draw(OFF + Math.min(e, Cert.LOOP), cert, theme); track.requestFrame && track.requestFrame();
        onProgress && onProgress(Math.min(1, e / Cert.LOOP));
        if (e >= Cert.LOOP) { clearInterval(id); res(); }
      }, 1000 / FPS);
    });
    rec.stop(); await stopped; stream.getTracks().forEach((t) => t.stop()); cv.remove();
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  }

  async function encodeOnce(cert, theme, bitrate, onProgress) {
    if (window.VideoEncoder && window.VideoFrame && window.Mp4Muxer) {
      try { const b = await encodeWebCodecs(cert, theme, bitrate, onProgress); if (b) return b; } catch (e) { console.warn('WebCodecs failed, falling back', e); }
    }
    return encodeRecorder(cert, theme, bitrate, onProgress);
  }

  // Encodes, and if the file comes out over 3 MB, encodes again at a lower bitrate.
  async function exportVideo(cert, theme, onProgress) {
    let bitrate = 2_200_000, blob;
    for (let i = 0; i < 3; i++) {
      blob = await encodeOnce(cert, theme, bitrate, onProgress);
      if (blob.size <= MAX_BYTES) break;
      bitrate = Math.floor(bitrate * (MAX_BYTES * 0.85) / blob.size);
    }
    return blob;
  }

  async function exportPNG(cert, theme) {
    const cv = document.createElement('canvas'); cv.width = Cert.W; cv.height = Cert.H;
    Cert.render(cv.getContext('2d'), cert, 7.5, { theme, loop: false });
    return new Promise((r) => cv.toBlob(r, 'image/png'));
  }

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function fileBase(cert) {
    return `HackIndia-certificate-${(cert.name || 'participant').replace(/[^\w]+/g, '-')}-${cert.id}`;
  }
  const ext = (blob) => (blob.type.includes('mp4') ? 'mp4' : 'webm');

  // LinkedIn: "Add to profile" pre-fills the Licenses & Certifications form.
  function linkedInAddUrl(cert) {
    const d = new Date((cert.date || '') + 'T00:00:00');
    const tier = (Cert.TIERS[cert.tier] || Cert.TIERS.participant).label;
    const q = new URLSearchParams({
      startTask: 'CERTIFICATION_NAME',
      name: `${tier} · ${cert.event}`,
      organizationName: 'HackIndia',
      certUrl: cert.verifyUrl, certId: cert.id,
    });
    if (!isNaN(d)) { q.set('issueYear', d.getFullYear()); q.set('issueMonth', d.getMonth() + 1); }
    return 'https://www.linkedin.com/profile/add?' + q.toString();
  }
  function linkedInShareUrl(cert) {
    return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(cert.verifyUrl);
  }

  window.CertExport = { exportVideo, exportPNG, download, fileBase, ext, linkedInAddUrl, linkedInShareUrl, MAX_BYTES };
})();
