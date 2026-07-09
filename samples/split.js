const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'large_leads.csv');
if (!fs.existsSync(filePath)) {
  console.error("large_leads.csv not found in " + __dirname);
  process.exit(1);
}

const data = fs.readFileSync(filePath, 'utf8');
const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
const header = lines[0];
const records = lines.slice(1);

const recordsPerFile = 100;
const numFiles = Math.ceil(records.length / recordsPerFile);

for (let i = 0; i < numFiles; i++) {
  const start = i * recordsPerFile;
  const end = Math.min(start + recordsPerFile, records.length);
  const partRecords = records.slice(start, end);
  const fileContent = [header, ...partRecords].join('\n');
  
  const outputFileName = `large_leads_part_${i + 1}.csv`;
  const outputPath = path.join(__dirname, outputFileName);
  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Created ${outputFileName} with ${partRecords.length} records.`);
}
