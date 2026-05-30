import fs from 'fs';

const jsonPath = 'i:/マイドライブ/DEV/web-collections-extension/web-collections-all.json';

try {
    const fileContent = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(fileContent);
    
    console.log('Collections count:', data.collections ? data.collections.length : 0);
    
    let imageItemCount = 0;
    let webpageItemCount = 0;
    
    const sampleItems = [];
    
    if (data.collections) {
        for (const col of data.collections) {
            if (col.items) {
                for (const item of col.items) {
                    if (item.type === 'image') {
                        imageItemCount++;
                        if (sampleItems.length < 5) {
                            sampleItems.push({ collectionName: col.name, item });
                        }
                    } else if (item.type === 'webpage') {
                        webpageItemCount++;
                        // webpageでimageUrlを持っているか確認
                        if (item.imageUrl && sampleItems.length < 10) {
                            sampleItems.push({ collectionName: col.name, type: 'webpage_with_img', item });
                        }
                    }
                }
            }
        }
    }
    
    console.log('Total image items:', imageItemCount);
    console.log('Total webpage items:', webpageItemCount);
    console.log('Sample items to analyze structure:');
    console.log(JSON.stringify(sampleItems, null, 2));
    
} catch (error) {
    console.error('Error analyzing data:', error);
}
