const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../assets/Logo/logo.png');
const OUTPUT_FILE = path.join(__dirname, 'logo_transparent_master.png');

// Smart3st Inc logo location
const SMART3ST_LOGO = '/Users/vquinones/Q Dropbox/Smart3st.com Inc/Marketing/Logos/SMART3ST/400dpiLogo.png';

async function process() {
    // Try Smart3st logo first, then fall back to assets folder
    let sourceFile = INPUT_FILE;

    if (fs.existsSync(SMART3ST_LOGO)) {
        sourceFile = SMART3ST_LOGO;
        console.log(`Using existing Smart3st logo: ${SMART3ST_LOGO}`);
    } else if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Error: No logo found. Please place your logo at:`);
        console.error(`  - ${INPUT_FILE}`);
        console.error(`  - Or: ${SMART3ST_LOGO}`);
        process.exit(1);
    }

    console.log(`Processing ${sourceFile}...`);

    // 1. Get raw pixel data
    const { data, info } = await sharp(sourceFile)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = 4; // RGBA

    // Helper: Get pixel index
    const idx = (x, y) => (y * width + x) * channels;

    // Helper: Check if pixel is "White" (Background)
    const isWhite = (r, g, b) => r > 240 && g > 240 && b > 240;

    // Visited set for BFS
    const visited = new Uint8Array(width * height);

    // Queue for BFS
    let queue = [];
    let qHead = 0;

    // ---------------------------------------------------------
    // PHASE 1: Main Background Removal (Flood fill from edges)
    // ---------------------------------------------------------
    console.log("Phase 1: Removing surrounding background...");

    // Seed the queue with all border pixels that are white
    for (let x = 0; x < width; x++) {
        // Top edge
        let i = idx(x, 0);
        if (isWhite(data[i], data[i+1], data[i+2])) {
            queue.push({x, y:0});
            visited[0 * width + x] = 1;
        }
        // Bottom edge
        i = idx(x, height - 1);
        if (isWhite(data[i], data[i+1], data[i+2])) {
            queue.push({x, y:height-1});
            visited[(height - 1) * width + x] = 1;
        }
    }
    for (let y = 0; y < height; y++) {
        // Left edge
        let i = idx(0, y);
        if (isWhite(data[i], data[i+1], data[i+2]) && !visited[y * width + 0]) {
            queue.push({x:0, y});
            visited[y * width + 0] = 1;
        }
        // Right edge
        i = idx(width - 1, y);
        if (isWhite(data[i], data[i+1], data[i+2]) && !visited[y * width + width - 1]) {
            queue.push({x:width-1, y});
            visited[y * width + width - 1] = 1;
        }
    }

    // Run BFS
    while(qHead < queue.length) {
        const {x, y} = queue[qHead++];

        // Set Alpha to 0 (Transparent)
        const i = idx(x, y);
        data[i+3] = 0;

        // Check neighbors
        const neighbors = [
            {nx: x+1, ny: y},
            {nx: x-1, ny: y},
            {nx: x, ny: y+1},
            {nx: x, ny: y-1}
        ];

        for (const {nx, ny} of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const vIdx = ny * width + nx;
                if (visited[vIdx] === 0) {
                    const ni = idx(nx, ny);
                    if (isWhite(data[ni], data[ni+1], data[ni+2])) {
                        visited[vIdx] = 1;
                        queue.push({x: nx, y: ny});
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------
    // PHASE 2: Text Hole Removal (Islands)
    // ---------------------------------------------------------
    console.log("Phase 2: Scanning for text holes...");

    // Heuristic: Split line between Icon and Text
    const SPLIT_X = Math.floor(width * 0.30);

    queue = [];
    qHead = 0;

    const islandVisited = new Uint8Array(width * height);

    let keptIslands = 0;
    let removedIslands = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = idx(x, y);
            const vIdx = y * width + x;

            if (data[i+3] === 0) continue;
            if (!isWhite(data[i], data[i+1], data[i+2])) continue;
            if (islandVisited[vIdx] === 1) continue;

            // FOUND A NEW WHITE ISLAND
            let islandPixels = [];
            let minX = x, maxX = x;

            let localQueue = [{x, y}];
            islandVisited[vIdx] = 1;

            while(localQueue.length > 0) {
                const curr = localQueue.pop();
                islandPixels.push(curr);

                if (curr.x < minX) minX = curr.x;
                if (curr.x > maxX) maxX = curr.x;

                const neighbors = [
                    {nx: curr.x+1, ny: curr.y},
                    {nx: curr.x-1, ny: curr.y},
                    {nx: curr.x, ny: curr.y+1},
                    {nx: curr.x, ny: curr.y-1}
                ];

                for (const {nx, ny} of neighbors) {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const ni = idx(nx, ny);
                        const nVIdx = ny * width + nx;

                        if (data[ni+3] !== 0 &&
                            isWhite(data[ni], data[ni+1], data[ni+2]) &&
                            islandVisited[nVIdx] === 0) {

                            islandVisited[nVIdx] = 1;
                            localQueue.push({x: nx, y: ny});
                        }
                    }
                }
            }

            // Decide fate of island
            const centerX = (minX + maxX) / 2;

            if (centerX > SPLIT_X) {
                // Text Zone -> DELETE
                for (const p of islandPixels) {
                    const pi = idx(p.x, p.y);
                    data[pi+3] = 0;
                }
                removedIslands++;
            } else {
                // Icon Zone -> KEEP
                keptIslands++;
            }
        }
    }

    console.log(`Islands Processed: Kept ${keptIslands} (Icon), Removed ${removedIslands} (Text holes).`);

    // 3. Write output
    await sharp(data, { raw: { width, height, channels } })
        .png()
        .toFile(OUTPUT_FILE);

    console.log(`Saved transparent master to ${OUTPUT_FILE}`);
}

process().catch(console.error);
