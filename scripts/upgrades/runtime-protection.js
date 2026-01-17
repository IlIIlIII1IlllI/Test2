/*
 * PaintByNumbersGenerator – Runtime Protection v3.2 (Single Interaction & Persistence)
 * 
 * Features:
 * - Interactive protection opens only on the first cleanup run.
 * - Saves coordinates of protected areas to automatically find them in subsequent runs (where IDs change).
 * - Zoom & Smart Filter included.
 */

(() => {
  'use strict';

  // --- STATE ---
  const STATE = {
    enabled: false,
    isPaused: false,
    hasShownUI: false,
    
    // Data
    protectedIds: new Set(),
    protectedCoords: [],
    candidates: new Set(),
    ignoredIds: new Set(),
    
    // References
    facetResult: null,
    colorsByIndex: null,
    resolveFunc: null,
    
    // UI Settings
    zoomLevel: 2.0,      
    filterPercent: 50,   
    
    // Canvas
    canvas: null,
    ctx: null
  };

  function $(id) { return document.getElementById(id); }

  // --- UI INTEGRATION ---
  function injectUI() {
    const parent = document.querySelector('#options-pane .collection');
    if (!parent || $('pbnProtectionItem')) return;

    const li = document.createElement('li');
    li.id = 'pbnProtectionItem';
    li.className = 'collection-item';
    
    li.innerHTML = `
      <div class="row" style="margin-bottom:0;">
        <div class="col s12">
           <label style="font-size:1rem; color:#000; font-weight:500;">🛡️ Interactive Detail Protection v3.2</label>
        </div>
        
        <div class="col s4" style="margin-top:10px;">
           <div class="switch">
            <label>
              Off
              <input id="chkEnableProtection" type="checkbox">
              <span class="lever"></span>
              On
            </label>
          </div>
        </div>

        <div class="input-field col s4" style="margin-top:0;">
            <input id="txtProtectionZoom" type="number" value="2" min="1" max="10" step="0.5">
            <label for="txtProtectionZoom" class="active">Preview Zoom (x)</label>
        </div>

        <div class="input-field col s4" style="margin-top:0;">
            <input id="txtProtectionFilter" type="number" value="50" min="0" max="100">
            <label for="txtProtectionFilter" class="active">Filter % (Dust)</label>
        </div>
        
        <div class="col s12">
            <p style="font-size:0.8rem; margin:0; color:#666;">
            Pauses <b>once</b> during the first run. <br>
            <b>Red:</b> Will be removed. <b>Green:</b> Protected (saved for subsequent runs).
            </p>
        </div>
      </div>
    `;

    parent.insertBefore(li, parent.children[3]);

    $('chkEnableProtection').addEventListener('change', (e) => STATE.enabled = e.target.checked);
    
    $('txtProtectionZoom').addEventListener('change', (e) => {
        STATE.zoomLevel = parseFloat(e.target.value) || 1;
        if(STATE.isPaused) drawInteractiveScreen(); 
    });

    $('txtProtectionFilter').addEventListener('change', (e) => {
        STATE.filterPercent = parseInt(e.target.value) || 0;
        if(STATE.isPaused) {
            recalcCandidates(STATE.threshold);
            drawInteractiveScreen();
        }
    });

    const processBtn = $('btnProcess');
    if (processBtn) {
        processBtn.addEventListener('click', () => {
            STATE.hasShownUI = false;
            STATE.protectedCoords = [];
            STATE.protectedIds.clear();
        });
    }

    const floatBtn = document.createElement('div');
    floatBtn.id = 'pbnContinueBtn';
    floatBtn.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; z-index: 9999;
        display: none; padding: 15px 25px; background: #26a69a; color: white;
        font-weight: bold; font-size: 16px; border-radius: 50px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer;
        transition: transform 0.2s;
    `;
    floatBtn.innerHTML = 'Continue <i class="material-icons" style="vertical-align:middle;">play_arrow</i>';
    floatBtn.onclick = resumeProcess;
    document.body.appendChild(floatBtn);

    const style = document.createElement('style');
    style.textContent = `
        #reduction-pane {
            overflow: auto !important;
            max-height: 80vh;
            background: #e0e0e0;
            text-align: center;
        }
        #cReduction {
            margin: 0 auto;
            box-shadow: 0 0 20px rgba(0,0,0,0.2);
            background: white;
            image-rendering: pixelated;
        }
    `;
    document.head.appendChild(style);
  }

  function getRepresentativePoint(facetId, facetResult) {
      const f = facetResult.facets[facetId];
      if (!f) return null;
      for (let y = f.bbox.minY; y <= f.bbox.maxY; y++) {
          for (let x = f.bbox.minX; x <= f.bbox.maxX; x++) {
              if (facetResult.facetMap.get(x, y) === facetId) {
                  return { x, y };
              }
          }
      }
      return null;
  }

  function recalcCandidates(smallerThan) {
      if (!STATE.facetResult) return;
      STATE.candidates.clear();
      STATE.ignoredIds.clear();
      
      const minSize = Math.floor(smallerThan * (STATE.filterPercent / 100));

      for (const f of STATE.facetResult.facets) {
          if (!f) continue;
          if (f.pointCount < smallerThan) {
              if (f.pointCount < minSize) {
                  STATE.ignoredIds.add(f.id); 
              } else {
                  STATE.candidates.add(f.id);
              }
          }
      }
      
      const btn = $('pbnContinueBtn');
      if(btn) btn.innerHTML = `Continue (Delete ${STATE.candidates.size} areas) <i class="material-icons" style="vertical-align:middle;">play_arrow</i>`;
  }

  function drawInteractiveScreen() {
    if (!STATE.canvas || !STATE.facetResult) return;
    
    const width = STATE.facetResult.width;
    const height = STATE.facetResult.height;
    const map = STATE.facetResult.facetMap;
    const colors = STATE.colorsByIndex; 
    
    const displayW = Math.floor(width * STATE.zoomLevel);
    const displayH = Math.floor(height * STATE.zoomLevel);
    
    STATE.canvas.width = displayW;
    STATE.canvas.height = displayH;
    
    STATE.ctx.scale(STATE.zoomLevel, STATE.zoomLevel);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = width;
    bgCanvas.height = height;
    const bgCtx = bgCanvas.getContext('2d');
    const imgData = bgCtx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < width * height; i++) {
        const x = i % width;
        const y = Math.floor(i / width);
        const id = map.get(x, y);
        
        let r=255, g=255, b=255;
        
        const facet = STATE.facetResult.facets[id];
        if (facet) {
            const col = colors[facet.color]; 
            r = col[0]; g = col[1]; b = col[2];
            
            if (STATE.protectedIds.has(id)) {
                r = (r + 0) / 2; g = (g + 255) / 2; b = (b + 0) / 2;
            } else if (STATE.candidates.has(id)) {
                r = (r + 255) / 2; g = (g + 0) / 2; b = (b + 0) / 2;
            } else if (STATE.ignoredIds.has(id)) {
                r = (r + 200) / 2; g = (g + 200) / 2; b = (b + 200) / 2;
            }
        }

        const idx = i * 4;
        data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
    }
    
    bgCtx.putImageData(imgData, 0, 0);

    STATE.ctx.imageSmoothingEnabled = false;
    STATE.ctx.drawImage(bgCanvas, 0, 0);

    STATE.ctx.fillStyle = "rgba(0,0,0,0.5)"; 
    
    const drawBorders = (id, color) => {
        const f = STATE.facetResult.facets[id];
        if (!f || !f.borderPoints) return;

        STATE.ctx.fillStyle = color;
        for (const pt of f.borderPoints) {
            STATE.ctx.fillRect(pt.x, pt.y, 1, 1);
        }
    };

    STATE.candidates.forEach(id => {
        if (!STATE.protectedIds.has(id)) drawBorders(id, "rgba(200, 0, 0, 0.8)");
    });

    STATE.protectedIds.forEach(id => {
        drawBorders(id, "rgba(0, 150, 0, 0.9)");
    });
  }

  function handleCanvasClick(e) {
    if (!STATE.isPaused || !STATE.facetResult) return;

    const rect = STATE.canvas.getBoundingClientRect();
    const scaleX = STATE.canvas.width / rect.width;
    const scaleY = STATE.canvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const originalX = Math.floor(canvasX / STATE.zoomLevel);
    const originalY = Math.floor(canvasY / STATE.zoomLevel);

    if (originalX < 0 || originalX >= STATE.facetResult.width || originalY < 0 || originalY >= STATE.facetResult.height) return;

    const id = STATE.facetResult.facetMap.get(originalX, originalY);

    if (STATE.candidates.has(id) || STATE.ignoredIds.has(id)) {
        if (STATE.protectedIds.has(id)) {
            STATE.protectedIds.delete(id);
        } else {
            STATE.protectedIds.add(id);
        }
        requestAnimationFrame(drawInteractiveScreen);
    }
  }

  function resumeProcess() {
    if (STATE.resolveFunc) {
        STATE.protectedCoords = [];
        STATE.protectedIds.forEach(id => {
            const pt = getRepresentativePoint(id, STATE.facetResult);
            if (pt) STATE.protectedCoords.push(pt);
        });

        $('pbnContinueBtn').style.display = 'none';
        STATE.canvas.style.cursor = 'default';
        STATE.canvas.removeEventListener('mousedown', handleCanvasClick);
        STATE.isPaused = false;
        STATE.hasShownUI = true;

        STATE.resolveFunc();
    }
  }

  function patchFacetReducer() {
    if (typeof window.require !== 'function') return;

    window.require(['facetReducer'], function(FacetReducerModule) {
      if (!FacetReducerModule || !FacetReducerModule.FacetReducer) return;

      const FacetReducer = FacetReducerModule.FacetReducer;
      
      if (!FacetReducer._originalReduceFacets) {
        FacetReducer._originalReduceFacets = FacetReducer.reduceFacets;
      }

      FacetReducer.reduceFacets = async function(smallerThan, removeLargeToSmall, maxFacets, colors, facetResult, imgIndices, onUpdate) {
        
        if (!STATE.enabled) {
            return await FacetReducer._originalReduceFacets.call(this, smallerThan, removeLargeToSmall, maxFacets, colors, facetResult, imgIndices, onUpdate);
        }

        STATE.facetResult = facetResult;
        STATE.colorsByIndex = colors;
        STATE.threshold = smallerThan;
        
        STATE.protectedIds.clear();

        if (!STATE.hasShownUI) {
            console.log(`[Protection] First run. Pausing for user interaction.`);
            STATE.isPaused = true;
            
            recalcCandidates(smallerThan);

            const tabs = M.Tabs.getInstance($('tabsOutput'));
            if (tabs) tabs.select('reduction-pane');
            
            STATE.canvas = $('cReduction');
            STATE.ctx = STATE.canvas.getContext('2d');
            
            STATE.canvas.addEventListener('mousedown', handleCanvasClick);
            STATE.canvas.style.cursor = 'crosshair';

            drawInteractiveScreen();

            const btn = $('pbnContinueBtn');
            btn.style.display = 'block';
            
            await new Promise(resolve => STATE.resolveFunc = resolve);
            
            if(btn) btn.innerHTML = "Processing...";
            await new Promise(r => setTimeout(r, 50)); 
        } 
        else {
            console.log(`[Protection] Subsequent run. Auto-protecting based on coordinates.`);
            if (STATE.protectedCoords.length > 0) {
                STATE.protectedCoords.forEach(pt => {
                    if (pt.x < facetResult.width && pt.y < facetResult.height) {
                        const currentId = facetResult.facetMap.get(pt.x, pt.y);
                        STATE.protectedIds.add(currentId);
                    }
                });
            }
        }

        const restoreList = [];
        STATE.protectedIds.forEach(id => {
            const facet = facetResult.facets[id];
            if (facet) {
                restoreList.push({ facet: facet, origCount: facet.pointCount });
                facet.pointCount = 999999999; 
            }
        });

        await FacetReducer._originalReduceFacets.call(this, smallerThan, removeLargeToSmall, maxFacets, colors, facetResult, imgIndices, onUpdate);

        restoreList.forEach(item => {
            if (item.facet) item.facet.pointCount = item.origCount;
        });
      };
      
      console.log("✅ FacetReducer patched for Interactive Mode v3.2 (Single Prompt).");
    });
  }

  function init() {
    setTimeout(injectUI, 1000);
    setTimeout(patchFacetReducer, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();