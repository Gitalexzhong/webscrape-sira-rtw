// This file is used to copy the cleaned_providers.csv to the website/public directory for frontend access
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../cleaned_providers.csv');
const dest = path.join(__dirname, './public/cleaned_providers.csv');

fs.copyFileSync(src, dest);
console.log(
  'Copied cleaned_providers.csv to website/public/cleaned_providers.csv'
);
