/*
 * PaintByNumbersGenerator – Runtime Manual Recolor v1.1 (Fix Live Colors)
 * 
 * Updates:
 * - Fix: Das Farbwahl-Fenster zeigt nun die *tatsächliche* Farbe an, 
 *   auch wenn diese über das "Runtime Recolor" Panel geändert wurde.
 */

(() => {
  'use strict';

  const STATE = {
    active: true,
    facetResult: null,
    colorsByIndex: null, // The real RGB values
    selectedFacetId: null
  };

  function $(id) { return document.getElementById(id); }

  // --- UI ---
  function injectUI() {
    const parent = document.querySelector('#options-pane .collection');
    if (!parent || $('pbnManualRecolorItem')) return;

    const li = document.createElement('li');
    li.id = 'pbnManualRecolorItem';
    li.className = 'collection-item';
    
    li.innerHTML = `
      <div class="row" style="margin-bottom:0; display:flex; align-items:center;">
        <div class="col s8">
           <label style="font-size:1rem; color:#000; font-weight:500;">🖊️ Recolor Facets</label>
           <p style="font-size:0.8rem; margin:0; color:#666;">
             Enable this, then click an area in the <b>output image</b> below.
           </p>
        </div>
        <div class="col s4" style="text-align:right;">
           <div class="switch">
            <label>
              Off
              <input id="chkManualRecolor" type="checkbox">
              <span class="lever"></span>
              On
            </label>
          </div>
        </div>
      </div>
    `;

    // Insert after the Protection Item (or at the end)
    const ref = $('pbnProtectionItem');
    if(ref) ref.parentNode.insertBefore(li, ref.nextSibling);
    else parent.appendChild(li);

    // Ensure checkbox reflects STATE.active
    const chk = $('chkManualRecolor');
    if (chk) {
      chk.checked = STATE.active;
      // Trigger change so updateCursor() runs
      chk.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Event
    $('chkManualRecolor').addEventListener('change', (e) => {
        STATE.active = e.target.checked;
        updateCursor();
    });

    // Create color picker modal
    createColorModal();
  }

  function createColorModal() {
    if($('pbnColorModal')) return;

    const div = document.createElement('div');
    div.id = 'pbnColorModal';
    div.className = 'modal';
    div.style.cssText = 'max-width: 400px; max-height: 80%;';
    
    div.innerHTML = `
      <div class="modal-content">
        <h5>Select Color</h5>
        <p>Choose a new color for the selected facet.</p>
        <div id="pbnColorGrid" style="display:flex; flex-wrap:wrap; gap:5px; justify-content:center;"></div>
      </div>
      <div class="modal-footer">
        <a href="#!" class="modal-close waves-effect waves-green btn-flat">Cancel</a>
      </div>
    `;
    
    document.body.appendChild(div);
    // Materialize Modal init
    if(M && M.Modal) M.Modal.init(div);
  }

  function updateCursor() {
    const svgContainer = $('svgContainer');
    if(!svgContainer) return;
    svgContainer.style.cursor = STATE.active ? 'pointer' : 'default';
  }

  // --- LOGIC ---

  // We need access to the data (facetResult). We patch createSVG to intercept the reference.
  function patchProcessManager() {
      if (typeof window.require !== 'function') return;

      window.require(['guiprocessmanager'], function(GUI) {
          if (!GUI || !GUI.GUIProcessManager) return;
          
          const originalCreateSVG = GUI.GUIProcessManager.createSVG;
          
          GUI.GUIProcessManager.createSVG = async function(facetResult, colorsByIndex, sizeMultiplier, fill, stroke, addColorLabels, fontSize, fontColor, onUpdate) {
              
              // STORE DATA LOCALLY
              STATE.facetResult = facetResult;
              STATE.colorsByIndex = colorsByIndex;

              // EXPOSE DATA GLOBALLY (Fix for PDF Export)
              window.__pbnFacetResult = facetResult;
              window.__pbnColorsByIndex = colorsByIndex;
              
              // Run original
              return await originalCreateSVG.call(this, facetResult, colorsByIndex, sizeMultiplier, fill, stroke, addColorLabels, fontSize, fontColor, onUpdate);
          };
          
          console.log("✅ GUIProcessManager patched for Manual Recolor.");
      });
  }

  function attachSvgListeners() {
      const svg = document.querySelector('#svgContainer svg');
      if(!svg) return;

      // We use event delegation on the SVG because there are thousands of paths
      svg.addEventListener('click', (e) => {
          if(!STATE.active) return;
          
          const target = e.target;
          // Check if it is a path (facet)
          let facetId = target.getAttribute('data-facetId');
          
          if (!facetId) return; 
          
          e.preventDefault();
          e.stopPropagation();
          
          openColorPicker(parseInt(facetId));
      });
      
      // Hover effect
      svg.addEventListener('mouseover', (e) => {
          if(!STATE.active) return;
          if(e.target.tagName === 'path' && e.target.hasAttribute('data-facetId')) {
              e.target.style.opacity = '0.5';
          }
      });
      svg.addEventListener('mouseout', (e) => {
          if(!STATE.active) return;
          if(e.target.tagName === 'path') {
              e.target.style.opacity = '1';
          }
      });
  }

  function openColorPicker(facetId) {
      STATE.selectedFacetId = facetId;
      const facet = STATE.facetResult.facets[facetId];
      if(!facet) return;

      const grid = $('pbnColorGrid');
      grid.innerHTML = '';
      
      const currentColorIdx = facet.color;
      
      // Render palette
      STATE.colorsByIndex.forEach((rgb, idx) => {
          // --- FIX START: Detect Live Color ---
          // Standard original color
          let visualColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

          // Try to find the "Live" color from the palette DOM
          // (Runtime Recolor modifies the DOM, not the array)
          const livePaletteItem = document.querySelector(`#palette .color[data-orig-id="${idx}"]`);
          
          // Fallback: search by index if data-orig-id is missing but order is preserved
          const fallbackItem = (!livePaletteItem) ? document.querySelectorAll('#palette .color')[idx] : null;
          
          const targetItem = livePaletteItem || fallbackItem;

          if(targetItem && targetItem.style.backgroundColor) {
              // Retrieve the current visible color (e.g. from the Recolor Panel)
              visualColor = targetItem.style.backgroundColor;
          }
          // --- FIX END ---

          const div = document.createElement('div');
          
          const isSelected = (idx === currentColorIdx);
          
          div.style.cssText = `
            width: 40px; height: 40px; 
            background-color: ${visualColor};
            border: ${isSelected ? '3px solid red' : '1px solid #ccc'};
            cursor: pointer;
            border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            font-weight: bold;
            color: ${getContrastYIQ(visualColor)};
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          `;
          
          // Get Label
          let label = idx; 
          if(targetItem) {
              label = targetItem.innerText;
          }

          div.innerText = label;
          
          div.onclick = () => applyColorChange(facetId, idx);
          
          grid.appendChild(div);
      });

      const modal = M.Modal.getInstance($('pbnColorModal'));
      modal.open();
  }

  function applyColorChange(facetId, newColorIndex) {
      if(!STATE.facetResult) return;
      
      // 1. Change data
      STATE.facetResult.facets[facetId].color = newColorIndex;
      
      // 2. Close modal
      const modal = M.Modal.getInstance($('pbnColorModal'));
      modal.close();
      
      // 3. Re-render SVG
      window.require(['gui'], function(GUI) {
         if(GUI && GUI.updateOutput) {
             GUI.updateOutput();
             M.toast({html: 'Facet recolored!', classes: 'rounded green'});
         }
      });
  }

  function getContrastYIQ(rgbStr){
    // Handle hex if present (though style.backgroundColor usually returns rgb())
    if(rgbStr.startsWith('#')) {
        rgbStr = rgbStr.replace("#", "");
        var r = parseInt(rgbStr.substr(0,2),16);
        var g = parseInt(rgbStr.substr(2,2),16);
        var b = parseInt(rgbStr.substr(4,2),16);
        var yiq = ((r*299)+(g*587)+(b*114))/1000;
        return (yiq >= 128) ? 'black' : 'white';
    }

    const parts = rgbStr.match(/\d+/g);
    if(!parts || parts.length < 3) return 'black';
    const r = parseInt(parts[0]);
    const g = parseInt(parts[1]);
    const b = parseInt(parts[2]);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
  }

  // --- INIT ---
  function init() {
      setTimeout(injectUI, 1000);
      setTimeout(patchProcessManager, 2000);
      
      const container = $('svgContainer');
      if(container) {
          const obs = new MutationObserver(() => {
              attachSvgListeners();
              updateCursor();
          });
          obs.observe(container, {childList: true});
      }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();