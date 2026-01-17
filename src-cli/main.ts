import * as fs from 'fs';
import * as path from 'path';
import { PaintByNumbers } from "../src/paintbynumbers";
import { Settings } from "../src/structs/settings";

// Helper to calculate polygon area
function calculatePolygonArea(path: { x: number, y: number }[]) {
    let area = 0;
    for (let i = 0; i < path.length; i++) {
        let j = (i + 1) % path.length;
        area += path[i].x * path[j].y;
        area -= path[j].x * path[i].y;
    }
    return Math.abs(area / 2);
}

// Helper to find the nearest alias color if exact match fails
function findMatchingAlias(r: number, g: number, b: number, settings: Settings): number[] | null {
    if (!settings.colorAliases) return null;

    // 1. Check for exact RGB match first
    for (const key in settings.colorAliases) {
        const alias = settings.colorAliases[key];
        if (alias[0] === r && alias[1] === g && alias[2] === b) {
            return alias;
        }
    }

    // 2. If Restrictions are on, snap to the closest restricted color
    // (This ensures the report shows the color you WANTED, not the calculated average)
    if (settings.kMeansColorRestrictions && settings.kMeansColorRestrictions.length > 0) {
        let minDistance = Infinity;
        let bestMatch = null;

        for (const key of settings.kMeansColorRestrictions) {
            let targetColor: number[] = [];
            
            // Handle if restriction is a name (Reference to alias) or raw RGB
            if (typeof key === 'string' && settings.colorAliases[key]) {
                targetColor = settings.colorAliases[key];
            } else if (Array.isArray(key)) {
                targetColor = key as number[];
            } else {
                continue;
            }

            const dist = Math.sqrt(
                Math.pow(targetColor[0] - r, 2) +
                Math.pow(targetColor[1] - g, 2) +
                Math.pow(targetColor[2] - b, 2)
            );

            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = targetColor;
            }
        }
        
        // If the calculated cluster is reasonably close to a restriction, return the restriction
        if (minDistance < 30) { // Tolerance threshold
            return bestMatch;
        }
    }

    return null;
}

const main = () => {
    // ... (Arguments parsing logic remains similar, simplified here for brevity)
    let inputFile = "";
    let outputFile = "output.svg";
    let settingsFile = "settings.json";

    // specific args parsing wrapper
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-i") inputFile = args[i + 1];
        if (args[i] === "-o") outputFile = args[i + 1];
        if (args[i] === "-c") settingsFile = args[i + 1];
    }

    if (!inputFile) {
        console.log("Usage: node src-cli/main.js -i input.png -o output.svg -c settings.json");
        return;
    }

    // Load Settings
    let settings: Settings = {};
    if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }

    console.log(`Processing ${inputFile}...`);
    
    // Initialize PBN
    const pbn = new PaintByNumbers();
    pbn.load(inputFile).then(() => {
        // Run the main processing
        pbn.process(settings);

        // --- NEW REPORT GENERATION LOGIC ---
        const facets = pbn.getFacets();
        const clusters = pbn.getClusters(); // These are the calculated centroids
        const reportData: any = {};
        let totalArea = 0;

        // 1. Calculate stats based on FINAL FACETS (not initial pixels)
        for (const facet of facets) {
            // Facet contains: id, color (index), path (points)
            if (facet === null) continue; // Skip removed facets
            
            const area = calculatePolygonArea(facet.path);
            const colorIdx = facet.color;

            if (!reportData[colorIdx]) {
                reportData[colorIdx] = {
                    index: colorIdx,
                    color: clusters[colorIdx].color, // Default to calculated
                    frequency: 0, // We will use area instead of pixel count for accuracy
                    totalFacetArea: 0
                };
            }
            reportData[colorIdx].totalFacetArea += area;
            totalArea += area;
        }

        // 2. Prepare Final List and Match Aliases
        const finalReport = Object.values(reportData).map((item: any) => {
            const r = item.color[0];
            const g = item.color[1];
            const b = item.color[2];

            // Try to find the user-defined alias that matches this cluster
            const aliasColor = findMatchingAlias(r, g, b, settings);

            return {
                index: item.index,
                // Use the Alias RGB if found, otherwise keep the calculated centroid
                color: aliasColor ? aliasColor : [r, g, b], 
                frequency: Math.round(item.totalFacetArea), // Using area as frequency
                areaPercentage: item.totalFacetArea / totalArea
            };
        });

        // Sort by index
        finalReport.sort((a, b) => a.index - b.index);

        // Save Report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportName = `report.${timestamp}.json`;
        fs.writeFileSync(reportName, JSON.stringify(finalReport, null, 2));
        console.log(`Report saved to ${reportName}`);

        // Save Output (SVG/PNG)
        if (outputFile.endsWith(".json")) {
            // If user asked for JSON output via CLI args, save it there too
            fs.writeFileSync(outputFile, JSON.stringify(finalReport, null, 2));
        } else {
            // Save the visual result
            // Note: You might need to adjust this depending on how you handle output profiles
            const profile = settings.outputProfiles ? settings.outputProfiles[0] : null;
            if (profile) {
                // Use profile saving logic if available in your class
                // pbn.save(outputFile, profile); 
                // Or simplified default SVG save:
                 fs.writeFileSync(outputFile, pbn.getSVG(settings));
            } else {
                 fs.writeFileSync(outputFile, pbn.getSVG(settings));
            }
        }
        console.log(`Output saved to ${outputFile}`);
    });
};

main();