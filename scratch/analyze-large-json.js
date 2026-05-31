import fs from 'fs';
import path from 'path';

const targetPath = 'C:/Users/heppo/Downloads/web-collections-all (1).json';

console.log('Starting analysis of:', targetPath);

try {
    if (!fs.existsSync(targetPath)) {
        throw new Error('Target file does not exist at path: ' + targetPath);
    }

    const startTime = Date.now();
    const fileContent = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(fileContent);
    console.log('JSON parsed successfully in', Date.now() - startTime, 'ms');

    let totalItems = 0;
    const largeProperties = [];
    const keySizes = {};

    if (data.collections && Array.isArray(data.collections)) {
        console.log('Total collections found:', data.collections.length);

        for (const col of data.collections) {
            // コレクション自体のプロパティチェック
            for (const [key, val] of Object.entries(col)) {
                if (typeof val === 'string') {
                    const size = Buffer.byteLength(val, 'utf8');
                    largeProperties.push({
                        type: 'collection_metadata',
                        collectionId: col.id,
                        collectionName: col.name,
                        key,
                        size,
                        preview: val.substring(0, 100)
                    });
                    keySizes[key] = (keySizes[key] || 0) + size;
                }
            }

            if (col.items && Array.isArray(col.items)) {
                totalItems += col.items.length;
                for (const item of col.items) {
                    for (const [key, val] of Object.entries(item)) {
                        if (typeof val === 'string') {
                            const size = Buffer.byteLength(val, 'utf8');
                            largeProperties.push({
                                type: 'item_property',
                                collectionId: col.id,
                                collectionName: col.name,
                                itemId: item.id,
                                itemTitle: item.title || 'Untitled',
                                itemType: item.type,
                                key,
                                size,
                                preview: val.substring(0, 100)
                            });
                            keySizes[key] = (keySizes[key] || 0) + size;
                        }
                    }
                }
            }
        }
    }

    console.log('Total items processed:', totalItems);

    // サイズでソート
    largeProperties.sort((a, b) => b.size - a.size);

    console.log('\n--- KEY TYPE SIZE DISTRIBUTION ---');
    for (const [key, totalSize] of Object.entries(keySizes)) {
        console.log(`Key "${key}": ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    }

    console.log('\n--- TOP 15 LARGEST INDIVIDUAL PROPERTIES ---');
    const top15 = largeProperties.slice(0, 15);
    top15.forEach((p, idx) => {
        console.log(`\n[#${idx + 1}] Size: ${(p.size / 1024 / 1024).toFixed(2)} MB (${p.size} bytes)`);
        console.log(`  Type: ${p.type}`);
        console.log(`  Collection: ${p.collectionName}`);
        if (p.type === 'item_property') {
            console.log(`  Item: "${p.itemTitle}" (ID: ${p.itemId}, ItemType: ${p.itemType})`);
        }
        console.log(`  Property Key: "${p.key}"`);
        console.log(`  Preview: ${p.preview}...`);
    });

} catch (err) {
    console.error('Analysis failed:', err.message);
}
