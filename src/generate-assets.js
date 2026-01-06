const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const pngToIco = require('png-to-ico').default;

// --- CONFIGURATION ---

const SOURCE_FILE = path.join(__dirname, 'logo_transparent_master.png');
const OUTPUT_DIR = path.join(__dirname, '../smart3st-logo-kit');
const LOGO_FOLDER = '/Users/vquinones/Q Dropbox/Smart3st.com Inc/Marketing/Logos/Generated';

// Smart3st Inc Brand Colors
const BRAND_PRIMARY = '#8B5CF6';   // Purple (innovation, creativity)
const BRAND_SECONDARY = '#06B6D4'; // Cyan (tech, modern)
const BRAND_ACCENT = '#F59E0B';    // Amber (energy, smart)
const BRAND_DARK = '#1a1a2e';      // Deep Navy
const BRAND_WHITE = '#FFFFFF';

// Size Buckets (Web & Social)
const CONFIG = {
    web: [
        { w: 1200, h: 300, name: 'header' },
        { w: 800, h: 200, name: 'header-compact' },
        { w: 1200, h: 630, name: 'og' },
        { w: 192, h: 192, name: 'app-icon' },
        { w: 512, h: 512, name: 'app-icon' },
    ],
    social: [
        { w: 1080, h: 1080, name: 'instagram' },
        { w: 1080, h: 1080, name: 'facebook' },
        { w: 400, h: 400, name: 'linkedin' },
        { w: 400, h: 400, name: 'twitter' },
        { w: 800, h: 800, name: 'youtube' },
        { w: 200, h: 200, name: 'tiktok' },
    ],
    app: [
        { w: 1024, h: 1024, name: 'store' }
    ],
    favicon: [
        { w: 16, h: 16 },
        { w: 32, h: 32 },
        { w: 48, h: 48 },
    ]
};

// Variants
const VARIANTS = [
    { name: 'transparent', bg: null },
    { name: 'light', bg: BRAND_WHITE },
    { name: 'dark', bg: BRAND_DARK },
    { name: 'brand', bg: BRAND_PRIMARY },
];

const CONFIGURATION_NAME = 'full';

// --- UTILITY ---

const ensureDir = async (dirPath) => {
    try { await fs.ensureDir(dirPath); }
    catch (err) { console.error(`Error creating dir ${dirPath}:`, err); process.exit(1); }
};

const getFileName = (config, variant, platform, sizeName, width, height, ext) => {
    let variantStr = variant === 'transparent' ? `${config}` : `${config}_${variant}`;
    let finalPlatform = sizeName || platform;
    let sizeStr = (width === height) ? `${width}` : `${width}x${height}`;

    return `S3_${variantStr}_${finalPlatform}_${sizeStr}.${ext}`;
};

// --- MAIN ---

async function processImages() {
    console.log(`Starting Smart3st asset generation from ${SOURCE_FILE}...`);

    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found.`);
        console.log('Run "npm run isolate" first to create the transparent master.');
        process.exit(1);
    }

    // Prepare Dirs
    const contexts = ['web', 'social', 'app', 'favicon'];
    for (const ctx of contexts) {
        await ensureDir(path.join(OUTPUT_DIR, ctx));
    }

    // Also create output in Logos folder
    await ensureDir(LOGO_FOLDER);

    // Process Configs
    for (const [context, items] of Object.entries(CONFIG)) {
        if (context === 'favicon') continue;

        for (const item of items) {
            for (const variant of VARIANTS) {
                let formats = ['png', 'webp'];
                if (variant.bg) formats.push('jpg');

                for (const fmt of formats) {
                    const fileName = getFileName(CONFIGURATION_NAME, variant.name, context, item.name, item.w, item.h, fmt);
                    const outPath = path.join(OUTPUT_DIR, context, fileName);

                    let pipeline = sharp(SOURCE_FILE);

                    pipeline = pipeline.resize({
                        width: item.w,
                        height: item.h,
                        fit: sharp.fit.contain,
                        background: variant.bg || { r: 255, g: 255, b: 255, alpha: 0 }
                    });

                    if (variant.bg) {
                        pipeline = pipeline.flatten({ background: variant.bg });
                    } else {
                        pipeline = pipeline.ensureAlpha();
                    }

                    if (fmt === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
                    if (fmt === 'webp') pipeline = pipeline.webp({ quality: 90 });
                    if (fmt === 'jpg') pipeline = pipeline.jpeg({ quality: 90 });

                    await pipeline.toFile(outPath);
                    console.log(`Generated: ${fileName}`);
                }
            }
        }
    }

    // Favicons
    console.log('Processing favicons...');
    let icoFiles = [];

    for (const size of CONFIG.favicon) {
        const fileName = `S3_favicon_${size.w}.png`;
        const outPath = path.join(OUTPUT_DIR, 'favicon', fileName);

        await sharp(SOURCE_FILE)
            .resize(size.w, size.h, { fit: sharp.fit.contain, background: {r:0,g:0,b:0,alpha:0} })
            .png()
            .toFile(outPath);

        icoFiles.push(outPath);
        console.log(`Generated Favicon PNG: ${fileName}`);
    }

    try {
        const icoBuffer = await pngToIco(icoFiles);
        fs.writeFileSync(path.join(OUTPUT_DIR, 'favicon', 'favicon.ico'), icoBuffer);
        console.log('Generated: favicon.ico');
    } catch (e) {
        console.error('ICO Error:', e);
    }

    // Copy key assets to Logos folder
    console.log(`\nCopying key assets to ${LOGO_FOLDER}...`);
    const keyAssets = [
        path.join(OUTPUT_DIR, 'app', 'S3_full_store_1024.png'),
        path.join(OUTPUT_DIR, 'web', 'S3_full_og_1200x630.png'),
        path.join(OUTPUT_DIR, 'social', 'S3_full_instagram_1080.png'),
        path.join(OUTPUT_DIR, 'favicon', 'favicon.ico'),
    ];

    for (const asset of keyAssets) {
        if (fs.existsSync(asset)) {
            const destPath = path.join(LOGO_FOLDER, path.basename(asset));
            fs.copySync(asset, destPath);
            console.log(`Copied: ${path.basename(asset)} -> Logos/`);
        }
    }

    console.log(`\n✅ Smart3st asset generation complete!`);
    console.log(`   Output: ${OUTPUT_DIR}`);
    console.log(`   Logos: ${LOGO_FOLDER}`);
}

processImages().catch(console.error);
