/*
 * PaintByNumbersGenerator – Runtime extension v1.7
 * Feature: Target SVG size (mm) + Browser Zoom Control
 * 
 * UPDATE: Fixed "Fit to Window".
 * - Uses max-height/max-width logic (contain) instead of forcing width:100%.
 * - Centers the image vertically and horizontally.
 * - Prevents vertical scrolling in Fit mode.
 */

(() => {
  'use strict';

  const DEFAULT_W = 800;
  const DEFAULT_H = 600;
  const LS_KEY = 'pbn_target_size_mm';

  // State for preview display
  let displayScaleMode = 'fit'; // 'fit' or 'custom'
  let displayScaleValue = 100;  // percentage

  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeMm(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, 10, 5000);
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { w: DEFAULT_W, h: DEFAULT_H };
      const obj = JSON.parse(raw);
      return {
        w: normalizeMm(obj.w, DEFAULT_W),
        h: normalizeMm(obj.h, DEFAULT_H),
      };
    } catch {
      return { w: DEFAULT_W, h: DEFAULT_H };
    }
  }

  function save(w, h) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ w, h }));
    } catch { /* ignore */ }
  }

  function ensureSettings() {
    if (!window.__pbnRuntimeSettings) window.__pbnRuntimeSettings = {};
    if (!window.__pbnRuntimeSettings.targetSizeMm) {
      const { w, h } = load();
      window.__pbnRuntimeSettings.targetSizeMm = { w, h };
    }
    return window.__pbnRuntimeSettings;
  }

  function getSvg() {
    const container = document.querySelector('#svgContainer');
    if (!container) return null;
    return container.querySelector('svg');
  }

  function applySizeToSvg(svg, wMm, hMm) {
    if (!svg) return;

    // 1. Ensure viewBox exists
    const currentW = svg.getAttribute('width');
    const currentH = svg.getAttribute('height');

    if (currentW && currentH && !currentW.endsWith('mm') && !currentW.endsWith('%')) {
        const vpW = parseFloat(currentW);
        const vpH = parseFloat(currentH);
        if (!isNaN(vpW) && !isNaN(vpH)) {
            svg.setAttribute('viewBox', `0 0 ${vpW} ${vpH}`);
            svg.setAttribute('data-original-width-px', vpW);
            svg.setAttribute('data-original-height-px', vpH);
        }
    } else if (!svg.hasAttribute('viewBox')) {
        const storedW = svg.getAttribute('data-original-width-px');
        const storedH = svg.getAttribute('data-original-height-px');
        if (storedW && storedH) {
             svg.setAttribute('viewBox', `0 0 ${storedW} ${storedH}`);
        }
    }

    // 2. Set Attributes for EXPORT
    svg.setAttribute('width', `${wMm}mm`);
    svg.setAttribute('height', `${hMm}mm`);

    // 3. Set Styles for PREVIEW
    const container = document.getElementById('svgContainer');
    
    if (displayScaleMode === 'fit') {
        if(container) {
            // Restrict container height to viewport minus headers (~70vh)
            // Use flexbox to center the image if it is smaller than the area
            container.style.height = '70vh'; 
            container.style.maxHeight = '70vh';
            container.style.overflow = 'hidden'; // No scrollbars in fit mode
            container.style.border = '1px solid #f0f0f0';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.backgroundColor = '#fff';
        }
        // Tell SVG to fit inside, maintaining aspect ratio, without exceeding bounds
        svg.style.setProperty('width', 'auto', 'important');
        svg.style.setProperty('height', 'auto', 'important');
        svg.style.setProperty('max-width', '100%', 'important');
        svg.style.setProperty('max-height', '100%', 'important');
    } else {
        // Custom Zoom Mode
        if(container) {
            container.style.height = '70vh';
            container.style.maxHeight = '70vh';
            container.style.overflow = 'auto'; // Scrollbars allowed
            container.style.border = '1px dashed #ccc';
            container.style.display = 'block'; // Normal block layout for scrolling
        }
        // Force width based on slider
        svg.style.setProperty('width', `${displayScaleValue}%`, 'important');
        svg.style.setProperty('height', 'auto', 'important');
        svg.style.setProperty('max-width', 'none', 'important');
        svg.style.setProperty('max-height', 'none', 'important');
    }
  }

  function scheduleApply() {
    const settings = ensureSettings();
    const svg = getSvg();
    if (!svg) return;

    requestAnimationFrame(() => {
      applySizeToSvg(getSvg(), settings.targetSizeMm.w, settings.targetSizeMm.h);
    });
  }

  function injectUI() {
    const settings = ensureSettings();

    // Target #options-pane
    const optionsPane = document.getElementById('options-pane');
    if (!optionsPane) return;

    if (document.querySelector('#pbnTargetSizeFieldset')) return;

    const fieldset = document.createElement('fieldset');
    fieldset.id = 'pbnTargetSizeFieldset';
    fieldset.style.cssText = 'margin:10px 20px; padding:10px; border:1px solid #ccc; border-radius:6px; background: #fff;';

    const legend = document.createElement('legend');
    legend.textContent = 'Output: Size & Preview';
    legend.style.cssText = 'padding:0 6px; font-weight:600; color: #000000;';

    // --- Dimensions Inputs ---
    const rowDims = document.createElement('div');
    rowDims.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;';

    function mkNumber(label, id, value) {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;gap:6px;align-items:center;';
      wrap.setAttribute('for', id);

      const span = document.createElement('span');
      span.textContent = label;

      const input = document.createElement('input');
      input.type = 'number';
      input.id = id;
      input.min = '10';
      input.max = '5000';
      input.step = '1';
      input.value = String(value);
      input.style.cssText = 'width:70px;height:30px;';

      const unit = document.createElement('span');
      unit.textContent = 'mm';
      unit.style.opacity = '0.7';

      wrap.append(span, input, unit);
      return { wrap, input };
    }

    const wCtrl = mkNumber('Width:', 'pbnTargetW', settings.targetSizeMm.w);
    const hCtrl = mkNumber('Height:', 'pbnTargetH', settings.targetSizeMm.h);

    function onSizeChange() {
      const w = normalizeMm(wCtrl.input.value, DEFAULT_W);
      const h = normalizeMm(hCtrl.input.value, DEFAULT_H);
      settings.targetSizeMm = { w, h };
      save(w, h);
      scheduleApply();
    }

    wCtrl.input.addEventListener('input', onSizeChange);
    hCtrl.input.addEventListener('input', onSizeChange);

    rowDims.append(wCtrl.wrap, hCtrl.wrap);

    // --- Preview Zoom UI ---
    const rowScale = document.createElement('div');
    rowScale.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px dashed #ddd;padding-top:10px;';
    
    const fitLabel = document.createElement('label');
    fitLabel.style.display = 'flex';
    fitLabel.style.alignItems = 'center';
    fitLabel.style.cursor = 'pointer';
    
    const fitCheck = document.createElement('input');
    fitCheck.type = 'checkbox';
    fitCheck.checked = true; 
    
    const fitText = document.createElement('span');
    fitText.textContent = 'Fit Preview to Window';
    fitText.style.marginLeft = '5px';
    fitText.style.fontSize = '0.9rem';
    fitText.style.fontWeight = '500';
    fitText.style.color = '#000';
    
    fitLabel.append(fitCheck, fitText);

    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = 'display:none; align-items:center; gap:5px; flex-grow:1;';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '10';
    slider.max = '400';
    slider.value = '100';
    slider.style.cssText = 'margin:0; border:none; padding:0; flex-grow:1; height:30px;';
    
    const sliderVal = document.createElement('span');
    sliderVal.textContent = '100%';
    sliderVal.style.minWidth = '40px';
    sliderVal.style.fontSize = '0.8rem';
    sliderVal.style.textAlign = 'right';

    sliderContainer.append(slider, sliderVal);

    fitCheck.addEventListener('change', () => {
        if (fitCheck.checked) {
            displayScaleMode = 'fit';
            sliderContainer.style.display = 'none';
        } else {
            displayScaleMode = 'custom';
            sliderContainer.style.display = 'flex';
        }
        scheduleApply();
    });

    slider.addEventListener('input', () => {
        displayScaleValue = slider.value;
        sliderVal.textContent = slider.value + '%';
        if (!fitCheck.checked) {
            scheduleApply();
        }
    });

    rowScale.append(fitLabel, sliderContainer);

    fieldset.append(legend, rowDims, rowScale);

    optionsPane.appendChild(fieldset);

    scheduleApply();
  }

  function observeSvgChanges() {
    const container = document.querySelector('#svgContainer');
    if (!container) return;

    const obs = new MutationObserver(() => {
      scheduleApply();
    });

    obs.observe(container, { childList: true, subtree: true });
  }

  window.__pbnGetTargetSizeMm = function __pbnGetTargetSizeMm() {
    const settings = ensureSettings();
    return { ...settings.targetSizeMm };
  };

  function init() {
    injectUI();
    observeSvgChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();