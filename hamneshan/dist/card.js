const CARD_SIZE = 1080;
const THEMES = {
  mint: { paper: '#fffdf5', ink: '#173d37', main: '#167563', light: '#d8eee1', accent: '#c0b1f0', peach: '#f3bd9d' },
  lavender: { paper: '#fcf9ff', ink: '#3a3153', main: '#6c58a5', light: '#eee5fa', accent: '#a5d7c5', peach: '#f5bd9d' },
  peach: { paper: '#fffaf5', ink: '#594032', main: '#bb6b48', light: '#fae5d5', accent: '#b9b0dc', peach: '#b4d8c6' },
};

/** Only public birthday wording: never includes a phone, class, birthday year, or address. */
export function makeCaption(record, schoolName = '') {
  const name = String(record?.name || 'دوست عزیز').trim();
  const school = String(schoolName || 'خانوادهٔ مدرسه').trim();
  if (record?.type === 'teacher') {
    return `همکار گرامی، ${name}\nزادروزتان مبارک! برایتان تندرستی، آرامش و روزهایی سرشار از شادی و موفقیت آرزو می‌کنیم.\nبا مهر، ${school}`;
  }
  return `${name} عزیز، تولدت مبارک!\nامیدواریم سال تازهٔ زندگی‌ات پر از کشف‌های تازه، دوستی‌های خوب و رسیدن به آرزوهای قشنگت باشد.\nبا مهر، ${school}`;
}

let fontPromise;
async function loadCardFonts() {
  if (!fontPromise) {
    fontPromise = (async () => {
      if (typeof FontFace === 'undefined' || !document.fonts) return false;
      const fonts = [
        ['B Titr', 'BTitrBold.woff'],
        ['B Koodak', 'BKoodakBold.woff'],
      ];
      const results = await Promise.all(fonts.map(async ([family, file]) => {
        const face = new FontFace(family, `url("${new URL(`./assets/fonts/${file}`, import.meta.url).href}")`, { weight: '700' });
        try { document.fonts.add(await face.load()); return true; } catch { return false; }
      }));
      await document.fonts.ready;
      return results.every(Boolean);
    })();
  }
  return fontPromise;
}

function safeImageSource(source) {
  if (typeof source !== 'string') return null;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(source)) return source;
  if (!/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(source)) return null;
  // Keep vector logos local, removing executable elements and external references.
  try {
    const comma = source.indexOf(',');
    const header = source.slice(0, comma);
    const svgText = /;base64/i.test(header)
      ? new TextDecoder().decode(Uint8Array.from(atob(source.slice(comma + 1)), c => c.charCodeAt(0)))
      : decodeURIComponent(source.slice(comma + 1));
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') return null;
    doc.querySelectorAll('script,foreignObject,iframe,object,embed,image,use').forEach(el => {
      if (['image', 'use'].includes(el.localName)) {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (href && !href.startsWith('#') && !href.startsWith('data:image/')) el.remove();
      } else el.remove();
    });
    for (const node of doc.querySelectorAll('*')) {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name.endsWith(':href')) && !attr.value.startsWith('#') && !attr.value.startsWith('data:image/'))) node.removeAttribute(attr.name);
        if (/url\s*\(\s*["']?\s*(?!#|data:)/i.test(attr.value)) node.removeAttribute(attr.name);
      }
    }
    for (const style of doc.querySelectorAll('style')) {
      if (/@import|url\s*\(/i.test(style.textContent || '')) style.remove();
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(doc.documentElement))}`;
  } catch { return null; }
}

async function localImage(source) {
  if (!source) return null;
  const safe = safeImageSource(source);
  if (!safe) return null;
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => { img.onload = null; img.onerror = null; resolve(null); }, 5000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth && img.naturalHeight ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = safe;
  });
}

function circle(ctx, x, y, radius, fill) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

function roundedRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = fill; ctx.fill();
}

function star(ctx, x, y, size, color, rotation = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI / 4) - Math.PI / 2;
    const r = i % 2 ? size * .27 : size;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
}

function font(ctx, size, heading = false) {
  ctx.font = `700 ${size}px "${heading ? 'B Titr' : 'B Koodak'}", Tahoma, sans-serif`;
}

function fitSingleLine(ctx, text, maximum, initialSize, heading = false, minimum = 26) {
  let size = initialSize;
  font(ctx, size, heading);
  while (ctx.measureText(text).width > maximum && size > minimum) font(ctx, --size, heading);
  return size;
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
      else line = next;
      // A pasted URL/long uninterrupted text should not run beyond the artwork.
      if (ctx.measureText(line).width > maxWidth) {
        let segment = '';
        for (const char of Array.from(line)) {
          if (segment && ctx.measureText(segment + char).width > maxWidth) { lines.push(segment); segment = char; }
          else segment += char;
        }
        line = segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Draw an exportable 1080px square card. Images must be local data:image URLs.
 * Returns warnings for unavailable assets; rejects captions that cannot fit.
 */
export async function renderBirthdayCard(canvas, record, options = {}) {
  const { schoolName = '', logo = null, theme = 'mint' } = options;
  const caption = String(options.caption ?? makeCaption(record, schoolName));
  if (!canvas?.getContext) throw new Error('بوم کارت در دسترس نیست.');
  const warnings = [];
  const [fontsLoaded, photoImage, logoImage] = await Promise.all([loadCardFonts(), localImage(record?.photo), localImage(logo)]);
  if (!fontsLoaded) warnings.push('بارگذاری فونت کارت کامل نشد.');
  if (record?.photo && !photoImage) warnings.push('عکس شخص قابل خواندن نیست؛ نشان نام جایگزین شد.');
  if (logo && !logoImage) warnings.push('لوگو قابل خواندن نیست.');
  const colors = THEMES[theme] || THEMES.mint;
  canvas.width = CARD_SIZE; canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('امکان ساخت تصویر در این مرورگر فراهم نیست.');
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  // Offset oversized shapes make the card lively without competing with the person.
  circle(ctx, 30, 365, 145, colors.light);
  circle(ctx, 1077, 748, 156, colors.accent);
  circle(ctx, 1020, -50, 210, colors.light);
  ctx.save(); ctx.strokeStyle = colors.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(30, 365, 172, -.9, .9); ctx.stroke(); ctx.restore();
  for (const [x, y, size, color, angle] of [
    [152, 174, 22, colors.main, .12], [905, 245, 28, colors.peach, .2],
    [227, 424, 15, colors.accent, .12], [872, 499, 16, colors.main, .18],
    [144, 779, 14, colors.peach, .3], [905, 895, 17, colors.main, .3],
  ]) star(ctx, x, y, size, color, angle);
  circle(ctx, 239, 239, 6, colors.peach); circle(ctx, 820, 165, 5, colors.accent);
  circle(ctx, 138, 535, 5, colors.main); circle(ctx, 927, 610, 6, colors.peach);

  const school = String(schoolName || 'با مهر، از خانوادهٔ مدرسه').trim();
  if (logoImage) {
    // The supplied school mark is pale cream; a school-green field preserves contrast.
    roundedRect(ctx, 496, 17, 88, 80, 17, '#214d40');
    const logoBox = 62;
    const ratio = Math.min(logoBox / logoImage.naturalWidth, logoBox / logoImage.naturalHeight);
    const w = logoImage.naturalWidth * ratio, h = logoImage.naturalHeight * ratio;
    ctx.drawImage(logoImage, 540 - w / 2, 57 - h / 2, w, h);
    fitSingleLine(ctx, school, 780, 29); ctx.fillStyle = colors.ink; ctx.fillText(school, 540, 124);
  } else {
    fitSingleLine(ctx, school, 800, 31); ctx.fillStyle = colors.ink; ctx.fillText(school, 540, 89);
  }
  font(ctx, 84, true); ctx.fillStyle = colors.main; ctx.fillText('تولدت مبارک', 540, 202);

  const photoY = 398, radius = 137;
  circle(ctx, 540, photoY + 8, radius + 14, colors.light);
  circle(ctx, 540, photoY, radius + 8, colors.paper);
  if (photoImage) {
    ctx.save(); ctx.beginPath(); ctx.arc(540, photoY, radius, 0, Math.PI * 2); ctx.clip();
    const ratio = Math.max(radius * 2 / photoImage.naturalWidth, radius * 2 / photoImage.naturalHeight);
    const w = photoImage.naturalWidth * ratio, h = photoImage.naturalHeight * ratio;
    ctx.drawImage(photoImage, 540 - w / 2, photoY - h / 2, w, h); ctx.restore();
  } else {
    circle(ctx, 540, photoY, radius, colors.light);
    const initials = String(record?.name || 'شما').trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join(' ');
    font(ctx, 68, true); ctx.fillStyle = colors.main; ctx.fillText(initials, 540, photoY - 5);
    font(ctx, 23); ctx.fillStyle = colors.main; ctx.fillText('نشان نام', 540, photoY + 64);
  }
  ctx.strokeStyle = colors.main; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(540, photoY, radius + 3, 0, Math.PI * 2); ctx.stroke();
  star(ctx, 688, 484, 27, colors.peach, .15);
  const name = String(record?.name || 'دوست عزیز').trim();
  fitSingleLine(ctx, name, 890, 57, true, 25); ctx.fillStyle = colors.ink; ctx.fillText(name, 540, 600);
  const personLabel = record?.type === 'teacher' ? 'همکار گرامی' : 'ستارهٔ عزیز مدرسه';
  font(ctx, 28); ctx.fillStyle = colors.main; ctx.fillText(personLabel, 540, 651);

  let captionSize = 36, lines, lineHeight;
  do {
    font(ctx, captionSize);
    lines = wrapText(ctx, caption, 850);
    lineHeight = captionSize * 1.46;
    if (lines.length * lineHeight <= 224) break;
    captionSize--;
  } while (captionSize >= 20);
  if (captionSize < 20) throw new Error('متن کارت خیلی طولانی است؛ برای خوانایی آن را کوتاه‌تر کنید.');
  ctx.fillStyle = colors.ink;
  const captionStartY = 702 + (224 - lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((line, index) => ctx.fillText(line, 540, captionStartY + index * lineHeight));

  roundedRect(ctx, 48, 980, 984, 59, 20, colors.main);
  font(ctx, 28); ctx.fillStyle = colors.paper;
  ctx.fillText('یک سال تازه، هزار فرصت درخشان', 540, 1009);
  return { warnings };
}
