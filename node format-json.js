const fs = require('fs');

// Lee tu archivo JSON original
const jsonContent = fs.readFileSync('smdm-484515-8000be1a5f81.json', 'utf8');

// Lo convierte a string escapado (en una sola línea)
const escapedJson = JSON.stringify(jsonContent);

console.log('Copia esto en tu .env:');
console.log('GOOGLE_APPLICATION_CREDENTIALS_JSON=' + escapedJson);