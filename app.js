// Certificate Studio: edit one certificate, preview the animation, export, share, or issue in bulk.
(function () {
  const $ = (id) => document.getElementById(id);
  const today = new Date().toISOString().slice(0, 10);
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const verifyUrlFor = (token) => base + 'verify.html#' + token;

  const SAMPLES = [
    { name: 'Ananya Iyer', tier: 'winner', project: 'Sahayak, voice-first legal help for villages', team: 'Team Nyaya' },
    { name: 'Rohan Mehta', tier: 'runner1', project: 'GridPulse, live power-cut maps', team: 'Volt Rangers' },
    { name: 'Fatima Shaikh', tier: 'runner2', project: 'KrishiLens, crop disease from a photo', team: 'Green Pixel' },
    { name: 'Arjun Nair', tier: 'finalist', project: 'BusBuddy, crowd-sourced bus timings', team: 'Route 404' },
    { name: 'Kavya Reddy', tier: 'participant', project: 'StudySync', team: 'Night Owls' },
  ];

  const cert = {
    id: CertSign.newId(), name: SAMPLES[0].name, tier: 'winner', rank: '', project: SAMPLES[0].project,
    team: SAMPLES[0].team, event: 'HackIndia 2026', date: today, venue: 'New Delhi', verifyUrl: '',
  };
  let theme = 'paper';
  let start = performance.now();
  const fields = ['name', 'tier', 'rank', 'project', 'team', 'event', 'date', 'venue'];

  // tier select
  for (const [k, v] of Object.entries(Cert.TIERS)) $('tier').add(new Option(v.label, k));
  // samples
  SAMPLES.forEach((s, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (i === 0 ? ' on' : ''); b.textContent = s.name.split(' ')[0];
    b.onclick = () => {
      Object.assign(cert, s, { rank: '', id: CertSign.newId() });
      document.querySelectorAll('#samples .chip').forEach((c) => c.classList.toggle('on', c === b));
      fill(); resign(); replay();
    };
    $('samples').appendChild(b);
  });

  function fill() { fields.forEach((f) => ($(f).value = cert[f] || '')); $('rank').placeholder = (Cert.TIERS[cert.tier] || {}).rank || 'none'; }
  fill();

  fields.forEach((f) => $(f).addEventListener('input', () => {
    cert[f] = $(f).value.trim();
    if (f === 'tier') $('rank').placeholder = Cert.TIERS[cert.tier].rank || 'none';
    resignSoon();
  }));

  // signing
  let t0;
  function resignSoon() { clearTimeout(t0); t0 = setTimeout(resign, 250); }
  async function resign() {
    let token;
    try { token = await CertSign.signCert(cert); }
    catch (e) {
      cert.verifyUrl = '';
      $('link').textContent = e.message; $('idOut').textContent = cert.id;
      $('open').removeAttribute('href'); $('liAdd').removeAttribute('href'); $('liShare').removeAttribute('href');
      if (e.code === 'NEED_PASS') $('passWrap').hidden = false;
      return false;
    }
    cert.verifyUrl = verifyUrlFor(token);
    $('link').textContent = cert.verifyUrl;
    $('open').href = cert.verifyUrl;
    $('idOut').textContent = cert.id;
    $('liAdd').href = CertExport.linkedInAddUrl(cert);
    $('liShare').href = CertExport.linkedInShareUrl(cert);
    return true;
  }

  // issuer passcode (live site only)
  if (!CertSign.localSigning()) { $('passWrap').hidden = false; $('pass').value = CertSign.getPass(); }
  $('pass').addEventListener('change', async () => {
    CertSign.setPass($('pass').value.trim());
    toast((await resign()) ? 'Signed. Passcode accepted.' : 'That passcode did not work.');
  });

  // preview loop
  const cv = $('cv'), ctx = cv.getContext('2d');
  function replay() { start = performance.now(); }
  function frame() {
    const t = (performance.now() - start) / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    Cert.render(ctx, cert, t, { theme, loop: true });
    requestAnimationFrame(frame);
  }

  $('replay').onclick = replay;
  $('reroll').onclick = () => { cert.id = CertSign.newId(); resign(); };
  $('theme').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    theme = b.dataset.v; [...$('theme').children].forEach((c) => c.classList.toggle('on', c === b));
  };
  $('copy').onclick = async () => { await navigator.clipboard.writeText(cert.verifyUrl); toast('Verify link copied'); };

  // exports
  let lastVideo = null;
  $('dlVideo').onclick = async () => {
    if (!cert.verifyUrl) return toast('Sign the certificate first (issuer passcode).');
    const btn = $('dlVideo'), label = btn.querySelector('span'), bar = btn.querySelector('.bar');
    btn.disabled = true; label.textContent = 'Recording…';
    try {
      const snap = { ...cert };
      const blob = await CertExport.exportVideo(snap, theme, (p) => (bar.style.width = p * 100 + '%'));
      lastVideo = { blob, name: CertExport.fileBase(snap) + '.' + CertExport.ext(blob) };
      CertExport.download(blob, lastVideo.name);
      const mb = (blob.size / 1048576).toFixed(2);
      $('vidInfo').textContent = `Last video: ${mb} MB ${CertExport.ext(blob).toUpperCase()} · 9 s seamless loop`;
      toast(`Saved ${mb} MB video`);
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], lastVideo.name, { type: blob.type })] })) $('shareFile').hidden = false;
      if (!blob.type.includes('mp4')) toast('This browser saved WebM. Use Chrome or Edge for MP4, which LinkedIn accepts.');
    } catch (e) { toast(e.message || 'Could not record video'); }
    btn.disabled = false; label.textContent = 'Download video'; bar.style.width = '0';
  };
  $('dlPng').onclick = async () => !cert.verifyUrl ? toast('Sign the certificate first (issuer passcode).') : CertExport.download(await CertExport.exportPNG({ ...cert }, theme), CertExport.fileBase(cert) + '.png');
  $('shareFile').onclick = async () => {
    if (!lastVideo) return;
    try { await navigator.share({ files: [new File([lastVideo.blob], lastVideo.name, { type: lastVideo.blob.type })], text: `My certificate from ${cert.event}. Verify it here: ${cert.verifyUrl}` }); } catch (e) {}
  };

  // bulk
  $('csv').value = SAMPLES.map((s) => [s.name, s.tier, s.project, s.team].join(', ')).join('\n');
  let issued = [];
  $('issue').onclick = async () => {
    const lines = $('csv').value.split('\n').map((l) => l.trim()).filter(Boolean);
    const batch = [];
    for (const line of lines) {
      const [name, tierRaw, project, team] = line.split(',').map((x) => (x || '').trim());
      if (!name) continue;
      const tier = Cert.TIERS[(tierRaw || '').toLowerCase()] ? tierRaw.toLowerCase() : 'participant';
      batch.push({ id: CertSign.newId(), name: name.slice(0, 40), tier, rank: '', project: (project || '').slice(0, 60), team: (team || '').slice(0, 30), event: cert.event, date: cert.date, venue: cert.venue });
    }
    let tokens;
    try { tokens = await CertSign.signMany(batch); } catch (e) { toast(e.message); if (e.code === 'NEED_PASS') { $('passWrap').hidden = false; $('pass').focus(); } return; }
    issued = [];
    const tbody = $('rows'); tbody.innerHTML = '';
    batch.forEach((c, i) => {
      if (!tokens[i]) return;
      c.verifyUrl = verifyUrlFor(tokens[i]);
      issued.push(c);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td></td><td></td><td class="mono"></td><td style="text-align:right;white-space:nowrap"></td>`;
      tr.children[0].textContent = c.name; tr.children[1].textContent = Cert.TIERS[c.tier].label; tr.children[2].textContent = c.id;
      const view = document.createElement('button'); view.className = 'btn'; view.textContent = 'Preview';
      view.onclick = () => { Object.assign(cert, c); fill(); resign(); replay(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      const link = document.createElement('a'); link.className = 'btn'; link.textContent = 'Open'; link.href = c.verifyUrl; link.target = '_blank';
      tr.children[3].append(view, ' ', link);
      tbody.appendChild(tr);
    });
    $('csvOut').disabled = !issued.length;
    toast(`Issued ${issued.length} certificates`);
  };
  $('csvOut').onclick = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['name', 'achievement', 'id', 'verify_url', 'linkedin_add_url']].concat(
      issued.map((c) => [c.name, Cert.TIERS[c.tier].label, c.id, c.verifyUrl, CertExport.linkedInAddUrl(c)]));
    CertExport.download(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }), 'hackindia-certificates.csv');
  };

  let tt;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2600); }

  Cert.ready().then(() => { resign(); replay(); requestAnimationFrame(frame); });
})();
