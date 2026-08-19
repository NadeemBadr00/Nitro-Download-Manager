const fs = require('fs');
const path = require('path');

const target = 'C:/Users/DELL/Downloads/urn_li_activity_7490443995035320320';
if (fs.existsSync(target)) {
    const buf = fs.readFileSync(target);
    console.log('Size:', buf.length);
    console.log('Hex Header:', buf.slice(0, 16).toString('hex'));
    console.log('ASCII Header:', buf.slice(0, 32).toString('latin1'));

    // Check if MP4 (contains 'ftyp' or 'moov' or starts with ftyp)
    const isMp4 = buf.slice(4, 8).toString('latin1') === 'ftyp' || buf.includes(Buffer.from('ftyp'));
    console.log('Is MP4:', isMp4);

    if (isMp4) {
        const newPath = target + '.mp4';
        fs.renameSync(target, newPath);
        console.log('Renamed to:', newPath);
    }
}
