FROM node:20-bookworm

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Dependências do Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libasound2 \
    libxshmfence1 \
    libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# instala deps
COPY package*.json ./
RUN npm install

# instala browser
RUN npx playwright install chromium

# copia código
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]