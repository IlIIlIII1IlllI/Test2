/*
 * PaintByNumbersGenerator – Laser export runtime patch (v4)
 *
 * v4 Fixes:
 *  - Preserve adaptive size + centering by baking the FULL transform chain
 *    (all ancestor transforms, including those created when flattening nested <svg>).
 *  - Keep pretty single-line digits.
 *  - Export preview.svg and laser.svg.
 *  - For laser.svg: remove fills, force strokes to #000.
 */

(function () {
  "use strict";

  var DEFAULT_STROKE_WIDTH = 0.35;
  var FORCE_STROKE_COLOR = "#000";

  // Pretty single-line digits (0..10 font units)
  var DIGITS = {
    "0": { w: 8.5, s: [
      [[4.25,1],[6.6,2.0],[7.4,4.4],[6.7,7.9],[4.25,9],[1.9,8.0],[1.1,5.6],[1.8,2.1],[4.25,1]]
    ]},
    "1": { w: 6.0, s: [
      [[2.0,3.0],[3.5,1.5],[3.5,9.0]],
      [[2.2,9.0],[4.8,9.0]]
    ]},
    "2": { w: 8.5, s: [
      [[1.4,2.7],[2.5,1.6],[5.7,1.6],[7.0,2.8],[6.6,4.2],[1.6,9.0],[7.2,9.0]]
    ]},
    "3": { w: 8.5, s: [
      [[1.6,2.2],[2.7,1.5],[5.8,1.5],[7.1,2.7],[6.1,4.6],[4.4,5.0],[6.2,5.4],[7.1,7.3],[5.8,8.7],[2.7,8.7],[1.6,8.0]]
    ]},
    "4": { w: 8.5, s: [
      [[6.9,9.0],[6.9,1.5]],
      [[1.4,6.4],[7.2,6.4]],
      [[1.4,6.4],[6.1,1.5]]
    ]},
    "5": { w: 8.5, s: [
      [[7.0,1.6],[2.1,1.6],[2.1,4.9],[5.8,4.9],[7.2,6.4],[6.0,8.7],[2.7,8.7],[1.6,7.8]]
    ]},
    "6": { w: 8.5, s: [
      [[6.8,2.2],[5.6,1.5],[2.9,1.5],[1.6,2.9],[1.6,7.3],[2.9,8.7],[5.6,8.7],[6.9,7.4],[6.9,6.1],[5.7,4.9],[2.9,4.9],[1.6,6.1]]
    ]},
    "7": { w: 8.5, s: [
      [[1.4,1.6],[7.2,1.6],[3.3,9.0]]
    ]},
    "8": { w: 8.5, s: [
      [[4.25,4.8],[6.2,3.8],[6.9,2.6],[5.8,1.5],[2.7,1.5],[1.6,2.6],[2.3,3.8],[4.25,4.8],[6.2,5.8],[6.9,7.2],[5.8,8.7],[2.7,8.7],[1.6,7.2],[2.3,5.8],[4.25,4.8]]
    ]},
    "9": { w: 8.5, s: [
      [[6.9,4.4],[5.6,3.2],[2.9,3.2],[1.6,4.5],[1.6,5.8],[2.9,7.1],[5.6,7.1],[6.9,5.8],[6.9,2.9],[5.6,1.5],[2.9,1.5],[1.6,2.5]]
    ]},
    " ": { w: 4.0, s: [] }
  };

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

  // ---------- matrix math (SVG affine [a,b,c,d,e,f]) ----------
  function matMul(a, b) {
    return [
      a[0]*b[0] + a[2]*b[1],
      a[1]*b[0] + a[3]*b[1],
      a[0]*b[2] + a[2]*b[3],
      a[1]*b[2] + a[3]*b[3],
      a[0]*b[4] + a[2]*b[5] + a[4],
      a[1]*b[4] + a[3]*b[5] + a[5]
    ];
  }
  function matApply(m, x, y) {
    return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  }
  function matTranslate(tx, ty) { return [1,0,0,1,tx,ty]; }
  function matScale(sx, sy) { return [sx,0,0,sy,0,0]; }

  function parseTransformList(t) {
    // Supports translate(x,y), scale(sx[,sy])
    // (enough for this app's labels)
    var m = [1,0,0,1,0,0];
    if (!t) return m;
    var re = /(translate|scale)\s*\(([^)]*)\)/ig;
    var match;
    while ((match = re.exec(t)) !== null) {
      var fn = match[1].toLowerCase();
      var args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);
      if (fn === "translate") {
        var tx = isFinite(args[0]) ? args[0] : 0;
        var ty = isFinite(args[1]) ? args[1] : 0;
        m = matMul(m, matTranslate(tx, ty));
      } else if (fn === "scale") {
        var sx = isFinite(args[0]) ? args[0] : 1;
        var sy = isFinite(args[1]) ? args[1] : sx;
        m = matMul(m, matScale(sx, sy));
      }
    }
    return m;
  }

  function cumulativeTransformMatrix(el, stopAt) {
    // Build list of matrices from el up to (but excluding) stopAt, then multiply from root->leaf.
    var mats = [];
    var cur = el;
    while (cur && cur !== stopAt) {
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

  // ---------- SVG helpers ----------
  function downloadTextFile(filename, text) {
    var preface = "<?xml version=\"1.0\" standalone=\"no\"?>\r\n";
    var blob = new Blob([preface, text], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function getCurrentSvgMarkup() {
    var svg = document.querySelector("#svgContainer svg");
    if (!svg) return null;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return svg.outerHTML;
  }

  function parseNumberAttr(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v == null) return fallback;
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  // Flatten nested <svg> for maximum compatibility.
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

      var vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(parseFloat);
      var vbMinX = (vb.length === 4 && isFinite(vb[0])) ? vb[0] : 0;
      var vbMinY = (vb.length === 4 && isFinite(vb[1])) ? vb[1] : 0;
      var vbW = (vb.length === 4 && isFinite(vb[2])) ? vb[2] : (w || 0);
      var vbH = (vb.length === 4 && isFinite(vb[3])) ? vb[3] : (h || 0);
      if (!w) w = vbW;
      if (!h) h = vbH;

      var par = (svg.getAttribute("preserveAspectRatio") || "xMidYMid meet").toLowerCase();
      var meet = par.indexOf("meet") >= 0;
      var scaleX = vbW ? (w / vbW) : 1;
      var scaleY = vbH ? (h / vbH) : 1;
      var s = meet ? Math.min(scaleX, scaleY) : 1;
      var dx = meet ? (w - vbW * s) / 2 : 0;
      var dy = meet ? (h - vbH * s) / 2 : 0;

      var existing = (svg.getAttribute("transform") || "").trim();
      var tMap = "translate(" + x + "," + y + ") translate(" + dx + "," + dy + ") scale(" + s + ") translate(" + (-vbMinX) + "," + (-vbMinY) + ")";
      if (existing) tMap = existing + " " + tMap;

      var g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", tMap);

      while (svg.firstChild) g.appendChild(svg.firstChild);
      svg.parentNode.replaceChild(g, svg);
    }
  }

  // Convert numeric <text> (if any) to pretty path strokes; bake directly to absolute coords.
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
      var fill = t.getAttribute("fill") || "black";

      var letterSpacing = (label.length > 1) ? 0.9 : 1.4;
      var p = strokeTextToPath(label, letterSpacing);
      var scale = fontSize / p.height;

      var anchor = (t.getAttribute("text-anchor") || "start").toLowerCase();
      var scaledW = p.width * scale;
      var xOffset = (anchor === "middle") ? (-scaledW/2) : (anchor === "end" ? -scaledW : 0);

      var dominant = (t.getAttribute("dominant-baseline") || "").toLowerCase();
      var scaledH = p.height * scale;
      var yOffset = (dominant.indexOf("middle") >= 0 || dominant.indexOf("central") >= 0) ? (-scaledH/2) : (-scaledH*0.78);

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
      path.setAttribute("stroke", fill);
      path.setAttribute("stroke-width", String(strokeWidth));
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("data-label", label);

      t.parentNode.replaceChild(path, t);
    }
  }

  // Bake ALL transforms affecting label paths into coordinates.
  // This preserves adaptive scaling/centering from the original layout.
  function bakeAllLabelPathTransforms(doc) {
    var svgEl = doc.documentElement;

    // Process all paths inside label groups first.
    var labelPaths = Array.prototype.slice.call(svgEl.querySelectorAll('g.label path'));

    for (var i = 0; i < labelPaths.length; i++) {
      var pth = labelPaths[i];
      var d = pth.getAttribute('d') || '';
      if (!d) continue;

      // Only bake simple M/L paths (our digits or converted ones)
      if (!/^[\sML0-9.,-]+$/i.test(d)) continue;

      // Compute full cumulative matrix from this path up to root svg
      var M = cumulativeTransformMatrix(pth, svgEl);

      // Parse tokens
      var tokens = d.replace(/,/g, ' ').trim().split(/\s+/);
      var out = [];
      var idx = 0;
      while (idx < tokens.length) {
        var cmd = tokens[idx++];
        if (cmd !== 'M' && cmd !== 'L' && cmd !== 'm' && cmd !== 'l') break;
        var x = parseFloat(tokens[idx++]);
        var y = parseFloat(tokens[idx++]);
        if (!isFinite(x) || !isFinite(y)) break;
        var pt = matApply(M, x, y);
        out.push(cmd.toUpperCase() + ' ' + pt[0].toFixed(3) + ' ' + pt[1].toFixed(3));
      }

      if (out.length > 0) {
        pth.setAttribute('d', out.join(' '));
        pth.removeAttribute('transform');
        pth.setAttribute('stroke', FORCE_STROKE_COLOR);
        pth.setAttribute('fill', 'none');
        pth.setAttribute('vector-effect', 'non-scaling-stroke');
        pth.setAttribute('stroke-linecap', 'round');
        pth.setAttribute('stroke-linejoin', 'round');
        pth.removeAttribute('style');

        // Move path to root to avoid any remaining transforms in ancestors.
        svgEl.appendChild(pth);
      }
    }

    // Remove now-empty label groups
    var labelGroups = Array.prototype.slice.call(svgEl.querySelectorAll('g.label'));
    for (var j = 0; j < labelGroups.length; j++) {
      if (labelGroups[j] && labelGroups[j].parentNode) labelGroups[j].parentNode.removeChild(labelGroups[j]);
    }
  }

  function prepareSvgForLaser(doc) {
    var svgEl = doc.documentElement;

    // remove remaining text
    var texts = Array.prototype.slice.call(svgEl.getElementsByTagName('text'));
    for (var i = 0; i < texts.length; i++) {
      if (texts[i] && texts[i].parentNode) texts[i].parentNode.removeChild(texts[i]);
    }

    function isNone(v) {
      if (v == null) return true;
      var t = String(v).trim().toLowerCase();
      return t === '' || t === 'none';
    }

    var nodes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
    for (var ni = nodes.length - 1; ni >= 0; ni--) {
      var el = nodes[ni];
      var fill = el.getAttribute('fill');
      var stroke = el.getAttribute('stroke');
      var sw = parseFloat(el.getAttribute('stroke-width') || '1');
      if (!isFinite(sw)) sw = 1;

      var style = el.getAttribute('style') || '';
      if (isNone(stroke)) {
        var ms = style.match(/stroke\s*:\s*([^;]+)\s*;?/i);
        if (ms) stroke = ms[1].trim();
      }
      if (isNone(fill)) {
        var mf = style.match(/fill\s*:\s*([^;]+)\s*;?/i);
        if (mf) fill = mf[1].trim();
      }

      var hasStroke = !isNone(stroke) && sw > 0;
      var hasFill = !isNone(fill);

      if (hasFill && !hasStroke) {
        if (el.parentNode) el.parentNode.removeChild(el);
        continue;
      }
      if (hasFill && hasStroke) el.setAttribute('fill', 'none');
      if (hasStroke) {
        el.setAttribute('stroke', FORCE_STROKE_COLOR);
        el.setAttribute('vector-effect', 'non-scaling-stroke');
        el.removeAttribute('style');
      }
    }

    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  function getStrokeWidthFromUI() {
    var el = document.getElementById('txtSingleLineStrokeWidth');
    if (!el) return DEFAULT_STROKE_WIDTH;
    var v = parseFloat(el.value);
    return isFinite(v) ? v : DEFAULT_STROKE_WIDTH;
  }

  function buildLaserSvg(svgMarkup) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgMarkup, 'image/svg+xml');

    // Step 0: flatten nested svg first, so their transforms become explicit <g transform>
    flattenNestedSvg(doc);

    // Step 1: Convert remaining <text> (if any)
    convertTextNodesToLabelPaths(doc, getStrokeWidthFromUI());

    // Step 2: Bake all transforms for label paths (adaptive scaling/centering preserved)
    bakeAllLabelPathTransforms(doc);

    // Step 3: remove fills, normalize
    prepareSvgForLaser(doc);

    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  function ensureButtons() {
    var btn = document.getElementById('btnDownloadSVG');
    if (!btn) return;

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var svg = getCurrentSvgMarkup();
      if (!svg) return;
      downloadTextFile('preview.svg', svg);
    }, true);

    if (!document.getElementById('btnDownloadSVGLaser')) {
      var laserBtn = document.createElement('a');
      laserBtn.id = 'btnDownloadSVGLaser';
      laserBtn.className = btn.className;
      laserBtn.style.marginLeft = '8px';
      laserBtn.textContent = 'Download Laser SVG';
      btn.parentNode.insertBefore(laserBtn, btn.nextSibling);
    }

    var laserBtn2 = document.getElementById('btnDownloadSVGLaser');
    laserBtn2.addEventListener('click', function (ev) {
      ev.preventDefault();
      var svg = getCurrentSvgMarkup();
      if (!svg) return;
      var laserSvg = buildLaserSvg(svg);
      downloadTextFile('laser.svg', laserSvg);
    }, true);
  }

  function ensureStrokeWidthInput() {
    if (document.getElementById('txtSingleLineStrokeWidth')) return;
    var btn = document.getElementById('btnDownloadSVG');
    if (!btn) return;

    var wrapper = document.createElement('span');
    wrapper.style.marginLeft = '12px';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';

    var label = document.createElement('span');
    label.textContent = 'Laser stroke';
    label.style.fontSize = '12px';

    var input = document.createElement('input');
    input.id = 'txtSingleLineStrokeWidth';
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.05';
    input.value = String(DEFAULT_STROKE_WIDTH);
    input.style.width = '75px';
    input.style.margin = '0';

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    var laserBtn = document.getElementById('btnDownloadSVGLaser');
    var anchor = laserBtn || btn;
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      ensureButtons();
      ensureStrokeWidthInput();
    }, 250);
  });

})();
