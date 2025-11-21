// Script para criar assets placeholder
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Criar diretório se não existir
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Criar um SVG simples como icon (1024x1024)
const iconSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#1E88E5"/>
  <text x="512" y="512" font-family="Arial" font-size="400" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold">SAC</text>
</svg>`;

// Criar um SVG simples como splash (1284x2778 para mobile)
const splashSvg = `<svg width="1284" height="2778" xmlns="http://www.w3.org/2000/svg">
  <rect width="1284" height="2778" fill="#1E88E5"/>
  <text x="642" y="1389" font-family="Arial" font-size="120" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold">Sistema de Contagem</text>
  <text x="642" y="1550" font-family="Arial" font-size="80" fill="white" text-anchor="middle" dominant-baseline="middle">SAC</text>
</svg>`;

// Criar um SVG simples como favicon (48x48)
const faviconSvg = `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" fill="#1E88E5"/>
  <text x="24" y="24" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold">S</text>
</svg>`;

// Salvar arquivos SVG (que podem ser convertidos para PNG depois)
fs.writeFileSync(path.join(assetsDir, 'icon.svg'), iconSvg);
fs.writeFileSync(path.join(assetsDir, 'splash.svg'), splashSvg);
fs.writeFileSync(path.join(assetsDir, 'favicon.svg'), faviconSvg);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.svg'), iconSvg);

console.log('Assets SVG criados!');
console.log(
  'Nota: Para produção, converta os SVGs para PNG usando uma ferramenta como ImageMagick ou online converter.'
);
