/*
 * PaintByNumbersGenerator – Laser export runtime patch (v9.6 - Robust Zero Point)
 *
 * Features:
 * - True Deduplication & Path Stitching
 * - Travel Optimization (TSP)
 * - Single-Line Fonts for Labels
 * - Zero Point Selection (9 Points) - Respects ViewBox scaling!
 */

(function () {
  "use strict";

  var DEFAULT_STROKE_WIDTH = 0.35;
  var FORCE_STROKE_COLOR = "#000";
  var BATCH_SIZE = 50; 

  // V8 Simplex Digits
  var DIGITS = {
    "0": { w: 7, s: [[[2,9], [1,8], [1,2], [2,1], [5,1], [6,2], [6,8], [5,9], [2,9]]] },
    "1": { w: 5, s: [[[2,2], [3.5,1], [3.5,9]], [[2,9], [5,9]]] },
    "2": { w: 7, s: [[[1,3], [2,1], [5,1], [6,2], [6,4], [1,9], [7,9]]] },
    "3": { w: 7, s: [[[1,2], [2,1], [5,1], [6,2], [6,4], [4,5], [6,6], [6,8], [5,9], [2,9], [1,8]]] },
    "4": { w: 7, s: [[[5,9], [5,1], [1,6], [7,6]]] }, 
    "5": { w: 7, s: [[[6,1], [1.5,1], [1.5,4], [2,3.5], [5,3.5], [6,4.5], [6,8], [5,9], [2,9], [1,8]]] },
    "6": { w: 7, s: [[[5,1], [2,1], [1,2], [1,8], [2,9], [5,9], [6,8], [6,6], [5,5], [1.5,5]]] },
    "7": { w: 7, s: [[[1,1], [6,1], [3,9]]] },
    "8": { w: 7, s: [[[2,1], [5,1], [6,2], [6,4], [5,5], [2,5], [1,6], [1,8], [2,9], [5,9], [6,8], [6,6], [5,5], [2,4], [1,2], [2,1]]] },
    "9": { w: 7, s: [[[5.5,5], [2,5], [1,4], [1,2], [2,1], [5,1], [6,2], [6,8], [5,9], [2,9]]] },
    " ": { w: 4, s: [] }
  };

  // --- UI: Zero Point Selector ---
  var currentZeroPoint = "TL"; // Default Top-Left

  function injectZeroPointUI() {
      var target = document.getElementById('pbnTargetSizeFieldset');
      var container;
      
      if (target) {
          container = document.createElement('fieldset');
          container.style.cssText = "margin:10px 0;padding:10px;border:1px solid #ccc;border-radius:6px;";
          target.parentNode.insertBefore(container, target.nextSibling);
      } else {
          container = document.createElement('div');
          container.className = "collection-item";
          var opts = document.getElementById('options-pane');
          if(opts) opts.appendChild(container);
          else return;
      }

      container.innerHTML = `
        <legend style="padding:0 6px;font-weight:600;">Laser Zero Point (Origin)</legend>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; max-width: 180px; margin-top: 5px;">
            <label><input name="zp" type="radio" value="TL" checked /> <span>TL</span></label>
            <label><input name="zp" type="radio" value="TM" /> <span>TM</span></label>
            <label><input name="zp" type="radio" value="TR" /> <span>TR</span></label>
            <label><input name="zp" type="radio" value="ML" /> <span>ML</span></label>
            <label><input name="zp" type="radio" value="MM" /> <span>MM</span></label>
            <label><input name="zp" type="radio" value="MR" /> <span>MR</span></label>
            <label><input name="zp" type="radio" value="BL" /> <span>BL</span></label>
            <label><input name="zp" type="radio" value="BM" /> <span>BM</span></label>
            <label><input name="zp" type="radio" value="BR" /> <span>BR</span></label>
        </div>
        <div style="font-size:12px;opacity:0.75;margin-top:6px;">
            Coordinate system shift. <br>E.g. <b>MM</b> moves (0,0) to center.
        </div>
      `;

      var radios = container.querySelectorAll('input[name="zp"]');
      radios.forEach(function(r) {
          r.addEventListener('change', function(e) {
              currentZeroPoint = e.target.value;
          });
      });
  }

  function getTranslationOffset(width, height, zpMode) {
      // Determines how much to shift the coordinates based on the LOGICAL width/height
      var dx = 0;
      var dy = 0;
      
      // Horizontal Logic
      if (zpMode.endsWith("R")) dx = -width;
      else if (zpMode.endsWith("M") && !zpMode.startsWith("M")) { /* TM or BM */ dx = -width / 2; }
      else if (zpMode === "MM" || zpMode === "ML" || zpMode === "MR") { 
         // Middle Row
         if(zpMode === "MM") dx = -width / 2;
         if(zpMode === "MR") dx = -width;
      }
      // Re-check middle column general case
      if (zpMode === "TM" || zpMode === "BM") dx = -width / 2;


      // Vertical Logic
      if (zpMode.startsWith("B")) dy = -height;
      else if (zpMode.startsWith("M")) dy = -height / 2;

      return { x: dx, y: dy };
  }

  // --- Helpers ---
  function downloadTextFile(filename, text) {
    var preface = '<?xml version="1.0" standalone="no"?>\r\n';
    var blob = new Blob([preface, text], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function getCurrentSvgMarkup() {
    var svg = document.querySelector("#svgContainer svg");
    if (!svg) return null;
    // Note: runtime-target-size.js handles width/height/viewBox on the live element.
    // We just read what's there.
    if(!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return svg.outerHTML;
  }

  function parseNumberAttr(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v == null) return fallback;
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function getStrokeWidthFromUI() {
    var el = document.getElementById('txtSingleLineStrokeWidth');
    return el ? (parseFloat(el.value) || DEFAULT_STROKE_WIDTH) : DEFAULT_STROKE_WIDTH;
  }

  function strokeTextToPath(text, letterSpacing) {
    var height = 10;
    var x = 0;
    var parts = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var g = DIGITS[ch];
      if (!g) continue;
      for (var si = 0; si < g.s.length; si++) {
        var stroke = g.s[si];
        if (!stroke || stroke.length < 2) continue;
        parts.push(["M", x + stroke[0][0], stroke[0][1]]);
        for (var pi = 1; pi < stroke.length; pi++) {
          parts.push(["L", x + stroke[pi][0], stroke[pi][1]]);
        }
      }
      x += g.w + letterSpacing;
    }
    var width = Math.max(0, x - letterSpacing);
    return { segs: parts, width: width, height: height };
  }

  // --- Math ---
  function matMul(a, b) {
    return [
      a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
      a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
      a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5]
    ];
  }
  
  function matApply(m, x, y) {
    if (!m) return [x, y];
    return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  }

  function matTranslate(tx, ty) { return [1,0,0,1,tx,ty]; }
  function matScale(sx, sy) { return [sx,0,0,sy,0,0]; }

  function parseTransformList(t) {
    var m = [1,0,0,1,0,0];
    if (!t) return m;
    var re = /(translate|scale)\s*\(([^)]*)\)/ig;
    var match;
    while ((match = re.exec(t)) !== null) {
      var fn = match[1].toLowerCase();
      var args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);
      if (fn === "translate") {
        m = matMul(m, matTranslate(args[0]||0, args[1]||0));
      } else if (fn === "scale") {
        m = matMul(m, matScale(args[0]||1, args[1]||args[0]||1));
      }
    }
    return m;
  }

  function cumulativeTransformMatrix(el, stopAt) {
    var mats = [];
    var cur = el;
    while (cur && cur !== stopAt && cur) {
      if (cur.getAttribute) {
        var t = cur.getAttribute('transform');
        if (t) mats.push(parseTransformList(t));
      }
      cur = cur.parentNode;
    }
    var M = [1,0,0,1,0,0];
    for (var i = mats.length - 1; i >= 0; i--) {
      M = matMul(M, mats[i]);
    }
    return M;
  }

  // --- Optimization Engine ---

  function flattenNestedSvg(doc) {
    var root = doc.documentElement;
    var allSvgs = Array.prototype.slice.call(root.getElementsByTagName("svg"));
    if (allSvgs.length <= 1) return;

    for (var i = allSvgs.length - 1; i >= 1; i--) {
      var svg = allSvgs[i];
      if (!svg || !svg.parentNode) continue;
      if (svg === root) continue;

      var x = parseNumberAttr(svg, "x", 0);
      var y = parseNumberAttr(svg, "y", 0);
      var w = parseNumberAttr(svg, "width", 0);
      var h = parseNumberAttr(svg, "height", 0);
      var vbAttr = svg.getAttribute("viewBox");
      var vb = vbAttr ? vbAttr.trim().split(/[\s,]+/).map(parseFloat) : [];
      
      var vbMinX = (vb.length === 4) ? vb[0] : 0;
      var vbMinY = (vb.length === 4) ? vb[1] : 0;
      var vbW = (vb.length === 4) ? vb[2] : (w || 0);
      var vbH = (vb.length === 4) ? vb[3] : (h || 0);
      if (!w) w = vbW;
      if (!h) h = vbH;

      var scaleX = (vbW) ? (w / vbW) : 1;
      var scaleY = (vbH) ? (h / vbH) : 1;
      var s = Math.min(scaleX, scaleY); 
      var dx = (w - vbW * s) / 2;
      var dy = (h - vbH * s) / 2;

      var existing = (svg.getAttribute("transform") || "").trim();
      var tMap = "translate(" + x + "," + y + ") translate(" + dx + "," + dy + ") scale(" + s + ") translate(" + (-vbMinX) + "," + (-vbMinY) + ")";
      if (existing) tMap = existing + " " + tMap;

      var g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", tMap);

      while (svg.firstChild) g.appendChild(svg.firstChild);
      svg.parentNode.replaceChild(g, svg);
    }
  }

  function convertTextNodesToLabelPaths(doc, strokeWidth) {
    var svgEl = doc.documentElement;
    var texts = Array.prototype.slice.call(svgEl.getElementsByTagName("text"));
    for (var ti = 0; ti < texts.length; ti++) {
      var t = texts[ti];
      var label = (t.textContent || "").trim();
      if (!label || !/^\d+$/.test(label)) continue;

      var x = parseNumberAttr(t, "x", 0);
      var y = parseNumberAttr(t, "y", 0);
      var fontSize = parseNumberAttr(t, "font-size", 12);
      
      var letterSpacing = (label.length > 1) ? 1.0 : 1.5; 
      var p = strokeTextToPath(label, letterSpacing);
      var scale = fontSize / p.height;

      var scaledW = p.width * scale;
      var xOffset = (-scaledW/2); 
      var yOffset = (-p.height * scale * 0.5);

      var dparts = [];
      for (var si = 0; si < p.segs.length; si++) {
        var seg = p.segs[si];
        var cmd = seg[0];
        var px = (seg[1] * scale) + x + xOffset;
        var py = (seg[2] * scale) + y + yOffset;
        dparts.push(cmd + " " + px.toFixed(3) + " " + py.toFixed(3));
      }

      var path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", dparts.join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", FORCE_STROKE_COLOR);
      path.setAttribute("stroke-width", String(strokeWidth));
      path.setAttribute("data-label", "true"); 
      
      t.parentNode.replaceChild(path, t);
    }
  }

  function bakePathData(d, matrix, offset) {
      if (!d) return null;
      var tokens = d.replace(/,/g, ' ').trim().split(/\s+/);
      var idx = 0;
      var out = [];
      // Calculate BBox for sorting
      var cx=0, cy=0;
      var points = [];

      function applyM(x, y) { 
          var pt = matApply(matrix, x, y); 
          // Apply Zero Point Offset here
          return [pt[0] + offset.x, pt[1] + offset.y];
      }

      while (idx < tokens.length) {
          var cmd = tokens[idx++];
          if (cmd.toUpperCase() === 'M' || cmd.toUpperCase() === 'L') {
              var nx = parseFloat(tokens[idx++]);
              var ny = parseFloat(tokens[idx++]);
              var pt = applyM(nx, ny);
              out.push(cmd.toUpperCase() + ' ' + pt[0].toFixed(3) + ' ' + pt[1].toFixed(3));
              points.push(pt);
          } else if (cmd.toUpperCase() === 'Q') {
              var c1x = parseFloat(tokens[idx++]);
              var c1y = parseFloat(tokens[idx++]);
              var nx = parseFloat(tokens[idx++]);
              var ny = parseFloat(tokens[idx++]);
              var cp = applyM(c1x, c1y);
              var pt = applyM(nx, ny);
              out.push('Q ' + cp[0].toFixed(3) + ' ' + cp[1].toFixed(3) + ' ' + pt[0].toFixed(3) + ' ' + pt[1].toFixed(3));
              points.push(pt);
          } else if (cmd.toUpperCase() === 'Z') {
              out.push('Z');
          }
      }
      
      var midX = 0, midY = 0;
      if (points.length > 0) {
          points.forEach(p => { midX += p[0]; midY += p[1]; });
          midX /= points.length;
          midY /= points.length;
      }

      return { d: out.join(' '), center: {x: midX, y: midY} };
  }

  function getSegmentHash(p1, p2, cp) {
     var x1 = p1[0].toFixed(2), y1 = p1[1].toFixed(2);
     var x2 = p2[0].toFixed(2), y2 = p2[1].toFixed(2);
     var s1 = x1 + ',' + y1;
     var s2 = x2 + ',' + y2;
     var sc = cp ? '|' + cp[0].toFixed(2) + ',' + cp[1].toFixed(2) : '';
     return (s1 < s2) ? (s1 + '-' + s2 + sc) : (s2 + '-' + s1 + sc);
  }

  function parseAndDecomposeBorders(d, matrix, offset) {
      var tokens = d.replace(/,/g, ' ').trim().split(/\s+/);
      var idx = 0;
      var cx = 0, cy = 0;
      var sx = 0, sy = 0;
      var edges = [];

      function applyM(x, y) { 
          var pt = matApply(matrix, x, y); 
          return [pt[0] + offset.x, pt[1] + offset.y];
      }

      while (idx < tokens.length) {
          var cmd = tokens[idx++];
          if (cmd.toUpperCase() === 'M') {
              var pt = applyM(parseFloat(tokens[idx++]), parseFloat(tokens[idx++]));
              cx = pt[0]; cy = pt[1];
              sx = cx; sy = cy;
          } else if (cmd.toUpperCase() === 'L') {
              var pt = applyM(parseFloat(tokens[idx++]), parseFloat(tokens[idx++]));
              edges.push({ type:'L', p1:[cx,cy], p2:[pt[0],pt[1]] });
              cx = pt[0]; cy = pt[1];
          } else if (cmd.toUpperCase() === 'Q') {
              var cp = applyM(parseFloat(tokens[idx++]), parseFloat(tokens[idx++]));
              var pt = applyM(parseFloat(tokens[idx++]), parseFloat(tokens[idx++]));
              edges.push({ type:'Q', p1:[cx,cy], p2:[pt[0],pt[1]], c:[cp[0],cp[1]] });
              cx = pt[0]; cy = pt[1];
          } else if (cmd.toUpperCase() === 'Z') {
              if (Math.abs(cx-sx)>0.01 || Math.abs(cy-sy)>0.01) {
                  edges.push({ type:'L', p1:[cx,cy], p2:[sx,sy] });
              }
              cx = sx; cy = sy;
          }
      }
      return edges;
  }

  // --- Advanced Optimizers ---
  function stitchEdges(edges) {
      var adj = {};
      function k(pt) { return pt[0].toFixed(2) + ',' + pt[1].toFixed(2); }
      function addToAdj(key, edge) {
          if (!adj[key]) adj[key] = [];
          adj[key].push(edge);
      }
      edges.forEach(e => {
          e.visited = false;
          addToAdj(k(e.p1), e);
          addToAdj(k(e.p2), e);
      });
      var chains = [];
      for (var i = 0; i < edges.length; i++) {
          var startEdge = edges[i];
          if (startEdge.visited) continue;
          var chain = [];
          var current = startEdge;
          var headPoint = current.p1; 
          var tailPoint = current.p2;
          current.visited = true;
          chain.push({ edge: current, reverse: false });
          var growing = true;
          while (growing) {
              var candidates = adj[k(tailPoint)];
              var foundNext = false;
              if (candidates) {
                  for (var c = 0; c < candidates.length; c++) {
                      var cand = candidates[c];
                      if (!cand.visited) {
                          cand.visited = true;
                          var distToP1 = Math.abs(cand.p1[0] - tailPoint[0]) + Math.abs(cand.p1[1] - tailPoint[1]);
                          var isNaturalDir = (distToP1 < 0.1); 
                          chain.push({ edge: cand, reverse: !isNaturalDir });
                          tailPoint = isNaturalDir ? cand.p2 : cand.p1;
                          foundNext = true;
                          break; 
                      }
                  }
              }
              if (!foundNext) growing = false;
          }
          growing = true;
          while (growing) {
              var candidates = adj[k(headPoint)];
              var foundPrev = false;
              if (candidates) {
                  for (var c = 0; c < candidates.length; c++) {
                      var cand = candidates[c];
                      if (!cand.visited) {
                          cand.visited = true;
                          var distToP2 = Math.abs(cand.p2[0] - headPoint[0]) + Math.abs(cand.p2[1] - headPoint[1]);
                          var isNaturalDir = (distToP2 < 0.1);
                          chain.unshift({ edge: cand, reverse: !isNaturalDir });
                          headPoint = isNaturalDir ? cand.p1 : cand.p2;
                          foundPrev = true;
                          break;
                      }
                  }
              }
              if (!foundPrev) growing = false;
          }
          chains.push({ segments: chain, startPt: headPoint, endPt: tailPoint });
      }
      return chains;
  }

  function sortChains(chains) {
      if (chains.length === 0) return [];
      var sorted = [];
      var currentPos = [0, 0]; 
      var unvisited = new Set(chains);
      var count = 0;
      var limit = chains.length + 1;
      while (unvisited.size > 0 && count < limit) {
          count++;
          var nearest = null;
          var minDist = Infinity;
          var reversed = false;
          for (var chain of unvisited) {
              var dStart = Math.abs(chain.startPt[0] - currentPos[0]) + Math.abs(chain.startPt[1] - currentPos[1]);
              if (dStart < minDist) {
                  minDist = dStart;
                  nearest = chain;
                  reversed = false; 
              }
              var dEnd = Math.abs(chain.endPt[0] - currentPos[0]) + Math.abs(chain.endPt[1] - currentPos[1]);
              if (dEnd < minDist) {
                  minDist = dEnd;
                  nearest = chain;
                  reversed = true; 
              }
          }
          if (nearest) {
              unvisited.delete(nearest);
              nearest.renderReverse = reversed; 
              sorted.push(nearest);
              currentPos = reversed ? nearest.startPt : nearest.endPt;
          } else {
              break; 
          }
      }
      return sorted;
  }
  
  function sortLabels(labels) {
      if (labels.length === 0) return [];
      var sorted = [];
      var currentPos = [0, 0];
      var unvisited = new Set(labels);
      var count = 0;
      while (unvisited.size > 0 && count++ < labels.length + 1) {
          var nearest = null;
          var minDist = Infinity;
          for (var l of unvisited) {
              var d = Math.abs(l.center.x - currentPos[0]) + Math.abs(l.center.y - currentPos[1]);
              if (d < minDist) {
                  minDist = d;
                  nearest = l;
              }
          }
          if(nearest) {
              unvisited.delete(nearest);
              sorted.push(nearest);
              currentPos = [nearest.center.x, nearest.center.y];
          } else break;
      }
      return sorted;
  }

  function optimizeGeometry(svgString) {
      console.log("Parsing SVG...");
      var parser = new DOMParser();
      var doc = parser.parseFromString(svgString, 'image/svg+xml');
      
      flattenNestedSvg(doc);
      convertTextNodesToLabelPaths(doc, getStrokeWidthFromUI());
      
      // Determine Dimensions for Zero Point Calculation
      var root = doc.documentElement;
      var width = 0;
      var height = 0;
      
      // Try to get LOGICAL dimensions from viewBox (because runtime-target-size sets width/height to mm string)
      var vbAttr = root.getAttribute("viewBox");
      if (vbAttr) {
          var vbParts = vbAttr.split(/\s+|,/).map(parseFloat);
          if(vbParts.length === 4) {
              // x, y, w, h
              width = vbParts[2];
              height = vbParts[3];
          }
      }
      // Fallback if viewBox not present (rare with the new fix)
      if (width === 0 || height === 0) {
          width = parseFloat(root.getAttribute("width")) || 0;
          height = parseFloat(root.getAttribute("height")) || 0;
      }
      
      console.log("Logical Dimensions for Zero Point:", width, height);

      // Calculate Zero Point Offset
      var offset = getTranslationOffset(width, height, currentZeroPoint);
      console.log("Applying Offset: ", offset);

      var labels = [];
      var borderEdges = [];
      var uniqueEdgeHashes = new Set();
      var dedupCount = 0;

      var elements = Array.from(doc.querySelectorAll('path, rect, circle, polygon, polyline'));

      elements.forEach(function(el) {
          var isLabel = el.getAttribute('data-label') === 'true';
          var hasFill = (el.getAttribute('fill') && el.getAttribute('fill') !== 'none');
          var hasStroke = (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none');
          
          var M = cumulativeTransformMatrix(el, doc.documentElement);
          var d = el.getAttribute('d');
          
          if (el.tagName === 'rect' && !d) {
             var x=parseFloat(el.getAttribute('x')||0), y=parseFloat(el.getAttribute('y')||0), w=parseFloat(el.getAttribute('width')||0), h=parseFloat(el.getAttribute('height')||0);
             d = `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
          }

          if (!d) return;

          if (isLabel) {
             var baked = bakePathData(d, M, offset);
             if (baked) labels.push(baked);
          } 
          else if (hasFill || hasStroke) {
             var segs = parseAndDecomposeBorders(d, M, offset);
             segs.forEach(function(s) {
                 var h = getSegmentHash(s.p1, s.p2, s.c);
                 if (!uniqueEdgeHashes.has(h)) {
                     uniqueEdgeHashes.add(h);
                     borderEdges.push(s);
                 } else {
                     dedupCount++;
                 }
             });
          }
      });
      
      console.log("Edges: " + borderEdges.length + " (Removed duplicates: " + dedupCount + ")");
      console.log("Stitching chains...");
      var rawChains = stitchEdges(borderEdges);
      console.log("Created " + rawChains.length + " continuous paths.");
      
      console.log("Optimizing Border Travel (TSP)...");
      var sortedChains = sortChains(rawChains);
      
      console.log("Optimizing Label Travel (TSP)...");
      var sortedLabels = sortLabels(labels);

      console.log("Generating Output...");
      var newSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      
      // Pass through the physical dimensions for the laser file
      var wStr = root.getAttribute("width") || "100%";
      var hStr = root.getAttribute("height") || "100%";
      
      // Calculate new viewBox based on offset
      // If original was 0 0 2000 2000, and we shift center (-1000, -1000)
      // New content is at -1000..1000. 
      // ViewBox should arguably match the content bounds if we want it viewable in browser,
      // OR we stick to the logical 0,0 top left.
      // LaserGRBL usually ignores viewBox and looks at coordinate values.
      // Inkscape likes a correct viewBox. 
      // Let's shift viewBox origin to match the offset.
      var vbX = 0 + offset.x;
      var vbY = 0 + offset.y;
      var rootVB = `${vbX} ${vbY} ${width} ${height}`;

      newSvg.setAttribute("width", wStr);
      newSvg.setAttribute("height", hStr);
      newSvg.setAttribute("viewBox", rootVB);
      newSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      var gBorders = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gBorders.setAttribute("id", "laser-borders");
      gBorders.setAttribute("stroke", FORCE_STROKE_COLOR);
      gBorders.setAttribute("fill", "none");
      gBorders.setAttribute("stroke-width", "0.2");
      
      var currentD = "";
      var counter = 0;
      var flushLimit = BATCH_SIZE;
      
      function flush(group, dVal) {
          if (!dVal) return;
          var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", dVal);
          group.appendChild(p);
      }
      
      sortedChains.forEach(chain => {
          var segsToRender = chain.segments;
          if (chain.renderReverse) {
              segsToRender = [];
              for(var i = chain.segments.length-1; i>=0; i--) {
                  var item = chain.segments[i];
                  segsToRender.push({ edge: item.edge, reverse: !item.reverse });
              }
          }
          var start = segsToRender[0].reverse ? segsToRender[0].edge.p2 : segsToRender[0].edge.p1;
          currentD += `M ${start[0].toFixed(3)} ${start[1].toFixed(3)} `;
          segsToRender.forEach(item => {
              var s = item.edge;
              var target = item.reverse ? s.p1 : s.p2; 
              if(s.type === 'L') {
                   currentD += `L ${target[0].toFixed(3)} ${target[1].toFixed(3)} `;
              } else {
                   currentD += `Q ${s.c[0].toFixed(3)} ${s.c[1].toFixed(3)} ${target[0].toFixed(3)} ${target[1].toFixed(3)} `;
              }
          });
          if (++counter >= flushLimit) {
              flush(gBorders, currentD);
              currentD = "";
              counter = 0;
          }
      });
      flush(gBorders, currentD);
      newSvg.appendChild(gBorders);

      var gLabels = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gLabels.setAttribute("id", "laser-labels");
      gLabels.setAttribute("stroke", FORCE_STROKE_COLOR);
      gLabels.setAttribute("fill", "none");
      gLabels.setAttribute("stroke-width", String(getStrokeWidthFromUI()));
      
      currentD = "";
      counter = 0;
      sortedLabels.forEach(lp => {
          currentD += lp.d + " ";
          if (++counter >= flushLimit) {
              flush(gLabels, currentD);
              currentD = "";
              counter = 0;
          }
      });
      flush(gLabels, currentD);
      newSvg.appendChild(gLabels);
      
      console.log("Done.");
      return new XMLSerializer().serializeToString(newSvg);
  }

  // --- UI Injection ---
  function ensureButtons() {
    var oldBtn = document.getElementById('btnDownloadSVG');
    if (!oldBtn) return;
    if (oldBtn.getAttribute('data-pbn-patched') === 'true') return;

    var newPreviewBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newPreviewBtn, oldBtn);
    
    newPreviewBtn.id = 'btnDownloadSVG'; 
    newPreviewBtn.textContent = 'Download SVG (Preview)';
    newPreviewBtn.setAttribute('data-pbn-patched', 'true');

    newPreviewBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        try {
            var svg = getCurrentSvgMarkup();
            if (svg) downloadTextFile('preview.svg', svg);
        } catch(e) { console.error(e); }
    });

    var laserBtnId = 'btnDownloadSVGLaser';
    var oldLaserBtn = document.getElementById(laserBtnId);
    if (oldLaserBtn) oldLaserBtn.parentNode.removeChild(oldLaserBtn); 

    var laserBtn = document.createElement('a');
    laserBtn.id = laserBtnId;
    laserBtn.className = newPreviewBtn.className;
    laserBtn.style.marginLeft = '0px';
    laserBtn.textContent = 'Download Laser SVG (Optimized)';
    
    newPreviewBtn.parentNode.insertBefore(laserBtn, newPreviewBtn.nextSibling);

    laserBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      try {
        var svg = getCurrentSvgMarkup();
        if (!svg) { alert("No image available."); return; }
        
        laserBtn.textContent = "Optimizing...";
        setTimeout(function() {
            var laserSvg = optimizeGeometry(svg);
            downloadTextFile('laser_optimized.svg', laserSvg);
            laserBtn.textContent = 'Download Laser SVG (Optimized)';
        }, 50);
        
      } catch(e) {
          console.error(e);
          alert("Error: " + e.message);
      }
    });
  }

  function ensureStrokeWidthInput() {
    if (document.getElementById('txtSingleLineStrokeWidth')) return;
    var anchor = document.getElementById('btnDownloadSVGLaser');
    if (!anchor) return;

    var wrapper = document.createElement('span');
    wrapper.style.marginLeft = '12px';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    wrapper.innerHTML = `<span style="font-size:12px;">Label Stroke:</span>`;
    
    var input = document.createElement('input');
    input.id = 'txtSingleLineStrokeWidth';
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.05';
    input.value = String(DEFAULT_STROKE_WIDTH);
    input.style.width = '60px';
    input.style.height = '30px';
    input.style.margin = '0';
    wrapper.appendChild(input);
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
  }

  // --- INIT ---
  var _initDone = false;
  function init() {
     if(_initDone) return;
     setTimeout(function(){
         ensureButtons();
         ensureStrokeWidthInput();
         injectZeroPointUI(); // New Feature
         _initDone = true;
     }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  var obs = new MutationObserver(function(mutations) {
      var needsRebind = false;
      for(var i=0; i<mutations.length; i++) {
          if(mutations[i].target.id === 'output-pane' || mutations[i].target.id === 'options-pane') {
              needsRebind = true;
              break;
          }
      }
      if(needsRebind) {
          setTimeout(function() {
             ensureButtons();
             ensureStrokeWidthInput();
             if(!document.getElementById('pbnTargetSizeFieldset') && !document.querySelector('input[name="zp"]')) {
                 injectZeroPointUI();
             }
          }, 200);
      }
  });
  
  setTimeout(function() {
      var target = document.getElementById('options-pane') || document.body;
      obs.observe(target, { childList: true, subtree: true });
  }, 1500);

})();