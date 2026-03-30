const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const dirPath = path.join(__dirname, '../src/modules');

walkDir(dirPath, function(filePath) {
    if (filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Match: export const XModel = mongoose.model<IX>('X', xSchema);
        // Replace: export const XModel = mongoose.models.X || mongoose.model<IX>('X', xSchema) as any;
        const regex = /export const (\w+) = mongoose\.model<([^>]+)>\('([^']+)',\s*([^)]+)\);/g;
        if (regex.test(content)) {
            const newContent = content.replace(regex, "export const $1 = (mongoose.models.$3 || mongoose.model<$2>('$3', $4)) as mongoose.Model<$2>;");
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log('Fixed', filePath);
        }
    }
});
