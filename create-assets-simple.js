// Script simples para criar assets básicos
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Criar um arquivo README explicando que os assets precisam ser criados
const readme = `# Assets

Esta pasta deve conter os seguintes arquivos:

- icon.png (1024x1024) - Ícone do aplicativo
- splash.png (1284x2778) - Tela de splash
- adaptive-icon.png (1024x1024) - Ícone adaptativo Android
- favicon.png (48x48) - Favicon para web

Para desenvolvimento, você pode criar imagens simples ou usar placeholders.
O aplicativo funcionará mesmo sem esses arquivos, mas eles são recomendados para produção.
`;

fs.writeFileSync(path.join(assetsDir, 'README.md'), readme);
console.log('Pasta assets criada! Adicione os arquivos de imagem manualmente ou use placeholders.');
