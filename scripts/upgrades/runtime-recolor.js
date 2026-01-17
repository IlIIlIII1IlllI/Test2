/*
 * PaintByNumbersGenerator – Runtime Recolor v4.3 (Sync Fix + Highlighting)
 * English Translation
 */

(() => {
  'use strict';

  // --- STATE MANAGEMENT ---
  const STATE = {
    palette: [], 
    mapping: new Map(),
    indexMap: new Map() 
  };

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function getSvg() {
    const c = $('#svgContainer');
    return c ? c.querySelector('svg') : null;
  }

  function injectStyles() {
    if ($('#pbn-styles')) return;
    const style = document.createElement('style');
    style.id = 'pbn-styles';
    style.textContent = `
      .pbn-highlight-path {
        stroke: #ff0000 !important;
        stroke-width: 3px !important;
        vector-effect: non-scaling-stroke;
        opacity: 0.9 !important;
      }
      .pbn-highlight-text {
        fill: #ff0000 !important;
        font-weight: bold;
        font-size: 1.2em;
      }
      .pbn-row-hover {
        background-color: #e0f2f1 !important;
        cursor: crosshair;
      }
    `;
    document.head.appendChild(style);
  }

  // --- COLOR UTILS ---
  function rgbToHex(r, g, b) {
    const to = (x) => x.toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  function parseColorToHex(color) {
    if (!color) return null;
    const c = String(color).trim().toLowerCase();
    if (!c || c === 'none' || c === 'transparent') return null;

    if (c.startsWith('#')) {
      if (c.length === 4) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
      return c.substring(0, 7);
    }
    if (c.startsWith('rgb')) {
      const parts = c.match(/\d+/g);
      if (parts && parts.length >= 3) return rgbToHex(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    return null;
  }

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h: h < 0 ? h + 360 : h, s, l };
  }

  // --- SORTING LOGIC ---
  function getCategory(h, s, l) {
    if (l > 0.90) return { order: 1, label: '⚪ White / Light' };
    if (l < 0.1) return { order: 99, label: '⚫ Black / Dark' };
    if (s < 0.12) return { order: 90, label: '🌫️ Gray / Neutral' };
    if (h >= 330 || h < 60) return { order: 10, label: '🟡🔴 Yellow & Red' };
    if (h >= 60 && h < 170) return { order: 20, label: '🟢 Green & Cyan' };
    return { order: 30, label: '🔵🟣 Blue & Purple' };
  }

  // --- CORE ANALYSIS ---
  function analyzeOriginalData() {
    const rawPalette = [];
    const tiles = $all('#palette .color');
    
    tiles.forEach(tile => {
      const bg = parseColorToHex(tile.style.backgroundColor);
      let nr = tile.getAttribute('data-orig-id');
      
      if (!nr) {
        nr = tile.innerText.trim();
        if (nr !== '') {
            tile.setAttribute('data-orig-id', nr);
        }
      }

      if (bg && nr !== '') {
        if (!tile.hasAttribute('data-orig-bg')) {
          tile.setAttribute('data-orig-bg', bg);
        }
        
        rawPalette.push({
          id: nr,
          origHex: bg
        });
      }
    });
    return rawPalette;
  }

  function arePalettesEqual(oldPalette, newRawData) {
    if (!oldPalette || oldPalette.length === 0) return false;
    if (oldPalette.length !== newRawData.length) return false;

    const oldMap = new Map();
    oldPalette.forEach(p => oldMap.set(p.id, p.origHex));

    for (const newItem of newRawData) {
        if (!oldMap.has(newItem.id)) return false;
        if (oldMap.get(newItem.id) !== newItem.origHex) return false;
    }
    return true;
  }

  function refreshStateFromDom() {
    const newRawData = analyzeOriginalData();
    const isSameImage = arePalettesEqual(STATE.palette, newRawData);

    if (!isSameImage) {
        STATE.mapping.clear();
    }
    STATE.palette = newRawData;
    performResort();
  }

  function performResort() {
    STATE.palette.forEach(item => {
        const currentHex = STATE.mapping.get(item.origHex) || item.origHex;
        const rgb = hexToRgb(currentHex) || {r:0,g:0,b:0};
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const cat = getCategory(hsl.h, hsl.s, hsl.l);

        item.groupOrder = cat.order;
        item.groupLabel = cat.label;
        item.light = hsl.l;
    });

    STATE.palette.sort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      return b.light - a.light;
    });

    STATE.indexMap.clear();
    STATE.palette.forEach((item, idx) => {
      const newNr = idx + 1;
      STATE.indexMap.set(item.id, newNr);
      item.newNr = newNr;
    });

    updateRuntimeInterface();
    updateNativePalette();
    updateSvgContent();
  }

  function toggleHighlight(originalId, originalHex, active) {
    const svg = getSvg();
    if (!svg) return;

    const paths = $all(`path[data-orig-fill="${originalHex}"]`, svg);
    paths.forEach(p => {
        if (active) p.classList.add('pbn-highlight-path');
        else p.classList.remove('pbn-highlight-path');
    });

    const texts = $all(`text[data-orig-text="${originalId}"]`, svg);
    texts.forEach(t => {
        if (active) t.classList.add('pbn-highlight-text');
        else t.classList.remove('pbn-highlight-text');
    });
  }

  function updateRuntimeInterface() {
    const list = $('#pbnRecolorList');
    if (!list) return;
    
    const scrollPos = list.scrollTop;
    list.innerHTML = '';

    let lastLabel = '';

    STATE.palette.forEach(item => {
      const currentHex = STATE.mapping.get(item.origHex) || item.origHex;

      if (item.groupLabel !== lastLabel) {
        const h = document.createElement('div');
        h.style.cssText = 'padding:6px 0 2px 0;margin-top:5px;font-size:0.75rem;font-weight:bold;color:#666;border-bottom:1px solid #eee;';
        h.textContent = item.groupLabel;
        list.appendChild(h);
        lastLabel = item.groupLabel;
      }

      const row = document.createElement('div');
      row.className = 'pbn-row';
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:2px;padding:2px 0;border-radius:4px;transition:background 0.2s;';

      row.addEventListener('mouseenter', () => {
          row.classList.add('pbn-row-hover');
          toggleHighlight(item.id, item.origHex, true);
      });
      row.addEventListener('mouseleave', () => {
          row.classList.remove('pbn-row-hover');
          toggleHighlight(item.id, item.origHex, false);
      });

      const nr = document.createElement('div');
      nr.textContent = `#${item.newNr}`;
      nr.style.cssText = 'font-weight:bold;width:30px;text-align:right;font-size:12px;color:#333;pointer-events:none;';

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = currentHex;
      inp.style.cssText = `
        width:70px; height:24px; font-size:12px; border:1px solid #ccc; padding:0 4px; margin:0;
        background-color: ${currentHex};
        color: ${getContrastYIQ(currentHex)};
        text-shadow: none;
      `;
      
      inp.addEventListener('change', (e) => {
        let val = e.target.value.trim();
        if (/^[0-9a-f]{6}$/i.test(val)) val = '#' + val;
        
        const valid = parseColorToHex(val);
        if (valid) {
          STATE.mapping.set(item.origHex, valid);
        } else {
          STATE.mapping.delete(item.origHex);
        }
        
        requestAnimationFrame(() => {
            performResort();
        });
      });

      row.append(nr, inp);
      list.appendChild(row);
    });

    list.scrollTop = scrollPos;
  }

  function updateNativePalette() {
    const container = $('#palette');
    if (!container) return;

    container.innerHTML = '';

    STATE.palette.forEach(item => {
      const currentHex = STATE.mapping.get(item.origHex) || item.origHex;
      
      const div = document.createElement('div');
      div.className = 'color tooltipped';
      div.style.cssText = `
        float: left; width: 40px; height: 40px; 
        border: 1px solid #AAA; border-radius: 5px; 
        text-align: center; padding: 5px; font-weight: 600; margin: 5px;
        background-color: ${currentHex};
        color: ${getContrastYIQ(currentHex)};
        text-shadow: none;
      `;
      div.innerText = item.newNr;
      div.setAttribute('data-tooltip', `Original ID: ${item.id} | Hex: ${currentHex}`);
      div.setAttribute('data-orig-id', item.id);
      div.setAttribute('data-orig-bg', item.origHex);
      
      container.appendChild(div);
    });
    
    if (window.M && M.Tooltip) M.Tooltip.init($all('.tooltipped'));
  }

  function updateSvgContent() {
    const svg = getSvg();
    if (!svg) return;

    $all('path, polygon, rect, circle', svg).forEach(el => {
        let hex = el.getAttribute('data-orig-fill');
        if (!hex) {
            hex = parseColorToHex(el.getAttribute('fill') || el.style.fill);
            if (hex) el.setAttribute('data-orig-fill', hex);
        }

        if (hex) {
            const newHex = STATE.mapping.get(hex);
            if (newHex) {
                el.setAttribute('fill', newHex);
                el.style.fill = newHex;
            } else {
                el.setAttribute('fill', hex);
                el.style.fill = hex;
            }
        }
    });

    $all('text', svg).forEach(el => {
        let originalId = el.getAttribute('data-orig-text');
        
        if (!originalId) {
            const textContent = el.textContent.trim();
            if (/^\d+$/.test(textContent)) {
                originalId = textContent;
                el.setAttribute('data-orig-text', originalId);
            } else {
                return;
            }
        }

        const newNr = STATE.indexMap.get(originalId);
        if (newNr !== undefined) {
            el.textContent = newNr;
        }
    });
  }

  function hijackDownloadButton() {
    const btn = $('#btnDownloadPalettePNG');
    if (!btn) return;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      generateCustomPalettePng();
    });
  }

  function generateCustomPalettePng() {
    const canvas = document.createElement("canvas");
    const items = STATE.palette; 

    const nrOfItemsPerRow = 5; 
    const nrRows = Math.ceil(items.length / nrOfItemsPerRow);
    
    const margin = 20;
    const cellWidth = 150;
    const cellHeight = 100;

    canvas.width = margin + nrOfItemsPerRow * (cellWidth + margin);
    canvas.height = margin + nrRows * (cellHeight + margin);
    
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    items.forEach((item, i) => {
      const currentHex = STATE.mapping.get(item.origHex) || item.origHex;
      
      const col = i % nrOfItemsPerRow;
      const row = Math.floor(i / nrOfItemsPerRow);

      const x = margin + col * (cellWidth + margin);
      const y = margin + row * (cellHeight + margin);

      ctx.fillStyle = currentHex;
      ctx.fillRect(x, y, cellWidth, cellHeight - 30);
      
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellWidth, cellHeight - 30);

      ctx.fillStyle = getContrastYIQ(currentHex);
      ctx.fillText(item.newNr, x + cellWidth / 2, y + (cellHeight - 30) / 2);

      ctx.fillStyle = "black";
      ctx.font = "14px Arial";
      ctx.fillText(currentHex, x + cellWidth / 2, y + cellHeight - 10);
      
      ctx.font = "bold 24px Arial";
    });

    const link = document.createElement('a');
    link.download = 'Sorted_Palette.png';
    link.href = canvas.toDataURL();
    link.click();
  }

  function getContrastYIQ(hexcolor){
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
  }

  function ensurePanel() {
    if ($('#pbnRecolorPanel')) return;
    const anchor = $('#output-pane .row:last-child') || $('#output-pane');
    if (!anchor) return;

    const panel = document.createElement('div');
    panel.id = 'pbnRecolorPanel';
    panel.className = 'card-panel';
    panel.style.cssText = 'margin-top:20px;padding:15px;background:#fafafa;border-left:5px solid #26a69a;';
    
    panel.innerHTML = `
      <h5 style="margin-top:0;font-size:1.2rem;">🎨 Palette & Colors</h5>
      <p style="font-size:0.8rem;color:#666;">
        Colors have been automatically sorted (White -> Chromatic -> Black).<br>
        Change colors here. <b>Note:</b> Numbers in the image adapt to the new sorting order!
        <br><i>Tip: Hover over a color to find it in the image.</i>
      </p>
      <div id="pbnRecolorList" style="max-height:400px;overflow-y:auto;padding-right:10px;"></div>
    `;

    anchor.parentElement.appendChild(panel);
  }

  function init() {
    injectStyles();
    
    const container = $('#svgContainer');
    if (container) {
      const obs = new MutationObserver((mutations) => {
        const hasSvg = mutations.some(m => Array.from(m.addedNodes).some(n => n.nodeName === 'svg'));
        if (hasSvg) {
          setTimeout(() => {
            refreshStateFromDom(); 
            hijackDownloadButton();
          }, 500);
        }
      });
      obs.observe(container, { childList: true });
    }

    ensurePanel();
    
    if (getSvg()) {
        refreshStateFromDom();
        hijackDownloadButton();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();