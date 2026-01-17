/*
 * PaintByNumbersGenerator – Runtime PDF Mixing Guide v2.3 (Unified Sorting)
 * 
 * Updates:
 * - Table 1 (Summary) is now sorted by Pigment Families (same as Mixing Guide).
 * - Added 'RGB' and 'Area' columns to Table 1 (matching your screenshot).
 * - Included Group Headers in Table 1 for better overview.
 */

(() => {
    'use strict';

    // --- CONFIGURATION ---
    const CONFIG = {
        ML_PER_CM2: 0.05, 
        WHITE_RATIO_CYAN: 0.25,
        WHITE_RATIO_MAGENTA: 0.25,
        WHITE_RATIO_YELLOW: 0.5,
        WHITE_RATIO_BLACK: 0.93 
    };

    // --- HELPER: RGB to CMYK+W ---
    function rgbToCmykW(r, g, b) {
        let r_n = r / 255;
        let g_n = g / 255;
        let b_n = b / 255;

        let k = 1 - Math.max(r_n, g_n, b_n);
        let c = (1 - r_n - k) / (1 - k) || 0;
        let m = (1 - g_n - k) / (1 - k) || 0;
        let y = (1 - b_n - k) / (1 - k) || 0;

        let w = Math.max(r_n, g_n, b_n) - (1 - k) * Math.max(c, m, y);
        w = Math.max(0, Math.min(1, w));

        return { c, m, y, k, w };
    }

    function calculateBaseRatios(rgb) {
        let { c, m, y, k, w } = rgbToCmykW(rgb[0], rgb[1], rgb[2]);

        if (c > 0 && m < 0.01 && y < 0.01 && k < 0.01) {
            let new_c = c * CONFIG.WHITE_RATIO_CYAN;
            w = w + c * (1 - CONFIG.WHITE_RATIO_CYAN);
            c = new_c;
        }
        k = k * (1 - CONFIG.WHITE_RATIO_BLACK); 
        
        let sum = c + m + y + k + w;
        if (sum > 0) {
            return { c: c/sum, m: m/sum, y: y/sum, k: k/sum, w: w/sum };
        }
        return { c:0, m:0, y:0, k:0, w:1 };
    }

    // --- COLOR GROUPING (Pigment Pairs) ---
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max == min) { h = s = 0; } 
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s, l };
    }

    function getColorGroup(rgb) {
        const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        if (hsl.s < 0.12) {
            return { name: "Black / White / Grayscale", id: 0 };
        }

        let r_n = rgb[0] / 255;
        let g_n = rgb[1] / 255;
        let b_n = rgb[2] / 255;
        let k = 1 - Math.max(r_n, g_n, b_n);
        let c = (1 - r_n - k) / (1 - k) || 0;
        let m = (1 - g_n - k) / (1 - k) || 0;
        let y = (1 - b_n - k) / (1 - k) || 0;

        const scoreCY = c + y; 
        const scoreCM = c + m; 
        const scoreYM = y + m; 

        if (scoreCY >= scoreCM && scoreCY >= scoreYM) {
            return { name: "Cyan + Yellow (Greens)", id: 10 };
        }
        if (scoreCM >= scoreCY && scoreCM >= scoreYM) {
            return { name: "Cyan + Magenta (Blues/Purples)", id: 20 };
        }
        
        return { name: "Yellow + Magenta (Reds/Oranges)", id: 30 };
    }

    // --- MAIN PDF GENERATION ---
    async function generatePDF() {
        try {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                alert("Error: jsPDF library not found!");
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // 1. Gather Data
            const targetSize = (window.__pbnGetTargetSizeMm && window.__pbnGetTargetSizeMm()) || { w: 800, h: 600 };
            const totalAreaCm2 = (targetSize.w / 10) * (targetSize.h / 10);
            
            const canvas = document.getElementById('cReduction');
            if(!canvas) { alert("Please process image first."); return; }
            
            const ctx = canvas.getContext('2d');
            const pixelData = ctx.getImageData(0,0, canvas.width, canvas.height).data;
            const colorCounts = {}; 
            let totalPixels = 0;
            
            for(let i=0; i<pixelData.length; i+=4) {
                if(pixelData[i+3] < 128) continue;
                const key = `${pixelData[i]},${pixelData[i+1]},${pixelData[i+2]}`;
                colorCounts[key] = (colorCounts[key] || 0) + 1;
                totalPixels++;
            }

            const paletteItems = Array.from(document.querySelectorAll('#palette .color'));
            const paletteData = [];

            paletteItems.forEach(item => {
                const id = parseInt(item.innerText);
                let bgStr = item.getAttribute('data-orig-bg') || item.style.backgroundColor;
                let r=0,g=0,b=0;
                
                if(bgStr.startsWith('#')) {
                    r = parseInt(bgStr.substring(1,3), 16);
                    g = parseInt(bgStr.substring(3,5), 16);
                    b = parseInt(bgStr.substring(5,7), 16);
                } else {
                    const parts = bgStr.match(/\d+/g);
                    if(parts) { r=+parts[0]; g=+parts[1]; b=+parts[2]; }
                }

                const key = `${r},${g},${b}`;
                const count = colorCounts[key] || 0;
                const ratio = count > 0 ? (count / totalPixels) : (1 / (paletteItems.length || 1));
                const grams = Math.max(0.5, (totalAreaCm2 * ratio) * CONFIG.ML_PER_CM2);
                
                const group = getColorGroup([r,g,b]);
                const hsl = rgbToHsl(r,g,b);

                // Calculate absolute component weights for table
                const ratios = calculateBaseRatios([r,g,b]);
                const absC = ratios.c * grams;
                const absM = ratios.m * grams;
                const absY = ratios.y * grams;
                const absK = ratios.k * grams;
                const absW = ratios.w * grams;

                paletteData.push({
                    id: id,
                    rgb: [r,g,b],
                    grams: grams,
                    area: totalAreaCm2 * ratio,
                    ratios: ratios,
                    components: { c: absC, m: absM, y: absY, k: absK, w: absW },
                    group: group,
                    lightness: hsl.l
                });
            });

            // 2. Sort: Group ID first, then Lightness High->Low
            paletteData.sort((a,b) => {
                if (a.group.id !== b.group.id) return a.group.id - b.group.id;
                return b.lightness - a.lightness; 
            });

            // --- PAGE 1: DETAILED LIST (Sorted by Group) ---
            doc.setFontSize(18);
            doc.text("Material Report & Palette", 14, 20);
            doc.setFontSize(10);
            doc.text(`Target: ${targetSize.w}mm x ${targetSize.h}mm | Area: ${totalAreaCm2.toFixed(0)} cm²`, 14, 28);
            
            // Prepare Table 1 Data
            let table1Body = [];
            let lastGroupId1 = -1;

            paletteData.forEach(p => {
                if(p.group.id !== lastGroupId1) {
                    table1Body.push([{content: p.group.name, colSpan: 10, styles: {fillColor: [220, 220, 220], fontStyle: 'bold', textColor: 0}}]);
                    lastGroupId1 = p.group.id;
                }
                
                table1Body.push([
                    p.id,
                    `${p.rgb[0]},${p.rgb[1]},${p.rgb[2]}`,
                    "", // Color Box
                    p.area.toFixed(1),
                    p.grams.toFixed(2),
                    p.components.c > 0.01 ? p.components.c.toFixed(2) : "-",
                    p.components.m > 0.01 ? p.components.m.toFixed(2) : "-",
                    p.components.y > 0.01 ? p.components.y.toFixed(2) : "-",
                    p.components.k > 0.01 ? p.components.k.toFixed(2) : "-",
                    p.components.w > 0.01 ? p.components.w.toFixed(2) : "-"
                ]);
            });

            doc.autoTable({
                startY: 35,
                head: [['ID', 'RGB', 'Ref', 'Area cm²', 'Total g', 'C', 'M', 'Y', 'K', 'W']],
                body: table1Body,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { fontStyle: 'bold', halign: 'center' },
                    1: { fontSize: 7, textColor: 100 },
                    2: { cellWidth: 12 },
                    3: { halign: 'right' },
                    4: { fontStyle: 'bold', halign: 'right' },
                    5: { halign: 'right', textColor: [0, 150, 150] },
                    6: { halign: 'right', textColor: [150, 0, 150] },
                    7: { halign: 'right', textColor: [150, 150, 0] },
                    8: { halign: 'right' },
                    9: { halign: 'right', textColor: 100 }
                },
                didDrawCell: (data) => {
                    if (data.section === 'body' && data.column.index === 2) {
                        // Locate original color (Need to account for header rows being in the data array but not in paletteData directly)
                        // We map via ID in column 0
                        const id = data.row.raw[0];
                        // If it's a header row, raw[0] is an object, not an ID
                        if (typeof id === 'number') {
                            const color = paletteData.find(x => x.id === id);
                            if(color) {
                                const dim = data.cell.height - 4;
                                doc.setFillColor(color.rgb[0], color.rgb[1], color.rgb[2]);
                                doc.rect(data.cell.x + 2, data.cell.y + 2, dim, dim, 'F');
                                doc.setDrawColor(0);
                                doc.rect(data.cell.x + 2, data.cell.y + 2, dim, dim, 'S');
                            }
                        }
                    }
                }
            });

            // --- PAGE 2+: MIXING INSTRUCTIONS ---
            doc.addPage();
            doc.setFontSize(18);
            doc.text("Cumulative Mixing Guide", 14, 20);
            doc.setFontSize(10);
            doc.text("Work flow: Mix the lightest color (Start Pot), use it, then darken the remainder.", 14, 28);

            let currentGroupId = -1;
            let currentGroupItems = [];
            let tableRows = [];

            const processGroup = (groupName, items) => {
                if(items.length === 0) return;

                tableRows.push([{content: `--- ${groupName} ---`, colSpan: 3, styles: {fillColor: [230, 230, 230], fontStyle: 'bold', textColor: 0}}]);

                let currentPotMass = items.reduce((sum, item) => sum + item.grams, 0);
                let currentPotRatios = null;

                for(let i=0; i<items.length; i++) {
                    const item = items[i];
                    
                    // --- MIXING STEP ---
                    if (i === 0) {
                        const mixW = item.ratios.w * currentPotMass;
                        const mixC = item.ratios.c * currentPotMass;
                        const mixM = item.ratios.m * currentPotMass;
                        const mixY = item.ratios.y * currentPotMass;
                        const mixK = item.ratios.k * currentPotMass;
                        
                        let recipe = [];
                        if(mixW > 0.1) recipe.push(`White ${mixW.toFixed(1)}g`);
                        if(mixY > 0.1) recipe.push(`Yellow ${mixY.toFixed(1)}g`);
                        if(mixC > 0.1) recipe.push(`Cyan ${mixC.toFixed(1)}g`);
                        if(mixM > 0.1) recipe.push(`Magenta ${mixM.toFixed(1)}g`);
                        if(mixK > 0.01) recipe.push(`Black ${mixK.toFixed(2)}g`);

                        tableRows.push([
                            `Start Pot`, 
                            { content: "", styles: {fillColor: [255, 255, 255]}}, 
                            `Mix Base (Total ${currentPotMass.toFixed(1)}g):\n${recipe.join(" + ")}`
                        ]);
                        currentPotRatios = item.ratios;
                    } else {
                        let deltaStr = [];
                        
                        const calcDelta = (key, name) => {
                            const target = item.ratios[key];
                            const current = currentPotRatios[key];
                            
                            if (target > current + 0.001) {
                                const safeTarget = Math.min(target, 0.95); 
                                let amountToAdd = currentPotMass * (target - current) / (1 - safeTarget);
                                if (amountToAdd > 0.05) {
                                    deltaStr.push(`${name} +${amountToAdd.toFixed(2)}g`);
                                    currentPotMass += amountToAdd; 
                                }
                            }
                        };
                        
                        calcDelta('y', 'Yellow');
                        calcDelta('c', 'Cyan');
                        calcDelta('m', 'Magenta');
                        calcDelta('k', 'Black');
                        
                        if (deltaStr.length > 0) {
                            tableRows.push([
                                `Adjust`, 
                                { content: ">>>", styles: {halign: 'center', fontStyle: 'bold', textColor: [200,0,0]}}, 
                                `Add to pot: ${deltaStr.join(", ")}`
                            ]);
                        } else {
                             tableRows.push([`Adjust`, "", `(Use current pot)`]);
                        }
                        currentPotRatios = item.ratios;
                    }
                    
                    // --- USAGE STEP ---
                    tableRows.push([
                        `Use ID ${item.id}`, 
                        { content: "", styles: {fillColor: item.rgb}}, 
                        `Take out ${item.grams.toFixed(1)}g`
                    ]);

                    currentPotMass -= item.grams;
                }
            };

            paletteData.forEach(item => {
                if (item.group.id !== currentGroupId) {
                    processGroup(currentGroupItems.length > 0 ? currentGroupItems[0].group.name : "", currentGroupItems);
                    currentGroupItems = [];
                    currentGroupId = item.group.id;
                }
                currentGroupItems.push(item);
            });
            processGroup(currentGroupItems.length > 0 ? currentGroupItems[0].group.name : "", currentGroupItems);

            doc.autoTable({
                startY: 40,
                head: [['Step', 'Ref', 'Instruction']],
                body: tableRows,
                theme: 'grid',
                columnStyles: {
                    0: { fontStyle: 'bold', width: 25 },
                    1: { width: 15 },
                    2: { width: 'auto' }
                },
                didDrawCell: (data) => {
                    if (data.section === 'body' && data.column.index === 1) {
                        const idMatch = data.row.raw[0].toString().match(/Use ID (\d+)/);
                        if (idMatch) {
                            const id = parseInt(idMatch[1]);
                            const color = paletteData.find(x => x.id === id);
                            if(color) {
                                const dim = data.cell.height - 4;
                                doc.setFillColor(color.rgb[0], color.rgb[1], color.rgb[2]);
                                doc.rect(data.cell.x + 2, data.cell.y + 2, dim, dim, 'F');
                            }
                        }
                    }
                }
            });

            doc.save("PBN_Guide_v2.pdf");

        } catch(err) {
            console.error(err);
            alert("Error: " + err.message);
        }
    }

    // --- UI INJECTION ---
    function replaceDownloadButton() {
        const oldBtn = document.getElementById('btnDownloadPalettePNG');
        if (!oldBtn && !document.getElementById('btnDownloadPDF')) return;
        
        const existing = document.getElementById('btnDownloadPDF');
        const target = existing || oldBtn;
        
        const newBtn = target.cloneNode(true);
        target.parentNode.replaceChild(newBtn, target);

        newBtn.id = "btnDownloadPDF";
        newBtn.textContent = "Download Mixing Guide (PDF)";
        newBtn.className = "waves-effect waves-light btn"; 
        newBtn.style.backgroundColor = "#e91e63"; 
        newBtn.style.width = "100%"; 
        
        newBtn.onclick = null;
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            generatePDF();
        });
    }

    function init() {
        const check = setInterval(() => {
            const panel = document.getElementById('pbnRecolorPanel');
            if(panel) {
                clearInterval(check);
                if(!document.getElementById('btnDownloadPDF')) {
                    const div = document.createElement('div');
                    div.style.marginTop = "15px";
                    div.style.textAlign = "center";
                    const btn = document.createElement('a');
                    btn.id = "btnDownloadPDF"; 
                    div.appendChild(btn);
                    panel.appendChild(div);
                    replaceDownloadButton();
                }
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();