# Použijeme oficiálny Node.js obraz (ľahkú alpine verziu)
FROM node:18-alpine

# Nastavíme pracovný adresár vnútri kontajnera
WORKDIR /usr/src/app

# Najprv skopírujeme len package.json a package-lock.json
COPY package*.json ./

# Nainštalujeme závislosti
RUN npm install --production

# Skopírujeme zvyšok zdrojového kódu backendu
COPY . .

# Vystavíme port (ZMEŇ 3000 NA PORT, KTORÝ POUŽÍVA TVOJ server.js)
EXPOSE 3000

# Spustíme aplikáciu
CMD ["node", "server.js"]